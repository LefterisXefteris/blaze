# Blaze Desktop

Tauri companion app for the Blaze monorepo. It wraps the Blaze web UI and owns **local handoff delivery** to Cursor — the piece that cannot run reliably on a cloud server.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Blaze Desktop (this app)                               │
│  ┌─────────────────┐   ┌──────────────────────────────┐ │
│  │ Shell UI :1420  │   │ Blaze window (WebView)       │ │
│  │ settings, tray  │   │ → localhost:3000 or prod URL │ │
│  └────────┬────────┘   └──────────────────────────────┘ │
│           │ Rust: poll API, write handoff, open Cursor  │
└───────────┼─────────────────────────────────────────────┘
            │ Bearer JWT
┌───────────▼─────────────────────────────────────────────┐
│  FastAPI (:8000)  +  Next.js (:3000)  +  Postgres        │
└───────────────────────────────────────────────────────────┘
```

### Responsibilities

| Layer | Role |
|-------|------|
| **Next.js** | Full Blaze UI (notes, inbox, sessions, approvals) |
| **FastAPI** | API, agents, Slack/GitHub, handoff markdown generation |
| **Desktop** | Poll confirmed handoffs, write `.blaze/handoffs/`, open Cursor, drop `.cursor/rules` |

### Handoff flow with desktop

1. Approve **Hand off to coding agent** in the Blaze web window (local or production).
2. API marks the action `CONFIRMED` (server-side Cursor delivery may fail — that's OK).
3. Desktop polls `GET /api/actions`, finds confirmed `coding_handoff` actions not yet delivered locally.
4. Desktop fetches `GET /api/actions/{id}/handoff`, writes the markdown file, runs `cursor --add`, writes rules snippet.

## Prerequisites

- [Rust](https://rustup.rs/) (for Tauri)
- Node.js 20+
- Blaze API + web app running (for local dev)
- [Cursor CLI](https://cursor.com/docs/cli) on your `PATH` (optional but recommended)

## Setup

```bash
# From repo root — install desktop deps
cd desktop
npm install

# Terminal 1: API
npm run dev:api          # from repo root

# Terminal 2: Web
npm run dev              # from repo root

# Terminal 3: Desktop
npm run tauri:dev        # from desktop/
```

On first launch:

1. Open **Blaze** from the desktop app and log in.
2. In desktop **Settings**, paste your Supabase **access token** (see below).
3. Set **API URL** (`http://127.0.0.1:8000`) and **App URL** (`http://localhost:3000`).
4. Save settings.

### Getting an access token

After logging into Blaze in the browser:

1. Open DevTools → Application → Cookies.
2. Find the Supabase auth cookie (`sb-*-auth-token`).
3. Copy the `access_token` value from the decoded session JSON.

Or use a JWT from your Supabase project for the logged-in user.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Desktop shell + Blaze webview (dev) |
| `npm run tauri:build` | Production `.app` / binary |
| `npm run dev` | Vite shell UI only (port 1420) |

From repo root:

```bash
npm run desktop:dev
npm run desktop:build
```

## Configuration

Stored in the OS app config directory as `blaze-desktop.json`:

| Field | Default | Description |
|-------|---------|-------------|
| `apiUrl` | `http://127.0.0.1:8000` | FastAPI base URL |
| `appUrl` | `http://localhost:3000` | Blaze web UI URL |
| `accessToken` | — | Supabase JWT for API calls |
| `handoffDir` | nearest `/.blaze/handoffs` | Override handoff output path |
| `cursorRules` | `true` | Write `.cursor/rules/blaze-handoff.mdc` |
| `pollIntervalSecs` | `30` | Background poll interval (min 15) |

## System tray

- **Open Blaze** — focus the web window
- **Deliver handoffs now** — poll immediately
- **Desktop settings** — show the shell window
- **Quit**

## Production use

Point desktop settings at your hosted Blaze:

- `appUrl` → `https://your-blaze.app`
- `apiUrl` → `https://api.your-blaze.app` (or same host if API is colocated)

Set `BLAZE_CURSOR_HANDOFF=off` on the **server** so it doesn't try (and fail) to open Cursor in the cloud. Desktop handles delivery.

## Roadmap

- [ ] OAuth PKCE in desktop shell (no manual token paste)
- [ ] Native notifications for pending handoff actions
- [ ] Auto-run note_agent on Slack transcript chunks
- [ ] Deep link: `blaze://handoff/{actionId}`
