# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

BekaChat is a full-stack AI chat application with LM Studio integration, featuring multi-modal capabilities (text, vision), web/deep search, model lifecycle management with auto-unload, and user authentication. Built with React 19 + TypeScript frontend and Express + PostgreSQL backend.

## Build & Development Commands

### Essential Commands
```fish
npm run dev      # Start both Vite dev server (port 5173) and Express backend (port 3001)
npm run server   # Start backend only with hot-reload
npm run build    # Production build: TypeScript compilation + Vite build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

### No Test Framework
Currently no automated tests. Validate changes with `npm run lint` and manual testing via dev server.

### Database Setup
PostgreSQL required. Default admin account (`admin@admin.ro` / `admin`) is auto-created on first run. Schema managed in `server/index.ts::initDB()`.

## Architecture Overview

### Frontend (React + TypeScript + Vite)
- **Routing**: React Router v7 with protected routes
- **State Management**: Context API (Auth, AI Config, Sessions, Theme)
- **Styling**: Vanilla CSS with BEM methodology, `bk-` prefix namespace
- **UI Components**: Modular component library in `src/components/`

### Backend (Express + TypeScript + PostgreSQL)
- **Single file**: `server/index.ts` (~400 lines)
- **Auth**: JWT with bcrypt password hashing
- **Database**: PostgreSQL connection pooling via `pg`
- **Model Management**: Idle timeout tracking for LM Studio models with auto-unload
- **File Uploads**: Multer for image/PDF attachments

### LM Studio Integration
- Frontend communicates with LM Studio API (default: `http://192.168.1.134:1234/api/v1`)
- Backend tracks loaded model states and auto-unloads after configurable idle time
- Supports vision models, reasoning levels, and multi-model workflows
- Real-time model status polling with notification system

### Key Data Flow
1. User authenticates → JWT stored in localStorage
2. Chat messages sent to LM Studio API directly from frontend
3. Sessions persisted to PostgreSQL via backend `/api/sessions`
4. Model lifecycle managed by backend idle tracking + frontend heartbeat
5. File attachments uploaded to `uploads/` directory, served via Express

## Project Structure

```
src/
├── components/
│   ├── shared/      # Generic UI (Button, Input, Modal, Spinner, Badge)
│   ├── layout/      # AppLayout, Sidebar, Header
│   ├── chat/        # MessageBubble, ChatInput, etc.
│   └── profile/     # User profile components
├── context/         # AuthContext, AIConfigContext, SessionContext, ThemeContext
├── pages/           # ChatPage (main), AdminPage, LoginPage, ProfilePage
├── types/index.ts   # All TypeScript interfaces
├── data/
│   ├── mockData.ts
│   └── modelRules.ts # Model-specific configuration (reasoning levels)
└── assets/

server/
└── index.ts         # Entire backend in one file

models/              # Local model files (e.g., Whisper)
uploads/             # User-uploaded files
```

## Code Conventions

### TypeScript
- All interfaces defined in `src/types/index.ts`
- No `any` types - use proper interfaces
- Functional components: `export function ComponentName()`
- Props destructured in function signature

### Import Order
1. React core
2. Components (same directory)
3. Hooks/Contexts
4. Types (with `type` keyword)
5. CSS

### CSS Naming
- Prefix all classes with `bk-` (e.g., `bk-button`, `bk-chat-input`)
- BEM methodology: `bk-block__element--modifier`
- One CSS file per component
- Use CSS custom properties from `src/index.css` (e.g., `var(--space-4)`, `var(--accent-primary)`)

