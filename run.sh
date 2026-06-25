#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.langfuse.yml)
RUNTIME_DIR="$ROOT/.blaze"
NGROK_PID_FILE="$RUNTIME_DIR/ngrok.pid"
NGROK_URL_FILE="$RUNTIME_DIR/ngrok.url"
NGROK_LOG_FILE="$RUNTIME_DIR/ngrok.log"
NGROK_PORT="${NGROK_PORT:-8000}"

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

start_ngrok() {
  if [[ "${SKIP_NGROK:-}" == "1" ]]; then
    echo "ngrok skipped (SKIP_NGROK=1)"
    return 0
  fi

  if ! command -v ngrok >/dev/null 2>&1; then
    echo "ngrok not found — install it for Slack/webhooks (brew install ngrok)" >&2
    return 0
  fi

  if [[ -f "$NGROK_PID_FILE" ]]; then
    local pid
    pid="$(cat "$NGROK_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      local existing_url
      existing_url="$(get_ngrok_url || true)"
      if [[ -n "$existing_url" ]]; then
        echo "$existing_url" >"$NGROK_URL_FILE"
        echo "ngrok already running: $existing_url → localhost:$NGROK_PORT"
      else
        echo "ngrok already running (pid $pid)"
      fi
      return 0
    fi
    rm -f "$NGROK_PID_FILE"
  fi

  mkdir -p "$RUNTIME_DIR"
  ngrok http "$NGROK_PORT" --log=stdout >"$NGROK_LOG_FILE" 2>&1 &
  echo $! >"$NGROK_PID_FILE"

  local url=""
  for _ in $(seq 1 40); do
    url="$(get_ngrok_url || true)"
    if [[ -n "$url" ]]; then
      echo "$url" >"$NGROK_URL_FILE"
      echo "ngrok: $url → localhost:$NGROK_PORT"
      echo "Slack events: $url/api/slack/events"
      return 0
    fi
    sleep 0.25
  done

  echo "ngrok started (pid $(cat "$NGROK_PID_FILE")) — URL not ready yet; try: ./run.sh url" >&2
}

stop_ngrok() {
  if [[ -f "$NGROK_PID_FILE" ]]; then
    local pid
    pid="$(cat "$NGROK_PID_FILE")"
    kill "$pid" 2>/dev/null || true
    rm -f "$NGROK_PID_FILE" "$NGROK_URL_FILE"
  fi
}

print_status() {
  echo ""
  echo "Blaze API:  http://localhost:8000"
  echo "Langfuse:   http://localhost:3100"
  if [[ -f "$NGROK_URL_FILE" ]]; then
    echo "Public URL: $(cat "$NGROK_URL_FILE")"
  fi
  echo ""
  echo "Start UI when needed:  ./run.sh dev"
}

cmd="${1:-up}"
shift || true

case "$cmd" in
  up)
    "${COMPOSE[@]}" up -d --build "$@"
    start_ngrok
    print_status
    ;;
  dev)
    echo "Starting Next.js on http://localhost:3010 (API at http://localhost:8000)"
    exec npm run dev
    ;;
  down)
    stop_ngrok
    "${COMPOSE[@]}" down "$@"
    ;;
  url)
    url="$(get_ngrok_url || true)"
    if [[ -z "$url" && -f "$NGROK_URL_FILE" ]]; then
      url="$(cat "$NGROK_URL_FILE")"
    fi
    if [[ -n "$url" ]]; then
      echo "$url"
      echo "Slack events: $url/api/slack/events"
    else
      echo "ngrok is not running — start with: ./run.sh up" >&2
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
    stop_ngrok
    start_ngrok
    ;;
  *)
    "${COMPOSE[@]}" "$cmd" "$@"
    ;;
esac
