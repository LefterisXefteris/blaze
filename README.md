<div align="center">

<img src="public/blaze-logo.png" alt="Blaze" width="96" height="96" />

# Blaze

**Notes that do the boring part for you.**

[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Postgres + pgvector](https://img.shields.io/badge/Postgres-pgvector-336791?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)

[Quick start](#quick-start) · [What it does](#what-it-does) · [How it works](#how-it-works) · [Setup](#full-setup) · [Architecture](#architecture)

</div>

---

## About

Most note-takers stop at the transcript. You still have to read it back, pull out the action items, open Calendar, write the GitHub comment, and brief whoever is picking up the work. Blaze is the part that happens after the transcript.

It listens to a conversation (a Slack huddle, your microphone, a pasted transcript, a GitHub issue thread), writes structured notes as the conversation happens, and then turns the decisions inside those notes into real actions. Safe, routine actions just run. Anything risky waits for a yes from you, either in the app or straight from a Slack button.

The piece I'm most proud of: approve a "hand off to coding agent" action and Blaze writes a markdown brief into your local checkout, drops a Cursor rules file next to it, and opens Cursor. A coding agent then starts the task already knowing what the meeting decided. No copy-paste, no re-explaining context.

It's open source, it leans on GitHub and Cursor where it counts, and it's built for people who spend their day in meetings and would rather be writing code.

```
"Let's fix the flaky auth test and ship the rate-limiter by Friday."
        │
        ▼
  live notes  →  action items  →  linked to issue #142
        │
        ▼
  calendar hold (auto)   github comment (ask first)   cursor handoff (ask first)
```

## What it does

- **Live capture.** Notes get structured while the conversation is still going, not after you've forgotten half of it. Works with Slack huddles and channels, mic sessions (ElevenLabs Scribe, with browser speech as a fallback), or anything you paste in.
- **Actions, not just summaries.** Blaze pulls intents out of the conversation, scores how risky each one is, and acts. Calendar holds and task updates go through on their own; comments, emails, and handoffs don't.
- **You stay in control.** High-risk actions sit in a confirm queue until you approve them. Approve from the web or tap the button Blaze posts in Slack.
- **A GitHub inbox that's actually ranked.** Assignments, mentions, and review requests show up sorted by what matters, and meeting notes get matched to the issues they mention.
- **Search that understands meaning.** Every conversation and GitHub item is embedded with pgvector, so live notes auto-link related PRs and issues, and search finds the decision instead of just the keyword.
- **Cursor handoffs.** Turn "let's fix #142" into a brief plus a rules file dropped into your local repo.
- **Recipes.** Saved prompts (follow-up email, exec summary, action items) you can run on any session.
- **A desktop app.** A small Tauri companion handles the local Cursor handoff even when the API itself runs in the cloud.

## How it works

The loop is simple: capture, understand, act. Two LangGraph pipelines do the heavy lifting.

When a session is active, the **live-notes graph** pulls in related context from past sessions and GitHub, indexes the new transcript, and writes a running summary. In parallel, the **intent graph** extracts what people committed to, runs each item through a risk classifier, and either executes it or drops it in your confirm queue. Low-confidence or sensitive items (anything mentioning firing someone, passwords, "delete all", and so on) are always treated as high risk, so nothing surprising happens on its own.

## Quick start

You can have the UI running in about five minutes, and you don't need any paid keys to look around. Demo login is enough.

```bash
git clone https://github.com/LefterisXefteris/blaze.git
cd blaze

# frontend + python backend venv
npm install
npm run setup:api

# config
cp .env.example .env
#   set BLAZE_JWT_SECRET to any long random string
#   set DEV_DEMO_LOGIN=true so the "Enter demo" button shows up

# database (docker postgres + pgvector)
npm run db:setup

# run the api and the web app together
npm run dev:all
```

Open [http://localhost:3010](http://localhost:3010) and click **Enter demo**.

Add an `OPENAI_API_KEY` when you want embeddings, semantic search, and AI notes. Slack, GitHub, Google, and ElevenLabs are all optional and stay off until you wire them up.

## Tech stack

- **Next.js 16 + React 19** for the frontend, with JWT cookie sessions and Google OAuth or demo login.
- **FastAPI** for the backend API, agents, and integrations (`backend/`).
- **LangGraph** for agent orchestration (the intent and live-notes pipelines).
- **Postgres + pgvector** for storage and semantic search, running in Docker locally.
- **OpenAI** for embeddings and intent extraction.
- **Tauri** for the desktop companion (`desktop/`) that handles local Cursor handoffs.
- **Redis** for the background job queue (optional; there's an in-process fallback).

## Full setup

### Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| [Node.js](https://nodejs.org/) | 20+ | Frontend, Prisma, scripts |
| [Python](https://www.python.org/) | 3.12+ | FastAPI backend |
| [Git](https://git-scm.com/) | any | Cloning the repo |
| [Docker](https://www.docker.com/) | recommended | Local Postgres + pgvector |
| [Rust](https://rustup.rs/) | optional | Only for the desktop app |

No third-party keys ship in this repo. You bring your own and keep them in a local `.env` (see [Secrets and API keys](#secrets-and-api-keys)).

### 1. Clone

```bash
git clone https://github.com/LefterisXefteris/blaze.git
cd blaze
```

Don't commit a `.env` file. It's gitignored; only `.env.example` (placeholders, no real secrets) is tracked.

### 2. Install dependencies

```bash
# frontend + prisma
npm install

# python backend (creates backend/.venv)
npm run setup:api
```

### 3. Configure your environment

```bash
cp .env.example .env
```

Then edit `.env`. The example file uses empty strings and safe placeholders, so replace them locally and never paste real keys into tracked files or pull requests.

To just run the UI locally with demo login and no integrations, you only need:

| Variable | Value |
|----------|-------|
| `BLAZE_JWT_SECRET` | Any long random string (shared by Next.js and FastAPI) |
| `DATABASE_URL` | `postgresql://lefteris:lefteris@localhost:5432/lefteris_os` |
| `DIRECT_URL` | Same as `DATABASE_URL` for local dev |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3010` |
| `DEV_DEMO_LOGIN` | `true`, which enables **Enter demo** |

Add the keys you actually need and leave the rest blank:

| Variable | Where to get it | What it unlocks |
|----------|-----------------|-----------------|
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/) | Embeddings, vector search, live notes, intent extraction |
| `ELEVENLABS_API_KEY` | [ElevenLabs](https://elevenlabs.io/) | Realtime voice for Slack huddles (falls back to browser speech) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/) | Sign in with Google plus Calendar |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_WEBHOOK_SECRET` | GitHub OAuth App + webhook | Issues, PRs, coding handoffs |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | [Slack API](https://api.slack.com/apps) | Slack meeting capture |

Blaze runs fine without any of these. The matching features just stay dark until you configure them.

### 4. Set up the database

```bash
npm run db:setup
```

That starts Docker Postgres (`pgvector/pgvector:pg16`), applies the Prisma schema, and turns on the `vector` extension for semantic search.

Or do it step by step:

```bash
docker compose up postgres -d
npm run db:push
npm run db:vectors
```

### 5. Start the app

One command from the repo root runs both the API and the web app:

```bash
npm run dev:all
```

Open [http://localhost:3010](http://localhost:3010). The frontend proxies `/api/*` to FastAPI at `http://127.0.0.1:8000`. Blaze runs on port 3010 on purpose, so it won't fight Grafana or anything else sitting on 3000.

Prefer to run them apart:

```bash
# terminal 1 — fastapi
npm run dev:api

# terminal 2 — next.js
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

## Project layout

```
blaze/
├── src/                 # next.js frontend (pages, components, lib)
├── backend/             # fastapi api, agents, integrations
├── desktop/             # tauri desktop app (local cursor handoffs)
├── prisma/              # database schema + migrations
├── docker-compose.yml   # postgres (pgvector), redis, api, worker
├── .env.example         # environment template — copy to .env
└── package.json         # root scripts (dev, db, worker, desktop)
```

## Architecture

```
Browser → Next.js (:3010)  ──proxy /api/*──►  FastAPI (:8000)
         ↓ blaze-auth-token cookie              ↓
    Local JWT sessions                      Postgres + pgvector
```

- The **frontend** (`src/app/`, `src/components/`) is the React app and issues a session JWT on login.
- The **backend** (`backend/app/`) holds the API routes, agents, integrations, and vector search.
- **Auth** is demo login or Google OAuth. FastAPI checks the same JWT whether it arrives as a cookie or an `Authorization: Bearer` header.

Behind that, the two LangGraph pipelines do the work: the intent graph (extract, classify risk, then execute or queue) and the live-notes graph (retrieve context, index the transcript, generate the summary).

## Integrations

### Google sign-in (optional)

1. Create a Google Cloud OAuth client (Web application).
2. Enable the Google Calendar API for the project.
3. Add the redirect URIs:
   - `http://localhost:3010/auth/callback` (sign-in)
   - `http://localhost:3010/api/integrations/google/callback` (connect from Settings)
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

No Google OAuth? Use **Enter demo** with `DEV_DEMO_LOGIN=true`.

### Slack meeting capture

1. Create a Slack app with OAuth and Event Subscriptions pointed at `{APP_URL}/api/slack/events`.
2. Add bot scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `users:read`, `chat:write`.
3. Subscribe to events: `message.channels`, `message.groups`, `message.im`, `huddle_started`, `huddle_ended`.
4. Connect it under **Settings → Slack**.
5. Hit **Capture Slack meeting** on the home page and pick a channel.

When a huddle starts (or you invite Blaze into a channel), it spins up a capture session and posts live notes back to Slack. Open that session in Blaze and voice capture uses ElevenLabs Scribe if `ELEVENLABS_API_KEY` is set, or browser speech otherwise.

### GitHub

1. Create a GitHub OAuth App with the callback `{APP_URL}/api/integrations/github/callback`.
2. Add a webhook at `{APP_URL}/api/github/webhook` for the `issues`, `issue_comment`, and `pull_request` events.
3. Connect it under **Settings → GitHub**.

### Cursor handoff (local dev)

Approve a **Hand off to coding agent** action and Blaze will:

1. Resolve the issue's GitHub repo to a local checkout (via Connections → Local repos, `~/.blaze/repos.json`, or `BLAZE_REPO_MAP`).
2. Write a markdown bundle into `.blaze/handoffs/` inside that repo (or the nearest git repo if it isn't mapped).
3. Open that workspace in Cursor and add the handoff file.
4. Write `.cursor/rules/blaze-handoff.mdc` so Cursor picks the task up on its own.

Set `BLAZE_CURSOR_HANDOFF=off` to skip the auto-open. From the CLI:

```bash
# preview the handoff markdown (needs BLAZE_USER_ID in .env)
npm run blaze -- handoff <action-id>

# write the file and open it in cursor
npm run blaze -- handoff <action-id> --run
```

Install the [Cursor CLI](https://cursor.com/docs/cli) (so `cursor` is on your PATH) for the smoothest experience.

### Desktop app

The Tauri companion in `desktop/` wraps the web UI and does the local handoff work: write the file, open Cursor, drop the rules snippet. Use it for production, or any time the API is running in Docker or the cloud.

```bash
npm run desktop:install
npm run dev:all        # api + web, then the desktop app in another terminal
```

See [desktop/README.md](desktop/README.md) for the details. On cloud deployments, set `BLAZE_CURSOR_HANDOFF=off` and let the desktop app own the Cursor integration.

## Docker

`docker-compose.yml` covers local development:

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Postgres with pgvector (`lefteris` / `lefteris` / `lefteris_os`) |
| `redis` | 6379 | Background job queue |
| `api` | 8000 | FastAPI backend container |
| `worker` | — | Intent extraction worker |

Just Postgres (the usual local setup):

```bash
docker compose up postgres -d
npm run db:setup
```

The full API and worker:

```bash
docker compose up api worker redis postgres -d
```

You still run the Next.js frontend yourself with `npm run dev` unless you deploy it somewhere else.

## Environment variables

The full template lives in [`.env.example`](.env.example). Every integration key defaults to empty; you supply your own.

| Variable | Required | Description |
|----------|----------|-------------|
| `BLAZE_JWT_SECRET` | Yes | Shared secret for session JWTs (Next.js + FastAPI); generate your own |
| `DATABASE_URL` | Yes | Local Postgres connection string |
| `DIRECT_URL` | Yes | Same as `DATABASE_URL` for local dev |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for OAuth redirects |
| `API_URL` | Local dev | FastAPI URL for the Next.js proxy (default `http://127.0.0.1:8000`) |
| `DEV_DEMO_LOGIN` | Local | `true` enables the demo login button |
| `OPENAI_API_KEY` | Your key | LLM + embeddings ([get a key](https://platform.openai.com/)) |
| `ELEVENLABS_API_KEY` | Your key | Realtime voice for Slack huddles ([get a key](https://elevenlabs.io/)) |
| `GOOGLE_CLIENT_ID` | Your key | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | Your key | Google Cloud OAuth secret |
| `GITHUB_CLIENT_ID` | Your key | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | Your key | GitHub OAuth secret |
| `GITHUB_WEBHOOK_SECRET` | Your key | GitHub webhook signing secret |
| `SLACK_CLIENT_ID` | Your key | Slack app client ID |
| `SLACK_CLIENT_SECRET` | Your key | Slack app client secret |
| `SLACK_SIGNING_SECRET` | Your key | Slack request signing secret |
| `REDIS_URL` | Optional | Job queue (needs `npm run worker`) |

### Secrets and API keys

This repo ships no production or personal keys. Setup is bring-your-own on purpose:

1. Copy `.env.example` to `.env` (and never commit `.env`).
2. Sign up with each provider you need and create your own keys.
3. Paste keys only into your local `.env` or your deployment's secret store.

`.gitignore` excludes `.env*` except `.env.example`, which holds empty placeholders only. So: don't commit `.env` or anything with a real secret, don't share keys in issues or screenshots, and rotate any key that's ever been exposed before reusing it.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `db:push` fails | Run `docker compose up postgres -d` and double-check `DATABASE_URL` |
| pgvector errors | Run `npm run db:vectors` after `db:push` |
| API returns 401 | Make sure `BLAZE_JWT_SECRET` matches in `.env`, then restart `dev:all` |
| `/api/*` errors in the browser | Make sure `npm run dev:api` is up on port 8000 |
| Demo login fails | Set `DEV_DEMO_LOGIN=true` and run `npm run db:setup` |
| Handoffs don't open Cursor | Install the [Cursor CLI](https://cursor.com/docs/cli) or use the desktop app |

## Contributing

Issues, ideas, and pull requests are all welcome.

1. Fork the repo and branch off `main`.
2. Get it running locally (see [Quick start](#quick-start)).
3. Make your change and open a PR with a clear description of what and why.

## License

[MIT](LICENSE) © Lefteris Xefteris

---

<div align="center">

If Blaze saves you some time, a star goes a long way.

</div>
