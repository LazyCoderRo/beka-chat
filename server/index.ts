import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Readable } from 'stream';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const LM_STUDIO_ENDPOINT_RAW = process.env.LM_STUDIO_ENDPOINT || 'http://192.168.1.134:1234/api/v1';
const AVATAR_OPTIONS = Array.from({ length: 12 }, (_, i) => `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${i + 1}`);

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

function normalizeLMStudioEndpoint(raw: string): string {
    const base = trimTrailingSlash(raw);
    if (/\/api\/v1$/i.test(base)) {
        return base;
    }
    return `${base}/api/v1`;
}

const LM_STUDIO_ENDPOINT = normalizeLMStudioEndpoint(LM_STUDIO_ENDPOINT_RAW);
console.log(`[CONFIG] LM_STUDIO_ENDPOINT=${LM_STUDIO_ENDPOINT}`);

function pickRandomAvatarUrl(): string {
    return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
}

async function ensureUserHasAvatar(userId: number): Promise<void> {
    const { rows } = await pool.query('SELECT avatarurl FROM users WHERE id = $1', [userId]);
    const currentAvatar = rows[0]?.avatarurl;
    if (currentAvatar) return;

    await pool.query('UPDATE users SET avatarurl = $1 WHERE id = $2', [pickRandomAvatarUrl(), userId]);
}

// ─── Model Management ───────────────────────────────────────────────────────
interface ModelState {
    id: string;
    lastUsedAt: number;
    idleTimeMinutes: number;
    notified30s: boolean;
}

const modelStates = new Map<string, ModelState>();

async function getSetting(key: string, defaultValue: any) {
    try {
        const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
        return rows.length > 0 ? JSON.parse(rows[0].value) : defaultValue;
    } catch (err) {
        return defaultValue;
    }
}

async function unloadModelOnLMStudio(modelId: string) {
    const endpoint = LM_STUDIO_ENDPOINT;
    try {
        console.log(`[IDLE] Auto-unloading idle model: ${modelId}`);
        const response = await fetch(`${endpoint}/models/unload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: modelId })
        });
        if (!response.ok) {
            console.error(`[IDLE] Failed to unload model ${modelId}: ${response.statusText}`);
        }
    } catch (error) {
        console.error(`[IDLE] Error unloading model ${modelId}:`, error);
    }
}

// Background idle check every 5 seconds
setInterval(async () => {
    const now = Date.now();
    for (const [modelId, state] of modelStates.entries()) {
        const idleSeconds = state.idleTimeMinutes * 60;
        const elapsedSeconds = (now - state.lastUsedAt) / 1000;
        const remaining = idleSeconds - elapsedSeconds;

        if (remaining <= 0) {
            console.log(`[IDLE] Model ${modelId} reached idle timeout. Triggering unload.`);
            modelStates.delete(modelId);
            await unloadModelOnLMStudio(modelId);
        } else if (remaining < 30 && !state.notified30s) {
            console.log(`[IDLE] Model ${modelId} is nearing unload (< 30s remaining). Notification context prepared.`);
            state.notified30s = true;
        } else if (remaining >= 30 && state.notified30s) {
            // Reset notification flag if heartbeat received
            state.notified30s = false;
        }
    }
}, 5000);

// Sync with LM Studio to track any "orphan" loaded models
async function syncLoadedModels() {
    const endpoint = LM_STUDIO_ENDPOINT;
    const defaultIdle = await getSetting('defaultIdleTimeMinutes', 60);
    
    try {
        const response = await fetch(`${endpoint}/models`);
        if (response.ok) {
            const data = await response.json() as { models?: Array<{ key: string; id: string; loaded_instances?: any[] }> };
            const loadedOnLM = (data.models || [])
                .filter(m => Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0)
                .map(m => m.key || m.id);

            for (const modelId of loadedOnLM) {
                if (!modelStates.has(modelId)) {
                    console.log(`[IDLE] Found untracked loaded model: ${modelId}. Adding to idle management (timeout: ${defaultIdle}m).`);
                    modelStates.set(modelId, {
                        id: modelId,
                        lastUsedAt: Date.now(),
                        idleTimeMinutes: defaultIdle,
                        notified30s: false
                    });
                }
            }
        }
    } catch (err) {
        // Silent error for sync
    }
}

setInterval(syncLoadedModels, 30000); // Sync every 30 seconds

// ─── Database Initialization ───────────────────────────────────────────────
async function initDB() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      avatarUrl VARCHAR(255),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(255) UNIQUE NOT NULL,
      value TEXT NOT NULL
    );
  `);

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@admin.ro']);
    if (rows.length === 0) {
        const hash = await bcrypt.hash('admin', 10);
        await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
            ['admin', 'admin@admin.ro', hash, 'admin']
        );
        console.log('Created default admin@admin.ro user.');
    }
}

