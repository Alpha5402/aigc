#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-agricloud-api}"
RAG_APP_NAME="${RAG_APP_NAME:-agricloud-rag}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-ubuntu@123.58.210.188}"
REMOTE_BASE_DIR="${REMOTE_BASE_DIR:-/opt/agricloud}"
REMOTE_FRONTEND_DIR="${REMOTE_FRONTEND_DIR:-$REMOTE_BASE_DIR/frontend}"
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-$REMOTE_BASE_DIR/backend}"
REMOTE_SCRIPTS_DIR="${REMOTE_SCRIPTS_DIR:-$REMOTE_BASE_DIR/scripts}"
REMOTE_RAG_DIR="${REMOTE_RAG_DIR:-$REMOTE_BASE_DIR/rag}"
REMOTE_DEPLOY_DIR="${REMOTE_DEPLOY_DIR:-$REMOTE_BACKEND_DIR/deploy}"
REMOTE_NGINX_SITE_NAME="${REMOTE_NGINX_SITE_NAME:-agricloud.conf}"
REMOTE_NGINX_SITE_PATH="${REMOTE_NGINX_SITE_PATH:-/etc/nginx/sites-available/$REMOTE_NGINX_SITE_NAME}"
REMOTE_NGINX_ENABLED_PATH="${REMOTE_NGINX_ENABLED_PATH:-/etc/nginx/sites-enabled/$REMOTE_NGINX_SITE_NAME}"
REMOTE_USER_IS_ROOT="${REMOTE_USER_IS_ROOT:-0}"
REMOTE_SUDO=""
DOMAIN_NAME="${DOMAIN_NAME:-ysngj.cn}"
DOMAIN_ALIASES="${DOMAIN_ALIASES:-www.ysngj.cn 123.58.210.188}"
API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:3000/api/}"
API_HEALTH_UPSTREAM="${API_HEALTH_UPSTREAM:-http://127.0.0.1:3000/api/health}"
NGINX_ACCESS_LOG="${NGINX_ACCESS_LOG:-/var/log/nginx/agricloud.access.log}"
NGINX_ERROR_LOG="${NGINX_ERROR_LOG:-/var/log/nginx/agricloud.error.log}"
LOCAL_DIST_DIR="$PROJECT_ROOT/dist/build/h5"
LOCAL_BACKEND_DIR="$PROJECT_ROOT/backend"
LOCAL_RAG_DIR="$PROJECT_ROOT/rag"
LOCAL_SCRIPTS_DIR="$PROJECT_ROOT/scripts"
LOCAL_BACKEND_ENV="$LOCAL_BACKEND_DIR/.env"
LOCAL_BACKEND_PACKAGE_JSON="$LOCAL_BACKEND_DIR/package.json"
LOCAL_BACKEND_PACKAGE_LOCK="$LOCAL_BACKEND_DIR/package-lock.json"
LOCAL_DEPLOY_DIR="$PROJECT_ROOT/deploy"
LOCAL_RENDER_DIR="$LOCAL_DEPLOY_DIR/.rendered"
LOCAL_RENDERED_NGINX="$LOCAL_RENDER_DIR/nginx.conf"
LOCAL_RENDERED_LIGHTRAG_ENV="$LOCAL_RENDER_DIR/lightrag.env"
LOCAL_RENDERED_BACKEND_LIGHTRAG_ENV="$LOCAL_RENDER_DIR/backend-lightrag.env"
LOCAL_ENV_PRODUCTION="$PROJECT_ROOT/.env.production"
LOCAL_ENV_PRODUCTION_EXAMPLE="$PROJECT_ROOT/.env.production.example"
RUN_REMOTE="${RUN_REMOTE:-1}"
INSTALL_LIGHTRAG="${INSTALL_LIGHTRAG:-1}"
LIGHTRAG_PORT="${LIGHTRAG_PORT:-9621}"
LIGHTRAG_SYNC_LIMIT="${LIGHTRAG_SYNC_LIMIT:-120}"
ENABLE_CERTBOT="${ENABLE_CERTBOT:-1}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@$DOMAIN_NAME}"

