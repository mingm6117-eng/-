#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
PID_FILE="$ROOT_DIR/.dev-up.pids"
SERVER_LOG_FILE="$ROOT_DIR/.dev-up-server.log"
CLIENT_LOG_FILE="$ROOT_DIR/.dev-up-client.log"
APP_URL="http://127.0.0.1:5173/"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Missing node. Please install Node.js first."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Missing npm. Please install npm first."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created .env from .env.example. Please review your LLM_PROVIDER / LLM_API_KEY settings."
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

for port in 5500 5173 5174; do
  if lsof -ti ":$port" >/dev/null 2>&1; then
    kill -9 $(lsof -ti ":$port") >/dev/null 2>&1 || true
  fi
done

if [ -f "$PID_FILE" ]; then
  rm -f "$PID_FILE"
fi

nohup env PORT=5500 node server.js >"$SERVER_LOG_FILE" 2>&1 &
SERVER_PID=$!
nohup env VITE_PORT=5173 npx vite --host 0.0.0.0 >"$CLIENT_LOG_FILE" 2>&1 &
CLIENT_PID=$!
printf "%s\n%s\n" "$SERVER_PID" "$CLIENT_PID" >"$PID_FILE"

for _ in $(seq 1 40); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if command -v openclaw >/dev/null 2>&1; then
  (
    openclaw browser status --json >/dev/null 2>&1 || openclaw browser start --json >/dev/null 2>&1 || true
    openclaw browser open "$APP_URL" --json >/dev/null 2>&1 || true
  ) &
fi

echo "Industry brief site is starting."
echo "URL: $APP_URL"
echo "Server PID: $SERVER_PID"
echo "Client PID: $CLIENT_PID"
echo "Server log: $SERVER_LOG_FILE"
echo "Client log: $CLIENT_LOG_FILE"
echo "Manual refresh: npm run update"
