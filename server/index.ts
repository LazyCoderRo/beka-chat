import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    const endpoint = await getSetting('lmStudioEndpoint', 'http://192.168.1.134:1234/api/v1');
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
    const endpoint = await getSetting('lmStudioEndpoint', 'http://192.168.1.134:1234/api/v1');
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
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, role, avatarurl as "avatarUrl", createdat as "createdAt"',
            [name, email, hash]
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

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        delete user.password;
        res.json({ user, token });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
    try {
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
        res.json(settings);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/settings', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

    try {
        const settings = req.body;
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
            'INSERT INTO sessions (id, user_id, data, updated_at) VALUES ($1, $2, $3, NOW())',
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
        await pool.query(
            'UPDATE sessions SET data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
            [session, req.params.id, req.user.id]
        );
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