if [[ "$REMOTE_USER_IS_ROOT" != "1" ]]; then
  REMOTE_SUDO="sudo"
fi

log() {
  printf '[deploy] %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

env_value() {
  local key="$1"
  if [[ ! -f "$LOCAL_BACKEND_ENV" ]]; then
    return 0
  fi
  awk -v key="$key" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
    }
    END {
      print value
    }
  ' "$LOCAL_BACKEND_ENV"
}

ensure_env_production() {
  if [[ -f "$LOCAL_ENV_PRODUCTION" ]]; then
    log "Using $LOCAL_ENV_PRODUCTION"
    return
  fi

  if [[ -f "$LOCAL_ENV_PRODUCTION_EXAMPLE" ]]; then
    printf '.env.production is missing. Create it from .env.production.example before deployment.\n' >&2
    exit 1
  fi

  printf 'Missing both .env.production and .env.production.example\n' >&2
  exit 1
}

render_lightrag_env() {
  mkdir -p "$LOCAL_RENDER_DIR"
  local dashscope_api_key="${DASHSCOPE_API_KEY:-$(env_value DASHSCOPE_API_KEY)}"
  local dashscope_model="${DASHSCOPE_TEXT_MODEL:-$(env_value DASHSCOPE_TEXT_MODEL)}"
  local rag_api_key="${LIGHTRAG_API_KEY:-$(env_value LIGHTRAG_API_KEY)}"

  if [[ -z "$dashscope_model" ]]; then
    dashscope_model="qwen3.6-flash"
  fi
  if [[ -z "$rag_api_key" ]]; then
    if command -v openssl >/dev/null 2>&1; then
      rag_api_key="$(openssl rand -hex 24)"
    elif command -v node >/dev/null 2>&1; then
      rag_api_key="$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")"
    else
      rag_api_key="agricloud-rag-$(date +%s)-$RANDOM"
    fi
  fi

  cat > "$LOCAL_RENDERED_LIGHTRAG_ENV" <<EOF
HOST=127.0.0.1
PORT=$LIGHTRAG_PORT
WORKSPACE=agricloud-market
SUMMARY_LANGUAGE=Chinese
ENABLE_LLM_CACHE_FOR_EXTRACT=true
MAX_PARALLEL_INSERT=1
MAX_ASYNC=2
TIMEOUT=180
LIGHTRAG_KV_STORAGE=JsonKVStorage
LIGHTRAG_VECTOR_STORAGE=NanoVectorDBStorage
LIGHTRAG_GRAPH_STORAGE=NetworkXStorage
LIGHTRAG_DOC_STATUS_STORAGE=JsonDocStatusStorage
LLM_BINDING=openai
LLM_MODEL=$dashscope_model
LLM_BINDING_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_BINDING_API_KEY=$dashscope_api_key
OPENAI_LLM_MAX_TOKENS=9000
OPENAI_LLM_EXTRA_BODY='{"enable_thinking":false}'
EMBEDDING_BINDING=openai
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_DIM=1024
EMBEDDING_BINDING_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_BINDING_API_KEY=$dashscope_api_key
RERANK_BY_DEFAULT=False
LIGHTRAG_API_KEY=$rag_api_key
WHITELIST_PATHS=/health
EOF

  cat > "$LOCAL_RENDERED_BACKEND_LIGHTRAG_ENV" <<EOF
LIGHTRAG_ENABLED=true
LIGHTRAG_BASE_URL=http://127.0.0.1:$LIGHTRAG_PORT
LIGHTRAG_API_KEY=$rag_api_key
LIGHTRAG_QUERY_MODE=mix
LIGHTRAG_TIMEOUT_MS=120000
LIGHTRAG_TOP_K=10
LIGHTRAG_CHUNK_TOP_K=8
LIGHTRAG_ENABLE_RERANK=false
MARKET_REPORT_AI_ENABLED=true
MARKET_REPORT_AI_TIMEOUT_MS=60000
DASHSCOPE_MARKET_ENABLE_THINKING=false
EOF

  log "Rendered LightRAG env files"
}