initDB().catch(err => console.error('DB init error:', err));

const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// ─── Auth Endpoints ─────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const avatarUrl = pickRandomAvatarUrl();
        const result = await pool.query(
            'INSERT INTO users (name, email, password, avatarurl) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, avatarurl as "avatarUrl", createdat as "createdAt"',
            [name, email, hash, avatarUrl]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user, token });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let result;
        if (email === 'admin') {
            result = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@admin.ro']);
        } else {
            result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        }

        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: 'User not found' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid password' });

        await ensureUserHasAvatar(user.id);
        const sanitized = await pool.query(
            'SELECT id, name, email, role, avatarurl as "avatarUrl", createdat as "createdAt" FROM users WHERE id = $1',
            [user.id]
        );
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user: sanitized.rows[0], token });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
    try {
        await ensureUserHasAvatar(req.user.id);
        const result = await pool.query('SELECT id, name, email, role, avatarurl as "avatarUrl", createdat as "createdAt" FROM users WHERE id = $1', [req.user.id]);
        res.json({ user: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/auth/profile', authenticateToken, async (req: any, res) => {
    try {
        let { name, email, password, avatarUrl } = req.body;
        const updates = [];
        const values = [];
        let index = 1;

        if (name) {
            updates.push(`name = $${index++}`);
            values.push(name);
        }
        if (email) {
            updates.push(`email = $${index++}`);
            values.push(email);
        }
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            updates.push(`password = $${index++}`);
            values.push(hash);
        }
        if (avatarUrl !== undefined) {
            updates.push(`avatarurl = $${index++}`);
            values.push(avatarUrl);
        }

        if (updates.length > 0) {
            values.push(req.user.id);
            await pool.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${index}`,
                values
            );
        }

        const result = await pool.query('SELECT id, name, email, role, avatarurl as "avatarUrl", createdat as "createdAt" FROM users WHERE id = $1', [req.user.id]);
        res.json({ user: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Settings Endpoints ─────────────────────────────────────────────────────
app.get('/api/admin/settings', async (req, res) => {
    try {
        const result = await pool.query("SELECT key, value FROM app_settings");
        const settings = result.rows.reduce((acc, row) => ({ ...acc, [row.key]: JSON.parse(row.value) }), {});
        delete (settings as Record<string, unknown>).lmStudioEndpoint;
        delete (settings as Record<string, unknown>).perplexicaEndpoint;
        res.json(settings);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/settings', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    try {
        const settings = req.body || {};
        delete settings.lmStudioEndpoint;
        delete settings.perplexicaEndpoint;

        for (const [key, value] of Object.entries(settings)) {
            await pool.query(
                'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
                [key, JSON.stringify(value)]
            );
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/users', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    try {
        const result = await pool.query(
            `SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                u.avatarurl as "avatarUrl",
                u.createdat as "createdAt",
                (
                    SELECT COUNT(*)
                    FROM sessions s
                    WHERE s.user_id = u.id
                )::int as "sessionCount"
            FROM users u
            ORDER BY u.createdat DESC`
        );
        res.json({ users: result.rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/users/:id/sessions', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    const targetId = parseInt(req.params.id, 10);
    if (!targetId || Number.isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }

    try {
        const result = await pool.query(
            'SELECT id, data, updated_at FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC',
            [targetId]
        );

        const sessions = result.rows.map((row: any) => {
            const data = row.data || {};
            const messages = Array.isArray(data.messages) ? data.messages : [];
            return {
                id: row.id,
                title: data.title || 'Untitled Chat',
                preview: data.preview || '',
                updatedAt: data.updatedAt || row.updated_at,
                messageCount: messages.length
            };
        });

        res.json({ sessions });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/users/:id/sessions/:sessionId', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    const targetId = parseInt(req.params.id, 10);
    if (!targetId || Number.isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }

    try {
        const result = await pool.query(
            'SELECT id, data FROM sessions WHERE user_id = $1 AND id = $2 LIMIT 1',
            [targetId, req.params.sessionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const row = result.rows[0];
        res.json({ session: { ...row.data, id: row.id } });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id/role', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    const targetId = parseInt(req.params.id, 10);
    const { role } = req.body || {};

    if (!targetId || Number.isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    if (role !== 'admin' && role !== 'user') {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        const updated = await pool.query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, avatarurl as "avatarUrl", createdat as "createdAt"',
            [role, targetId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user: updated.rows[0] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    const targetId = parseInt(req.params.id, 10);
    if (!targetId || Number.isNaN(targetId)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    if (targetId === req.user.id) {
        return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    try {
        const deleted = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [targetId]);
        if (deleted.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── LM Studio Proxy Endpoints ──────────────────────────────────────────────
app.get('/api/lmstudio/models', async (req, res) => {
    try {
        const endpoint = LM_STUDIO_ENDPOINT;
        const upstream = await fetch(`${endpoint}/models`);
        const contentType = upstream.headers.get('content-type') || 'application/json';
        const text = await upstream.text();
        res.status(upstream.status).type(contentType).send(text);
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to fetch models from LM Studio' });
    }
});

app.post('/api/lmstudio/models/load', async (req, res) => {
    try {
        const endpoint = LM_STUDIO_ENDPOINT;
        const upstream = await fetch(`${endpoint}/models/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });
        const contentType = upstream.headers.get('content-type') || 'application/json';
        const text = await upstream.text();
        res.status(upstream.status).type(contentType).send(text);
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to load model on LM Studio' });
    }
});

