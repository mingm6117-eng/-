#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="industry-brief-site"
ALIYUN_HOST="${ALIYUN_HOST:-}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/var/www/$APP_NAME}"
DOMAIN="${DOMAIN:-}"
REMOTE="$SSH_USER@$ALIYUN_HOST"

if [ -z "$ALIYUN_HOST" ]; then
  echo "Missing ALIYUN_HOST."
  echo "Example: ALIYUN_HOST=1.2.3.4 DOMAIN=example.com npm run deploy:aliyun"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then echo "Missing rsync. Please install rsync first."; exit 1; fi
if ! command -v ssh >/dev/null 2>&1; then echo "Missing ssh. Please install OpenSSH first."; exit 1; fi

cd "$ROOT_DIR"
if [ ! -d node_modules ]; then npm install; fi
npm run build
ssh -p "$SSH_PORT" "$REMOTE" "mkdir -p '$APP_DIR'"
rsync -az --delete --exclude ".git" --exclude ".env" --exclude "node_modules" --exclude ".dev-up*" --exclude "*.log" -e "ssh -p $SSH_PORT" "$ROOT_DIR/" "$REMOTE:$APP_DIR/"
ssh -p "$SSH_PORT" "$REMOTE" "cd '$APP_DIR' && npm ci --omit=dev && if [ ! -f .env ]; then cp .env.example .env; fi"
ssh -p "$SSH_PORT" "$REMOTE" "cd '$APP_DIR' && if command -v pm2 >/dev/null 2>&1; then pm2 startOrReload ecosystem.config.cjs --env production && pm2 save; else pkill -f 'node server.js' >/dev/null 2>&1 || true; nohup env PORT=5500 node server.js > app.log 2>&1 & fi"

if [ -n "$DOMAIN" ]; then
  ssh -p "$SSH_PORT" "$REMOTE" "if command -v nginx >/dev/null 2>&1; then cat > /tmp/$APP_NAME.conf <<'NGINX'
server {
  listen 80;
  server_name __DOMAIN__;
  location / {
    proxy_pass http://127.0.0.1:5500;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX
sed -i 's/__DOMAIN__/$DOMAIN/g' /tmp/$APP_NAME.conf
if [ -d /etc/nginx/conf.d ]; then cp /tmp/$APP_NAME.conf /etc/nginx/conf.d/$APP_NAME.conf; else cp /tmp/$APP_NAME.conf /etc/nginx/sites-available/$APP_NAME && ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME; fi
nginx -t && nginx -s reload
else echo 'Nginx not found on server. App is running on port 5500.'; fi"
fi

echo "Deploy finished."
if [ -n "$DOMAIN" ]; then echo "Open: http://$DOMAIN"; else echo "Open: http://$ALIYUN_HOST:5500"; fi
