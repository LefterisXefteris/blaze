# Blaze

Agentic AI note-taking — capture conversations, produce structured notes, and act on what matters. Your conversations, on fire with action.

## Clone and run locally

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 20+ | Frontend, Prisma, scripts |
| [Python](https://www.python.org/) | 3.12+ | FastAPI backend |
| [Git](https://git-scm.com/) | any | Clone the repo |
| [Supabase](https://supabase.com/) account | — | Auth + Postgres (free tier works) |
| [OpenAI API key](https://platform.openai.com/) | — | Embeddings + live notes (required for full features) |
| [Docker](https://www.docker.com/) | optional | Redis, local Postgres, or full API stack |
| [Rust](https://rustup.rs/) | optional | Desktop app only (`desktop/`) |

### 1. Clone the repository

```bash
git clone https://github.com/LefterisXefteris/blaze.git
cd blaze
```

### 2. Install dependencies

```bash
# Frontend + Prisma
npm install

# Python backend (creates backend/.venv)
npm run setup:api
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET` (Supabase → Settings → API → JWT Secret)
- `DATABASE_URL` and `DIRECT_URL` (Supabase → Settings → Database)
- `NEXT_PUBLIC_APP_URL` → `http://localhost:3000`
- `OPENAI_API_KEY`

For the fastest local login without Google OAuth, keep `DEV_DEMO_LOGIN=true` and set `SUPABASE_SERVICE_ROLE_KEY`, then use **Enter demo** on the login page.

### 4. Set up the database

```bash
npm run db:push
```

This applies the Prisma schema (including `pgvector` for semantic search) to your Supabase Postgres database.

### 5. Start the app

Open two terminals from the repo root:

```bash
# Terminal 1 — FastAPI API
npm run dev:api

# Terminal 2 — Next.js frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend proxies `/api/*` to FastAPI at `http://127.0.0.1:8000`.

### Optional: background worker (Redis)

```bash
docker compose up redis -d
```

Add `REDIS_URL="redis://localhost:6379"` to `.env`, then run `npm run worker` in a third terminal.

### Optional: desktop companion

```bash
npm run desktop:install
npm run desktop:dev   # requires dev:api + dev running
```

See [desktop/README.md](desktop/README.md) for auth token setup and production config.

### Project layout

```
blaze/
├── src/                 # Next.js frontend (pages, components, lib)
├── backend/             # FastAPI API, agents, integrations
├── desktop/             # Tauri desktop app (local Cursor handoffs)
├── prisma/              # Database schema + migrations
├── docker-compose.yml   # Redis, Postgres, API, worker
├── .env.example         # Environment template — copy to .env
└── package.json         # Root scripts (dev, db, worker, desktop)
```

## Stack

- **Next.js** — frontend (React UI, Supabase auth callback)
- **FastAPI** — backend API (`backend/`)
- **Tauri** — desktop companion (`desktop/`) — local handoff + Cursor
- **Supabase Auth** — Google OAuth sign-in
- **Supabase Postgres** — database (Prisma schema; SQLAlchemy in Python)
- **OpenAI** — intent extraction (optional)
- **LangGraph** — agent orchestration (intent + live-notes pipelines)
- **Redis** — background job queue (optional; in-process fallback by default)

## Supabase setup (detailed)

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Copy **Project URL** and **anon key** from Settings → API
3. Copy **JWT Secret** from Settings → API (for FastAPI auth)
4. Copy **Database connection string** from Settings → Database (use Transaction pooler for `DATABASE_URL`)
5. Enable **Google** provider under Authentication → Providers
6. Add redirect URL: `http://localhost:3000/auth/callback`

### 2. Google Calendar (optional)

For Google Calendar scopes, in Supabase Google provider settings add scopes:
```
https://www.googleapis.com/auth/calendar.events
```

Also enable **Store provider tokens** in Supabase Auth settings so calendar access works.

## Docker

`docker-compose.yml` provides optional services for local development or deployment:

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Local Postgres with pgvector (alternative to Supabase) |
| `redis` | 6379 | Background job queue |
| `api` | 8000 | FastAPI backend container |
| `worker` | — | Intent extraction worker |

**Redis only** (recommended for local dev with Supabase):

```bash
docker compose up redis -d
```

**Full API + worker** (uses `.env` for database and secrets):

```bash
docker compose up api worker redis -d
```

If using the bundled Postgres instead of Supabase, point `DATABASE_URL` at `postgresql://lefteris:lefteris@localhost:5432/lefteris_os` and run `npm run db:push` against it.

You still run the Next.js frontend separately with `npm run dev` unless you deploy it elsewhere.

## Redis (optional)

By default, intent extraction runs in-process inside the FastAPI server. For production or multiple API instances, use Redis with a separate worker.

1. Start Redis:

```bash
docker compose up redis -d
```

2. Add to `.env`:

```bash
REDIS_URL="redis://localhost:6379"
```

3. Run the worker in a third terminal:

```bash
npm run worker
```

Keep `dev:api`, `dev`, and `worker` running. If Redis is unreachable, the API falls back to in-process scheduling automatically.

### Demo mode (local)

Set `DEV_DEMO_LOGIN=true` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`, then click **Enter demo** on the login page.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_JWT_SECRET` | Yes | JWT secret for FastAPI auth |
| `DATABASE_URL` | Yes | Supabase Postgres (pooled) |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for OAuth redirects |
| `API_URL` | Local dev | FastAPI URL for Next.js proxy (default `http://127.0.0.1:8000`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Demo only | Creates demo user locally |
| `GOOGLE_CLIENT_ID` | Calendar | Google Cloud OAuth client (token refresh) |
| `GOOGLE_CLIENT_SECRET` | Calendar | Google Cloud OAuth secret |
| `SLACK_*` | Slack capture | Slack app credentials |
| `OPENAI_API_KEY` | Optional | LLM extraction |
| `REDIS_URL` | Optional | Job queue (requires `npm run worker`) |

## Architecture

```
Browser → Next.js (:3000)  ──proxy /api/*──►  FastAPI (:8000)
         ↓ auth callback                         ↓
    Supabase Auth                            Postgres (Prisma schema)
```

- **Frontend** (`src/app/`, `src/components/`) — unchanged React pages
- **Backend** (`backend/app/`) — all API routes, agent logic, integrations, vector search
- **Auth callback** (`src/app/auth/callback`) — stays in Next.js for Supabase SSR cookies

## Slack meeting capture (Granola-style)

1. Create a Slack app with OAuth + **Event Subscriptions** → `{APP_URL}/api/slack/events`
2. Add bot scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `users:read`, `chat:write`
3. Subscribe to events: `message.channels`, `message.groups`, `message.im`, `huddle_started`, `huddle_ended`
4. Connect in **Settings → Slack**
5. Click **Capture Slack meeting** on the home page and pick a channel

## GitHub integration

1. Create a GitHub OAuth App → callback: `{APP_URL}/api/integrations/github/callback`
2. Add webhook URL: `{APP_URL}/api/github/webhook` (events: issues, issue_comment, pull_request)
3. Connect in **Settings → GitHub**

## Cursor handoff (local dev)

When you approve a **Hand off to coding agent** action, Blaze:

1. Writes a markdown bundle to `.blaze/handoffs/` in the nearest git repo (or `BLAZE_HANDOFF_DIR`)
2. Runs `cursor --add <file>` (falls back to `open -a Cursor` on macOS)
3. Writes `.cursor/rules/blaze-handoff.mdc` so Cursor picks up the task automatically

Set `BLAZE_CURSOR_HANDOFF=off` to disable auto-open. CLI:

```bash
# Preview handoff markdown (requires BLAZE_USER_ID in .env)
npm run blaze -- handoff <action-id>

# Write file + open in Cursor
npm run blaze -- handoff <action-id> --run
```

Install the [Cursor CLI](https://cursor.com/docs/cli) (`cursor` on your PATH) for best results.

## Desktop app

A **Tauri** companion (`desktop/`) wraps the Blaze web UI and delivers coding handoffs locally (write handoff file, open Cursor, drop rules snippet). Use this for production or whenever the API runs in Docker/cloud.

```bash
npm run desktop:install
npm run desktop:dev    # requires dev:api + dev running
```

See [desktop/README.md](desktop/README.md) for architecture, auth token setup, and production config.

Set `BLAZE_CURSOR_HANDOFF=off` on cloud deployments — let the desktop app handle Cursor integration.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `db:push` fails on pgvector | Enable the `vector` extension in Supabase (SQL: `create extension if not exists vector;`) or use the bundled Docker Postgres image |
| API returns 401 | Check `SUPABASE_JWT_SECRET` matches Supabase → Settings → API |
| `/api/*` errors in browser | Ensure `npm run dev:api` is running on port 8000 |
| Demo login fails | Set `DEV_DEMO_LOGIN=true` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| Handoffs don't open Cursor | Install [Cursor CLI](https://cursor.com/docs/cli) or use the desktop app |

## License

Private — see repository owner for usage terms.