### File Naming
- Components: PascalCase (e.g., `ChatInput.tsx`, `ChatInput.css`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Types/Contexts: PascalCase (e.g., `AuthContext.tsx`)

## Context API

### AuthContext
```typescript
const { user, isAuthenticated, login, logout } = useAuth();
```
Manages authentication state, JWT token, user profile.

### AIConfigContext
```typescript
const { config, updateConfig, availableModels, fetchModels, loadModel, unloadModel, triggerHeartbeat } = useAIConfig();
```
Manages LM Studio endpoint, model selection, idle timeouts, reasoning levels. Polls `/api/models/status` for real-time tracking.

### SessionContext
```typescript
const { sessions, currentSession, createSession, updateSession, deleteSession } = useSessions();
```
Manages chat sessions (stored in PostgreSQL).

### ThemeContext
```typescript
const { theme, setTheme } = useTheme();
```
Toggles `data-theme="dark|light"` on `<html>`.

## Backend API Patterns

### Authentication Endpoints
- `POST /api/auth/register` - Create user
- `POST /api/auth/login` - Login (returns JWT + user)
- `GET /api/auth/me` - Get current user (requires JWT)
- `PUT /api/auth/profile` - Update profile

### Session Endpoints (Protected)
- `GET /api/sessions` - List user sessions
- `POST /api/sessions` - Create session
- `PUT /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Delete session

### Model Management Endpoints (Protected)
- `GET /api/models/status` - Get idle timer status for all tracked models
- `POST /api/models/load` - Register model for idle tracking
- `POST /api/models/unload` - Manually unload model
- `POST /api/models/heartbeat` - Reset idle timer for model

### Admin Endpoints (Admin Role Only)
- `GET /api/admin/settings` - Get app settings (LM Studio endpoint, default models, etc.)
- `POST /api/admin/settings` - Update app settings

### Response Format
All endpoints return JSON: `{ success: true, ... }` or `{ error: "message" }` with appropriate HTTP status codes.

## Model Lifecycle Management

### Idle Timeout System
1. When model loads, frontend calls `POST /api/models/load` with `idleTimeMinutes`
2. Backend tracks `lastUsedAt` timestamp per model
3. Background interval checks every 5s for expired models
4. When < 30s remaining, notification shown to user
5. On timeout, backend auto-unloads via LM Studio API
6. Frontend sends heartbeat (`POST /api/models/heartbeat`) on user activity to reset timer

### Model Configuration
See `src/data/modelRules.ts` for model-specific settings (e.g., reasoning levels for `gpt-oss-20b`).

## Component Development

### Template
```typescript
import './MyComponent.css';
import type { ReactNode } from 'react';

interface MyComponentProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function MyComponent({ title, children, className = '' }: MyComponentProps) {
  return (
    <div className={`bk-my-component ${className}`}>
      <h3 className="bk-my-component__title">{title}</h3>
      <div className="bk-my-component__body">{children}</div>
    </div>
  );
}
```

### Styling Pattern
```css
.bk-my-component {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: var(--transition-base);
}

.bk-my-component__title {
  color: var(--text-primary);
  font-weight: var(--weight-semi);
}
```

### Shared Components
- `Button` - `variant`, `size`, `isLoading`, `leftIcon`
- `Input` - `label`, `error`, `leftIcon`, `hint`
- `Badge` - `variant` (default, accent, success, warning, error)
- `Spinner` - `size` (sm, md, lg)
- `Modal` - Generic modal wrapper
- `CustomDropdown` - Custom select with search

## Design System

### Theming
- CSS custom properties in `src/index.css`
- Light/dark modes via `data-theme` attribute
- Tokens: colors, spacing (`--space-1` to `--space-12`), typography, shadows

### Spacing Scale
Use `var(--space-N)` where N = 1, 2, 3, 4, 6, 8, 10, 12 (4px base unit).

### Glass-morphism Effects
Combine `backdrop-filter: blur(10px)` with semi-transparent backgrounds for elevated surfaces.

## Environment Variables

```bash
# Required
DB_USER=alecs
DB_PASSWORD=alecs
DB_NAME=bekadb
DB_HOST=127.0.0.1
DB_PORT=5432
PORT=3001
JWT_SECRET=supersecret123
```

App settings (LM Studio endpoint, default models) stored in PostgreSQL `app_settings` table, configurable via Admin page.

## Common Patterns

### API Call with Auth
```typescript
const token = localStorage.getItem('token');
const response = await fetch('/api/sessions', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
```

### Loading State
```typescript
const [isLoading, setIsLoading] = useState(false);

const handleSubmit = async () => {
  setIsLoading(true);
  try {
    await submitForm();
  } catch (error) {
    console.error(error);
  } finally {
    setIsLoading(false);
  }
};
```

### Streaming LM Studio Response
See `ChatPage.tsx::handleSend()` for full SSE streaming implementation with tool calls and reasoning.

## Development Workflow

1. Start dev environment: `npm run dev`
2. Frontend auto-opens at `http://localhost:5173`
3. Backend runs on `http://localhost:3001`
4. Vite proxy forwards `/api` and `/beka-search` to backend
5. Make changes → hot-reload applies instantly
6. Run `npm run lint` before committing

## Critical Implementation Details

### Authentication Flow
- JWT stored in localStorage as `token`
- `AuthContext` hydrates user on mount via `GET /api/auth/me`
- Protected routes redirect to `/login` if not authenticated
- Default admin: `admin@admin.ro` / `admin`

### Session Persistence
- Sessions stored as JSONB in PostgreSQL
- Auto-save on message add/update
- Frontend manages in-memory state via `SessionContext`

### Model Selection
- Admin configures defaults in Admin page
- User can override per-session in chat UI
- Vision models auto-selected when images attached
- Reasoning models support streaming `<think>` tags

### File Attachments
- Uploaded to `uploads/` directory via Multer
- Stored as base64 in message attachments for LM Studio vision API
- PDF support via client-side parsing

## Additional Documentation

- `PROJECT_RULES.md` - General development principles
- `COMPONENT_GUIDE.md` - Component development template
- `STYLING.md` - Design system details
- `src/types/index.ts` - Full type definitions

## Notes for AI Agents

- Backend is monolithic (`server/index.ts`) - consider splitting if adding major features
- No WebSocket - uses SSE for streaming chat responses
- LM Studio API called directly from frontend (no backend proxy)
- Session titles auto-generated from first user message
- Model auto-unload is opt-in per model load
- Notification system uses React state + absolute positioning overlay