build_frontend() {
  log "Building H5 frontend"
  cd "$PROJECT_ROOT"
  npm run build:h5
  if [[ ! -f "$LOCAL_DIST_DIR/index.html" ]]; then
    printf 'Frontend build output missing: %s\n' "$LOCAL_DIST_DIR/index.html" >&2
    exit 1
  fi
}

prepare_backend_bundle() {
  log "Checking backend entrypoint"
  if [[ ! -f "$LOCAL_BACKEND_DIR/server.js" ]]; then
    printf 'Backend entrypoint missing: %s\n' "$LOCAL_BACKEND_DIR/server.js" >&2
    exit 1
  fi

  if [[ ! -f "$LOCAL_BACKEND_ENV" ]]; then
    printf 'Backend .env is missing: %s\n' "$LOCAL_BACKEND_ENV" >&2
    exit 1
  fi

  if [[ ! -f "$LOCAL_BACKEND_PACKAGE_JSON" ]]; then
    printf 'Backend package.json is missing: %s\n' "$LOCAL_BACKEND_PACKAGE_JSON" >&2
    exit 1
  fi

  if [[ ! -f "$LOCAL_RAG_DIR/requirements.txt" ]]; then
    printf 'LightRAG requirements file is missing: %s\n' "$LOCAL_RAG_DIR/requirements.txt" >&2
    exit 1
  fi
}

render_nginx_config() {
  mkdir -p "$LOCAL_RENDER_DIR"
  local server_names="$DOMAIN_NAME $DOMAIN_ALIASES"
  local escaped_server_names
  local escaped_frontend_root
  local escaped_api_upstream
  local escaped_api_health
  local escaped_access_log
  local escaped_error_log

  escaped_server_names="$(escape_sed_replacement "$server_names")"
  escaped_frontend_root="$(escape_sed_replacement "$REMOTE_FRONTEND_DIR")"
  escaped_api_upstream="$(escape_sed_replacement "$API_UPSTREAM")"
  escaped_api_health="$(escape_sed_replacement "$API_HEALTH_UPSTREAM")"
  escaped_access_log="$(escape_sed_replacement "$NGINX_ACCESS_LOG")"
  escaped_error_log="$(escape_sed_replacement "$NGINX_ERROR_LOG")"

  sed \
    -e "s/__SERVER_NAMES__/$escaped_server_names/g" \
    -e "s/__FRONTEND_ROOT__/$escaped_frontend_root/g" \
    -e "s/__API_PROXY_PASS__/$escaped_api_upstream/g" \
    -e "s/__API_HEALTH_PROXY_PASS__/$escaped_api_health/g" \
    -e "s/__ACCESS_LOG__/$escaped_access_log/g" \
    -e "s/__ERROR_LOG__/$escaped_error_log/g" \
    "$LOCAL_DEPLOY_DIR/nginx.conf" > "$LOCAL_RENDERED_NGINX"

  log "Rendered nginx config to $LOCAL_RENDERED_NGINX"
}

print_plan() {
  cat <<EOF
Deployment plan
  Project root:         $PROJECT_ROOT
  Remote host:          $REMOTE_HOST
  Remote base dir:      $REMOTE_BASE_DIR
  Frontend target:      $REMOTE_FRONTEND_DIR
  Backend target:       $REMOTE_BACKEND_DIR
  LightRAG target:      $REMOTE_RAG_DIR
  LightRAG port:        $LIGHTRAG_PORT
  Nginx site path:      $REMOTE_NGINX_SITE_PATH
  Domain name:          $DOMAIN_NAME
  Domain aliases:       $DOMAIN_ALIASES
  Rendered nginx file:  $LOCAL_RENDERED_NGINX
  Remote execution:     $RUN_REMOTE
EOF
}

