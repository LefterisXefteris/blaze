#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.langfuse.yml)
# Slack webhooks: ngrok http 8000 (API direct) or ngrok http 3010 (Next.js proxy → API)

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example to .env and fill in values." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

get_ngrok_url() {
  curl -fsS http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | cut -d'"' -f4
}

print_status() {
  echo ""
  echo "Blaze API:  http://localhost:8000"
  echo "Langfuse:   http://localhost:3100"
  local url
  url="$(get_ngrok_url || true)"
  if [[ -n "$url" ]]; then
    echo "ngrok:      $url"
    echo "Slack:      $url/api/slack/events"
  else
    echo "ngrok:      (not detected — run: ngrok http 8000  or  ngrok http 3010)"
  fi
  echo ""
  echo "Start UI when needed:  ./run.sh dev"
}

cmd="${1:-up}"
shift || true

case "$cmd" in
  up)
    "${COMPOSE[@]}" up -d --build "$@"
    print_status
    ;;
  dev)
    echo "Starting Next.js on http://localhost:3010 (API at http://localhost:8000)"
    exec npm run dev
    ;;
  down)
    "${COMPOSE[@]}" down "$@"
    ;;
  url)
    url="$(get_ngrok_url || true)"
    if [[ -n "$url" ]]; then
      echo "$url"
      echo "Slack events: $url/api/slack/events"
    else
      echo "ngrok is not running — start it separately: ngrok http 8000  or  ngrok http 3010" >&2
      exit 1
    fi
    ;;
  logs)
    "${COMPOSE[@]}" logs "$@"
    ;;
  ps)
    "${COMPOSE[@]}" ps "$@"
    ;;
  restart)
    "${COMPOSE[@]}" restart "$@"
    print_status
    ;;
  *)
    "${COMPOSE[@]}" "$cmd" "$@"
    ;;
esac
