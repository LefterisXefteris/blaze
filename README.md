<div align="center">

<img src="public/blaze-logo.png" alt="Blaze" width="96" height="96" />

# Blaze

### Agentic AI note-taking — capture conversations, produce structured notes, and act on what matters.

**Your conversations, on fire with action.** 🔥

[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Postgres + pgvector](https://img.shields.io/badge/Postgres-pgvector-336791?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![OpenAI](https://img.shields.io/badge/OpenAI-embeddings-412991?logo=openai&logoColor=white)](https://platform.openai.com/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[Quick start](#-quick-start) · [Features](#-features) · [How it works](#-how-it-works) · [Setup](#-full-setup) · [Architecture](#-architecture)

</div>

---

## What is Blaze?

Blaze is an **open-source, agentic AI note-taker built for engineering teams**. It's like Granola — but it doesn't just *write* notes, it **acts on them**, and it's wired deep into GitHub and Cursor.

Capture a conversation from anywhere — a live Slack huddle, your microphone, a pasted transcript, or a GitHub issue thread — and Blaze turns it into **structured notes and executable actions** in real time. Low-risk actions run automatically; high-risk ones wait for your approval.

> **The killer feature:** approve a *"Hand off to coding agent"* action and Blaze writes a markdown brief into your local repo, drops a Cursor rules file, and opens Cursor — so a coding agent picks up the task with full context from your meeting.

```
🎙️  "We agreed to fix the flaky auth test and ship the rate-limiter by Friday."
          │
          ▼
📝  Live notes  →  ✅ Action items  →  🔗 Linked to issue #142
          │
          ▼
🤖  Calendar hold (auto)   ·   GitHub comment (confirm)   ·   Cursor handoff (confirm)
```

## ✨ Features

| | |
|---|---|
| 🎙️ **Live capture** | Granola-style notes while Slack huddles, mic sessions, or pasted transcripts unfold — structured in real time, not after the fact. |
| 🤖 **Agentic actions** | Calendar holds, GitHub acks, and task updates run automatically when confidence is high — you stay in flow. |
| 🛡️ **Human-in-the-loop** | High-risk intents (comments, emails, coding handoffs) land in a confirm queue. Nothing ships without your approval — from the web **or Slack buttons**. |
| 🐙 **GitHub inbox** | Assignments, @mentions, and review requests surface as an AI-ranked priority inbox. Match meeting notes to the issues they reference. |
| 🧠 **Semantic search** | pgvector indexes every conversation and GitHub item, so live notes auto-link related PRs/issues and search finds decisions instantly. |
| ⚡ **Cursor handoff** | Turn "let's fix #142" into a structured markdown brief + Cursor rules dropped straight into your local checkout. |
| 🍳 **Recipes** | Reusable prompts (follow-up email, exec summary, action items) you run on any session. |
| 🖥️ **Desktop app** | A Tauri companion delivers coding handoffs locally even when the API runs in the cloud. |

## 🔁 How it works

Blaze runs a simple loop — **Capture → Understand → Act** — powered by two LangGraph pipelines.

| Step | What happens |
|------|--------------|
| **1. Capture** | Connect Slack and start a session (huddles auto-open), speak into your mic (ElevenLabs Scribe realtime, browser-speech fallback), paste a transcript, or import a GitHub issue. |
| **2. Understand** | Blaze streams live notes over SSE — key points, decisions, owners — while pgvector links the conversation to related GitHub issues and PRs. |
| **3. Act** | Intents are extracted and risk-classified. Low-risk actions execute instantly; high-risk ones wait in your confirm queue (web or Slack). |

## 🚀 Quick start

Get the UI running locally in ~5 minutes — no paid API keys required (demo login).

```bash
# 1. Clone
git clone https://github.com/LefterisXefteris/blaze.git
cd blaze

# 2. Install (frontend + Python backend venv)
npm install
npm run setup:api

# 3. Configure
cp .env.example .env
#   set BLAZE_JWT_SECRET to any long random string
#   set DEV_DEMO_LOGIN=true to enable the "Enter demo" button

# 4. Database (Docker Postgres + pgvector)
npm run db:setup

# 5. Run everything (API + web)
npm run dev:all
```

Open **[http://localhost:3010](http://localhost:3010)** and click **Enter demo**. 🎉

> Add `OPENAI_API_KEY` to your `.env` when you want embeddings, semantic search, and AI notes. Everything else (Slack, GitHub, Google, ElevenLabs) is optional — see [Setup](#-full-setup).

## 🧰 Tech stack

- **[Next.js 16](https://nextjs.org/) + React 19** — frontend (JWT cookie sessions, Google OAuth / demo login)
- **[FastAPI](https://fastapi.tiangolo.com/)** — backend API, agents, integrations (`backend/`)
- **[LangGraph](https://langchain-ai.github.io/langgraph/)** — agent orchestration (intent + live-notes pipelines)
- **[Postgres + pgvector](https://github.com/pgvector/pgvector)** — database and semantic search (Docker locally)
- **[OpenAI](https://platform.openai.com/)** — embeddings + intent extraction
- **[Tauri](https://tauri.app/)** — desktop companion (`desktop/`) for local Cursor handoffs
- **Redis** — background job queue (optional; in-process fallback by default)

## 📦 Full setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 20+ | Frontend, Prisma, scripts |
| [Python](https://www.python.org/) | 3.12+ | FastAPI backend |
| [Git](https://git-scm.com/) | any | Clone the repo |
| [Docker](https://www.docker.com/) | recommended | Local Postgres + pgvector |
| [Rust](https://rustup.rs/) | optional | Desktop app only (`desktop/`) |

Third-party API keys are **not** included in this repository. Create your own accounts and add keys to a local `.env` file (see [Secrets and API keys](#secrets-and-api-keys)).

### 1. Clone the repository

```bash
git clone https://github.com/LefterisXefteris/blaze.git
cd blaze
```

Do **not** commit a `.env` file. It is gitignored; only `.env.example` (placeholders, no real secrets) is tracked.

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

Edit `.env` with your own values. The example file uses empty strings and safe placeholders — replace them locally; never paste real keys into tracked files or pull requests.

**Minimum to run the UI locally** (demo login, no integrations):

| Variable | Example / value |
|----------|-----------------|
| `BLAZE_JWT_SECRET` | Any long random string (sessions for Next.js + FastAPI) |
| `DATABASE_URL` | `postgresql://lefteris:lefteris@localhost:5432/lefteris_os` |
| `DIRECT_URL` | Same as `DATABASE_URL` for local dev |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3010` |
| `DEV_DEMO_LOGIN` | `true` — enables **Enter demo** on the login page |

**Your own API keys** (add only what you need; leave others blank):

| Variable | Where to get a key | Used for |
|----------|-------------------|----------|
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/) | Embeddings, vector search, live notes, intent extraction |
| `ELEVENLABS_API_KEY` | [ElevenLabs](https://elevenlabs.io/) | Realtime voice transcription (Slack huddles); falls back to browser speech if unset |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/) | Sign in with Google + Calendar |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_WEBHOOK_SECRET` | GitHub OAuth App + webhook | Issues, PRs, coding handoffs |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | [Slack API](https://api.slack.com/apps) | Slack meeting capture |

Blaze runs without these keys, but the related features stay disabled until you configure them.

### 4. Set up the database

```bash
npm run db:setup
```

This starts Docker Postgres (`pgvector/pgvector:pg16`), applies the Prisma schema, and enables the `vector` extension for semantic search.

Or step by step:

```bash
docker compose up postgres -d
npm run db:push
npm run db:vectors
```

### 5. Start the app

One command from the repo root (API + web):

```bash
npm run dev:all
```

Open [http://localhost:3010](http://localhost:3010). The frontend proxies `/api/*` to FastAPI at `http://127.0.0.1:8000`.

> **Note:** Blaze uses port **3010** by default so it does not clash with Grafana or other tools on 3000.

Or run them separately:

```bash
# Terminal 1 — FastAPI API
npm run dev:api

# Terminal 2 — Next.js frontend
npm run dev
```

### Optional: background worker (Redis)

```bash
docker compose up redis -d
```

Add `REDIS_URL="redis://localhost:6379"` to `.env`, then run `npm run worker` in a third terminal.

### Optional: desktop companion

```bash
npm run desktop:install
npm run dev:all       # or dev:api + dev in separate terminals
```

See [desktop/README.md](desktop/README.md) for auth token setup and production config.

## 🗂️ Project layout

```
blaze/
├── src/                 # Next.js frontend (pages, components, lib)
├── backend/             # FastAPI API, agents, integrations
├── desktop/             # Tauri desktop app (local Cursor handoffs)
├── prisma/              # Database schema + migrations
├── docker-compose.yml   # Postgres (pgvector), Redis, API, worker
├── .env.example         # Environment template — copy to .env
└── package.json         # Root scripts (dev, db, worker, desktop)
```

## 🏛️ Architecture

```
Browser → Next.js (:3010)  ──proxy /api/*──►  FastAPI (:8000)
         ↓ blaze-auth-token cookie              ↓
    Local JWT sessions                      Postgres + pgvector
```

- **Frontend** (`src/app/`, `src/components/`) — React pages, issues session JWT on login
- **Backend** (`backend/app/`) — API routes, agents, integrations, vector search
- **Auth** — demo login or Google OAuth; FastAPI validates the same JWT from cookies or `Authorization: Bearer`

Under the hood, two LangGraph pipelines do the work: an **intent graph** (extract intents → classify risk → execute or queue) and a **live-notes graph** (retrieve context → index transcript → generate summary).

## 🔌 Integrations

### Google sign-in (optional)

1. Create a Google Cloud OAuth client (Web application)
2. Enable the **Google Calendar API** for your project
3. Add redirect URIs:
   - `http://localhost:3010/auth/callback` (sign-in)
   - `http://localhost:3010/api/integrations/google/callback` (connect from Settings)
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

Without Google OAuth, use **Enter demo** (`DEV_DEMO_LOGIN=true`).

### Slack meeting capture (Granola-style)

1. Create a Slack app with OAuth + **Event Subscriptions** → `{APP_URL}/api/slack/events`
2. Add bot scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `users:read`, `chat:write`
3. Subscribe to events: `message.channels`, `message.groups`, `message.im`, `huddle_started`, `huddle_ended`
4. Connect in **Settings → Slack**
5. Click **Capture Slack meeting** on the home page and pick a channel

When a huddle starts (or you invite Blaze to a channel), Blaze auto-creates a capture session and posts live notes in Slack. Open the session in Blaze — voice capture uses **ElevenLabs Scribe** when `ELEVENLABS_API_KEY` is set (falls back to browser speech otherwise).

### GitHub integration

1. Create a GitHub OAuth App → callback: `{APP_URL}/api/integrations/github/callback`
2. Add webhook URL: `{APP_URL}/api/github/webhook` (events: issues, issue_comment, pull_request)
3. Connect in **Settings → GitHub**

### Cursor handoff (local dev)

When you approve a **Hand off to coding agent** action, Blaze:

1. Resolves the issue's GitHub repo to a **local checkout** (Connections → Local repos, `~/.blaze/repos.json`, or `BLAZE_REPO_MAP`)
2. Writes a markdown bundle to `.blaze/handoffs/` inside that repo (or the nearest git repo if unmapped)
3. Opens the mapped workspace in Cursor, then adds the handoff file
4. Writes `.cursor/rules/blaze-handoff.mdc` in that repo so Cursor picks up the task automatically

Set `BLAZE_CURSOR_HANDOFF=off` to disable auto-open. CLI:

```bash
# Preview handoff markdown (requires BLAZE_USER_ID in .env)
npm run blaze -- handoff <action-id>

# Write file + open in Cursor
npm run blaze -- handoff <action-id> --run
```

Install the [Cursor CLI](https://cursor.com/docs/cli) (`cursor` on your PATH) for best results.

### Desktop app

A **Tauri** companion (`desktop/`) wraps the Blaze web UI and delivers coding handoffs locally (write handoff file, open Cursor, drop rules snippet). Use this for production or whenever the API runs in Docker/cloud.

```bash
npm run desktop:install
npm run dev:all        # API + web, then desktop in another terminal
```

See [desktop/README.md](desktop/README.md) for architecture, auth token setup, and production config. Set `BLAZE_CURSOR_HANDOFF=off` on cloud deployments — let the desktop app handle Cursor integration.

## 🐳 Docker

`docker-compose.yml` provides services for local development:

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Postgres with pgvector (`lefteris` / `lefteris` / `lefteris_os`) |
| `redis` | 6379 | Background job queue |
| `api` | 8000 | FastAPI backend container |
| `worker` | — | Intent extraction worker |

**Postgres only** (typical local dev):

```bash
docker compose up postgres -d
npm run db:setup
```

**Full API + worker**:

```bash
docker compose up api worker redis postgres -d
```

You still run the Next.js frontend separately with `npm run dev` unless you deploy it elsewhere.

## ⚙️ Environment variables

Full template: [`.env.example`](.env.example). All integration keys default to empty — you supply your own.

| Variable | Required | Description |
|----------|----------|-------------|
| `BLAZE_JWT_SECRET` | Yes | Shared secret for session JWTs (Next.js + FastAPI) — generate your own |
| `DATABASE_URL` | Yes | Local Postgres connection string |
| `DIRECT_URL` | Yes | Same as `DATABASE_URL` for local dev |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for OAuth redirects |
| `API_URL` | Local dev | FastAPI URL for Next.js proxy (default `http://127.0.0.1:8000`) |
| `DEV_DEMO_LOGIN` | Local | `true` enables demo login button |
| `OPENAI_API_KEY` | Your key | LLM + embeddings — [get a key](https://platform.openai.com/) |
| `ELEVENLABS_API_KEY` | Your key | Realtime voice (Slack huddles) — [get a key](https://elevenlabs.io/) |
| `GOOGLE_CLIENT_ID` | Your key | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | Your key | Google Cloud OAuth secret |
| `GITHUB_CLIENT_ID` | Your key | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | Your key | GitHub OAuth secret |
| `GITHUB_WEBHOOK_SECRET` | Your key | GitHub webhook signing secret |
| `SLACK_CLIENT_ID` | Your key | Slack app client ID |
| `SLACK_CLIENT_SECRET` | Your key | Slack app client secret |
| `SLACK_SIGNING_SECRET` | Your key | Slack request signing secret |
| `REDIS_URL` | Optional | Job queue (requires `npm run worker`) |

### Secrets and API keys

This repo ships **no** production or personal API keys. Setup is intentionally bring-your-own-credentials:

1. Copy `.env.example` → `.env` (never commit `.env`).
2. Sign up with each provider you need and create your own keys.
3. Paste keys **only** into your local `.env` (or your deployment secret store).

`.gitignore` excludes `.env*` except `.env.example`, which contains empty placeholders only.

**Do not:**

- Commit `.env`, `.env.local`, or any file containing real secrets
- Share keys in issues, PRs, chat logs, or screenshots
- Reuse keys from other projects without rotating them if they were ever exposed

## 🧯 Troubleshooting

| Issue | Fix |
|-------|-----|
| `db:push` fails | Run `docker compose up postgres -d` and check `DATABASE_URL` |
| pgvector errors | Run `npm run db:vectors` after `db:push` |
| API returns 401 | Ensure `BLAZE_JWT_SECRET` matches in `.env` and restart `dev:all` |
| `/api/*` errors in browser | Ensure `npm run dev:api` is running on port 8000 |
| Demo login fails | Set `DEV_DEMO_LOGIN=true`, run `npm run db:setup` |
| Handoffs don't open Cursor | Install [Cursor CLI](https://cursor.com/docs/cli) or use the desktop app |

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repo and create your branch from `main`
2. Run the app locally (see [Quick start](#-quick-start))
3. Make your change and open a PR with a clear description

## 📄 License

[MIT](LICENSE) © Lefteris Xefteris

---

<div align="center">

**If Blaze is useful to you, please consider giving it a ⭐ — it really helps!**

</div>