app.post('/api/lmstudio/chat', async (req, res) => {
    try {
        const endpoint = LM_STUDIO_ENDPOINT;
        const upstream = await fetch(`${endpoint}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {})
        });

        const contentType = upstream.headers.get('content-type') || 'application/json';
        res.status(upstream.status);
        res.setHeader('Content-Type', contentType);

        if (!upstream.body) {
            const text = await upstream.text();
            res.send(text);
            return;
        }

        Readable.fromWeb(upstream.body as any).pipe(res);
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to proxy chat request to LM Studio' });
    }
});

// ─── Session Endpoints ──────────────────────────────────────────────────────
app.get('/api/sessions', authenticateToken, async (req: any, res) => {
    try {
        const result = await pool.query('SELECT id, data FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]);
        const sessions = result.rows.map(r => ({ ...r.data, id: r.id }));
        res.json({ sessions });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions', authenticateToken, async (req: any, res) => {
    try {
        const session = req.body;
        await pool.query(
            `INSERT INTO sessions (id, user_id, data, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (id) DO UPDATE
             SET data = EXCLUDED.data, updated_at = NOW()
             WHERE sessions.user_id = EXCLUDED.user_id`,
            [session.id, req.user.id, session]
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sessions/:id', authenticateToken, async (req: any, res) => {
    try {
        const session = req.body;
        const result = await pool.query(
            'UPDATE sessions SET data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
            [session, req.params.id, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sessions/:id', authenticateToken, async (req: any, res) => {
    try {
        await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Model Management Endpoints ─────────────────────────────────────────────
app.get('/api/models/status', (req, res) => {
    const status = Array.from(modelStates.entries()).map(([id, state]) => {
        const now = Date.now();
        const idleSeconds = state.idleTimeMinutes * 60;
        const elapsedSeconds = (now - state.lastUsedAt) / 1000;
        const remaining = Math.max(0, idleSeconds - elapsedSeconds);
        return {
            id,
            remainingSeconds: remaining,
            idleTimeMinutes: state.idleTimeMinutes,
            lastUsedAt: new Date(state.lastUsedAt).toISOString()
        };
    });
    res.json(status);
});

app.post('/api/models/load', authenticateToken, async (req, res) => {
    const { modelId, idleTimeMinutes } = req.body;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    console.log(`[IDLE] Starting tracking for model ${modelId} (timeout: ${idleTimeMinutes || 60}m)`);
    modelStates.set(modelId, {
        id: modelId,
        lastUsedAt: Date.now(),
        idleTimeMinutes: idleTimeMinutes || 60,
        notified30s: false
    });
    res.json({ success: true });
});

app.post('/api/models/unload', authenticateToken, async (req, res) => {
    const { modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    console.log(`[IDLE] Manual unload requested for model ${modelId}. Removing from tracking.`);
    modelStates.delete(modelId);
    await unloadModelOnLMStudio(modelId);
    res.json({ success: true });
});

app.post('/api/models/heartbeat', authenticateToken, async (req, res) => {
    const { modelId } = req.body;
    if (!modelId) return res.status(400).json({ error: 'Missing modelId' });

    const state = modelStates.get(modelId);
    if (state) {
        state.lastUsedAt = Date.now();
        if (state.notified30s) {
            console.log(`[IDLE] Idle timer reset for model ${modelId} via heartbeat (was nearing unload).`);
            state.notified30s = false;
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Model not tracked' });
    }
});

const upload = multer({ dest: 'uploads/' });

const port = process.env.PORT || 3001;
app.listen(port, () => console.log('Server running on port ' + port));