run_remote_deploy() {
  require_cmd ssh
  require_cmd rsync

  log "Creating remote directories"
  ssh "$REMOTE_HOST" "$REMOTE_SUDO mkdir -p '$REMOTE_FRONTEND_DIR' '$REMOTE_BACKEND_DIR/data' '$REMOTE_DEPLOY_DIR' '$REMOTE_SCRIPTS_DIR' '$REMOTE_RAG_DIR' '$REMOTE_RAG_DIR/inputs' '$REMOTE_RAG_DIR/rag_storage' && $REMOTE_SUDO chown -R \$(id -un):\$(id -gn) '$REMOTE_BASE_DIR'"

  log "Uploading frontend env file"
  rsync -av "$LOCAL_ENV_PRODUCTION" "$REMOTE_HOST:$REMOTE_DEPLOY_DIR/.env.production"

  log "Uploading frontend bundle"
  rsync -av --delete "$LOCAL_DIST_DIR"/ "$REMOTE_HOST:$REMOTE_FRONTEND_DIR/"

  log "Uploading backend source"
  rsync -av \
    --delete \
    --exclude '.env' \
    --exclude 'data/*.sqlite' \
    --exclude 'data/*.sqlite-*' \
    --exclude 'deploy' \
    "$LOCAL_BACKEND_DIR"/ "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"

  ssh "$REMOTE_HOST" "$REMOTE_SUDO mkdir -p '$REMOTE_DEPLOY_DIR' && $REMOTE_SUDO chown -R \$(id -un):\$(id -gn) '$REMOTE_DEPLOY_DIR'"

  log "Uploading backend env file"
  rsync -av "$LOCAL_BACKEND_ENV" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/.env"

  log "Uploading LightRAG env overlays"
  rsync -av "$LOCAL_RENDERED_BACKEND_LIGHTRAG_ENV" "$REMOTE_HOST:$REMOTE_DEPLOY_DIR/backend-lightrag.env"
  ssh "$REMOTE_HOST" "tmp_file=\$(mktemp) && grep -v -E '^(LIGHTRAG_ENABLED|LIGHTRAG_BASE_URL|LIGHTRAG_API_KEY|LIGHTRAG_QUERY_MODE|LIGHTRAG_TIMEOUT_MS|LIGHTRAG_TOP_K|LIGHTRAG_CHUNK_TOP_K|LIGHTRAG_ENABLE_RERANK|MARKET_REPORT_AI_ENABLED|MARKET_REPORT_AI_TIMEOUT_MS|DASHSCOPE_MARKET_ENABLE_THINKING)=' '$REMOTE_BACKEND_DIR/.env' > \$tmp_file || true && cat \$tmp_file '$REMOTE_DEPLOY_DIR/backend-lightrag.env' > '$REMOTE_BACKEND_DIR/.env' && rm -f \$tmp_file"

  log "Uploading package manifests"
  if [[ -f "$LOCAL_BACKEND_PACKAGE_LOCK" ]]; then
    rsync -av \
      "$LOCAL_BACKEND_PACKAGE_JSON" \
      "$LOCAL_BACKEND_PACKAGE_LOCK" \
      "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"
  else
    rsync -av \
      "$LOCAL_BACKEND_PACKAGE_JSON" \
      "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"
  fi

  log "Uploading rendered nginx config"
  rsync -av "$LOCAL_RENDERED_NGINX" "$REMOTE_HOST:$REMOTE_DEPLOY_DIR/nginx.conf"

  log "Uploading scripts and LightRAG service files"
  rsync -av "$LOCAL_SCRIPTS_DIR"/ "$REMOTE_HOST:$REMOTE_SCRIPTS_DIR/"
  if [[ -f "$PROJECT_ROOT/backend/data/market_docs.jsonl" ]]; then
    rsync -av "$PROJECT_ROOT/backend/data/market_docs.jsonl" "$REMOTE_HOST:$REMOTE_BACKEND_DIR/data/market_docs.jsonl"
  fi
  rsync -av \
    --delete \
    --exclude '.env' \
    --exclude '.venv' \
    --exclude 'inputs' \
    --exclude 'rag_storage' \
    --exclude 'logs' \
    "$LOCAL_RAG_DIR"/ "$REMOTE_HOST:$REMOTE_RAG_DIR/"
  rsync -av "$LOCAL_RENDERED_LIGHTRAG_ENV" "$REMOTE_HOST:$REMOTE_RAG_DIR/.env"

  log "Installing nginx site"
  ssh "$REMOTE_HOST" "$REMOTE_SUDO cp '$REMOTE_DEPLOY_DIR/nginx.conf' '$REMOTE_NGINX_SITE_PATH' && $REMOTE_SUDO ln -sf '$REMOTE_NGINX_SITE_PATH' '$REMOTE_NGINX_ENABLED_PATH' && $REMOTE_SUDO nginx -t && $REMOTE_SUDO systemctl reload nginx"

  if [[ "$ENABLE_CERTBOT" == "1" ]]; then
    log "Refreshing Certbot nginx HTTPS config for $DOMAIN_NAME"
    ssh "$REMOTE_HOST" "if command -v certbot >/dev/null 2>&1; then $REMOTE_SUDO certbot --nginx -d '$DOMAIN_NAME' --non-interactive --agree-tos -m '$CERTBOT_EMAIL' --redirect --keep-until-expiring && $REMOTE_SUDO nginx -t && $REMOTE_SUDO systemctl reload nginx; else echo 'certbot not installed, skipping HTTPS refresh'; fi"
  fi

  if [[ "$INSTALL_LIGHTRAG" == "1" ]]; then
    log "Installing LightRAG Python dependencies"
    ssh "$REMOTE_HOST" "cd '$REMOTE_RAG_DIR' && python3 -m venv .venv && .venv/bin/python -m pip install --upgrade pip && .venv/bin/pip install -r requirements.txt"
  else
    log "INSTALL_LIGHTRAG=0, skipping LightRAG dependency install"
  fi

  log "Starting or restarting LightRAG with PM2"
  ssh "$REMOTE_HOST" "cd '$REMOTE_RAG_DIR' && if pm2 describe '$RAG_APP_NAME' >/dev/null 2>&1; then pm2 restart '$RAG_APP_NAME' --update-env; else pm2 start bash --name '$RAG_APP_NAME' --cwd '$REMOTE_RAG_DIR' -- -lc 'set -a; . ./.env; set +a; exec .venv/bin/lightrag-server --host 127.0.0.1 --port \"\${PORT:-$LIGHTRAG_PORT}\" --working-dir ./rag_storage --input-dir ./inputs'; fi && pm2 save"

  log "Waiting for LightRAG health check"
  ssh "$REMOTE_HOST" "for i in \$(seq 1 30); do if curl -fsS 'http://127.0.0.1:$LIGHTRAG_PORT/health' >/dev/null 2>&1; then exit 0; fi; sleep 2; done; pm2 logs '$RAG_APP_NAME' --lines 40 --nostream; exit 1"

  log "Syncing market documents into LightRAG"
  ssh "$REMOTE_HOST" "cd '$REMOTE_BASE_DIR' && set -a && . '$REMOTE_DEPLOY_DIR/backend-lightrag.env' && set +a && LIGHTRAG_BASE_URL='http://127.0.0.1:$LIGHTRAG_PORT' node scripts/sync-lightrag-market.js --limit '$LIGHTRAG_SYNC_LIMIT'"

  log "Installing production dependencies and restarting PM2"
  ssh "$REMOTE_HOST" "cd '$REMOTE_BACKEND_DIR' && if [[ -f package-lock.json ]]; then npm ci --omit=dev; else npm install --omit=dev; fi && if pm2 describe '$APP_NAME' >/dev/null 2>&1; then pm2 restart '$APP_NAME' --update-env; else pm2 start server.js --name '$APP_NAME' --update-env; fi && pm2 save"

  log "Remote deployment finished"
}

main() {
  require_cmd npm
  ensure_env_production
  render_nginx_config
  render_lightrag_env
  build_frontend
  prepare_backend_bundle
  print_plan

  if [[ "$RUN_REMOTE" == "1" ]]; then
    run_remote_deploy
  else
    log "RUN_REMOTE=0, finished local build-only validation"
  fi
}

main "$@"
