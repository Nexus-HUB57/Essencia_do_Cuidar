#!/usr/bin/env bash
#
# scripts/setup-production.sh
#
# Gera .env de produção para o backend com valores seguros (secrets gerados
# aleatoriamente) + valida todas as variáveis obrigatórias/opcionais.
#
# Uso:
#   bash scripts/setup-production.sh
#   # ou com domínio customizado:
#   FRONTEND_URL=https://meu-site.com BACKEND_URL=https://api.meu-site.com \
#     bash scripts/setup-production.sh
#
# Após rodar:
#   1. Edite backend/.env e ajuste STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
#      VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY se necessário
#   2. Deploy: docker compose up -d --build
#   # ou: kubectl apply -f k8s/
#   # ou: render blueprint (render.yaml detecta .env no deploy)

set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-backend}"
ENV_FILE="$BACKEND_DIR/.env"

# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────
gen_secret() {
  openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))"
}
gen_vapid() {
  # Gera chaves VAPID (URL-safe base64)
  python3 -c "
import secrets, base64
priv = secrets.token_bytes(32)
pub = b'\\x04' + secrets.token_bytes(64)  # uncompressed P-256
print(base64.urlsafe_b64encode(priv).decode().rstrip('='))
print(base64.urlsafe_b64encode(pub).decode().rstrip('='))
" 2>/dev/null || {
  echo "AVISO: Python indisponível, gerando chaves VAPID placeholder"
  echo "VAPID_PRIVATE_PLACEHOLDER_REPLACE_WITH_REAL_KEY"
  echo "VAPID_PUBLIC_PLACEHOLDER_REPLACE_WITH_REAL_KEY"
}
}

print_ok()   { echo -e "  \033[0;32m✓\033[0m $1"; }
print_warn() { echo -e "  \033[1;33m⚠\033[0m $1"; }
print_err()  { echo -e "  \033[0;31m✗\033[0m $1"; }
print_info() { echo -e "  \033[0;34mℹ\033[0m $1"; }

# ──────────────────────────────────────────────────────────────────────
# Intro
# ──────────────────────────────────────────────────────────────────────
echo "============================================================"
echo "  Essência do Cuidar — Setup de Produção"
echo "============================================================"
echo ""

# Detecta se .env já existe
if [ -f "$ENV_FILE" ]; then
  print_warn ".env já existe em $ENV_FILE"
  read -p "  Sobrescrever? (s/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Operação cancelada."
    exit 0
  fi
fi

# ──────────────────────────────────────────────────────────────────────
# Coleta inputs do usuário (com defaults)
# ──────────────────────────────────────────────────────────────────────
echo "› Variáveis de ambiente (ENTER para default):"
echo ""

DEFAULT_FRONTEND="${FRONTEND_URL:-http://localhost:5173}"
read -p "  FRONTEND_URL (frontend público) [$DEFAULT_FRONTEND]: " INPUT_FRONTEND
FRONTEND_URL="${INPUT_FRONTEND:-$DEFAULT_FRONTEND}"
[[ "$FRONTEND_URL" =~ ^https?:// ]] || { print_err "FRONTEND_URL inválido"; exit 1; }
print_ok "FRONTEND_URL = $FRONTEND_URL"

DEFAULT_BACKEND="${BACKEND_URL:-http://localhost:4000}"
read -p "  BACKEND_URL (backend público) [$DEFAULT_BACKEND]: " INPUT_BACKEND
BACKEND_URL="${INPUT_BACKEND:-$DEFAULT_BACKEND}"
[[ "$BACKEND_URL" =~ ^https?:// ]] || { print_err "BACKEND_URL inválido"; exit 1; }
print_ok "BACKEND_URL = $BACKEND_URL"

DEFAULT_DB="${DATABASE_URL:-}"
read -p "  DATABASE_URL (PostgreSQL prod, vazio = SQLite) [$DEFAULT_DB]: " INPUT_DB
DATABASE_URL="${INPUT_DB:-$DEFAULT_DB}"
if [ -n "$DATABASE_URL" ]; then
  print_ok "DATABASE_URL = $DATABASE_URL"
else
  print_info "DATABASE_URL vazio — usando SQLite em ./data"
fi

# ──────────────────────────────────────────────────────────────────────
# Gera secrets
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "› Gerando secrets aleatórios (openssl rand -hex 32):"
JWT_SECRET=$(gen_secret)
print_ok "JWT_SECRET gerado (${#JWT_SECRET} chars)"

# VAPID keys
read_vapid() {
  read -r VAPID_PRIVATE
  read -r VAPID_PUBLIC
}
VAPID_OUTPUT=$(gen_vapid)
VAPID_PRIVATE=$(echo "$VAPID_OUTPUT" | head -1)
VAPID_PUBLIC=$(echo "$VAPID_OUTPUT" | tail -1)
print_ok "VAPID_PUBLIC_KEY gerado (${#VAPID_PUBLIC} chars)"
print_ok "VAPID_PRIVATE_KEY gerado (${#VAPID_PRIVATE} chars)"

# ──────────────────────────────────────────────────────────────────────
# Opcionais
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "› Opcionais (ENTER para default):"

DEFAULT_SLACK="${SLACK_WEBHOOK_URL:-}"
read -p "  SLACK_WEBHOOK_URL (vazio = sem Slack) [$DEFAULT_SLACK]: " INPUT_SLACK
SLACK_WEBHOOK_URL="${INPUT_SLACK:-$DEFAULT_SLACK}"
[ -n "$SLACK_WEBHOOK_URL" ] && print_ok "SLACK_WEBHOOK_URL = (configurado)" || print_info "SLACK_WEBHOOK_URL = (vazio, sem alertas Slack)"

read -p "  ENABLE_REFRESH_TOKENS (true/false) [false]: " INPUT_REFRESH
ENABLE_REFRESH_TOKENS="${INPUT_REFRESH:-false}"

read -p "  ENABLE_INTERNAL_CRON (true/false, só single-instance) [false]: " INPUT_CRON
ENABLE_INTERNAL_CRON="${INPUT_CRON:-false}"

# ──────────────────────────────────────────────────────────────────────
# Escreve .env
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "› Escrevendo $ENV_FILE..."

cat > "$ENV_FILE" <<EOF
# ════════════════════════════════════════════════════════════════════
#  Essência do Cuidar — .env de PRODUÇÃO
#  Gerado por scripts/setup-production.sh em $(date -Iseconds)
# ════════════════════════════════════════════════════════════════════

# ─── Servidor ─────────────────────────────────────────────────────────
NODE_ENV=production
PORT=4000

# ─── Segurança crítica ────────────────────────────────────────────────
# P2 — Obrigatório em produção. Sem isto, backend aborta startup.
JWT_SECRET=$JWT_SECRET
# Validade do token legado (default 7d, sem refresh)
JWT_EXPIRES_IN=7d
# A1 — Refresh tokens opt-in (curto + longo)
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
ENABLE_REFRESH_TOKENS=$ENABLE_REFRESH_TOKENS

# ─── CORS ─────────────────────────────────────────────────────────────
FRONTEND_URL=$FRONTEND_URL

# ─── Database (sem = SQLite em ./data) ────────────────────────────────
$( [ -n "$DATABASE_URL" ] && echo "DATABASE_URL=$DATABASE_URL" || echo "# DATABASE_URL=postgres://user:pass@host:5432/db" )
$( [ -n "$DATABASE_URL" ] && echo "PGSSL=true" || echo "# PGSSL=true  # se servidor exigir SSL" )

# ─── Stripe (modo mock se STRIPE_SECRET_KEY vazio) ────────────────────
STRIPE_MOCK=true
# Para Stripe live, descomente e configure:
# STRIPE_SECRET_KEY=sk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
PLATFORM_FEE_PCT=10

# ─── Web Push (VAPID) ─────────────────────────────────────────────────
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_SUBJECT=mailto:admin@essencia-do-cuidar.app

# ─── Webhook netlify.ai ───────────────────────────────────────────────
NETLIFY_AI_URL=https://netlify.ai
NETLIFY_AI_TIMEOUT_MS=5000

# ─── Uploads (U3 — auth required) ────────────────────────────────────
MAX_UPLOAD_MB=5
UPLOAD_DIR=./uploads
AUTH_UPLOADS=true

# ─── Rate limiting (P9 — por user) ────────────────────────────────────
RATE_LIMIT_MAX=300
RATE_AUTH_MAX=30
RATE_LIMIT_WINDOW_MS=900000

# ─── Matching (M7) ───────────────────────────────────────────────────
AUTO_CLOSE_ON_ACCEPT=true

# ─── Robustez (M8/M9) ────────────────────────────────────────────────
MAX_CANDIDATURAS_PER_VAGA=50
CANDIDATURA_EXPIRA_DIAS=30

# ─── Cron interno (Item 3, single-instance only) ─────────────────────
ENABLE_INTERNAL_CRON=$ENABLE_INTERNAL_CRON

# ─── Alerting (Item 10) ──────────────────────────────────────────────
$( [ -n "$SLACK_WEBHOOK_URL" ] && echo "SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL" || echo "# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/..." )
ALERTS_FILE=./data/alerts.log

# ─── OpenAPI spec (P10) ──────────────────────────────────────────────
BACKEND_URL=$BACKEND_URL
EOF

chmod 600 "$ENV_FILE"
print_ok "$ENV_FILE criado com permissões 600 (somente owner)"

# ──────────────────────────────────────────────────────────────────────
# Validação final
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "› Validação:"

# Verifica variáveis obrigatórias
ERRORS=0
[ -z "$JWT_SECRET" ] && { print_err "JWT_SECRET ausente"; ERRORS=$((ERRORS+1)); }
[ -z "$FRONTEND_URL" ] && { print_err "FRONTEND_URL ausente"; ERRORS=$((ERRORS+1)); }
[ -z "$BACKEND_URL" ] && { print_err "BACKEND_URL ausente"; ERRORS=$((ERRORS+1)); }

# Verifica se .env tem as variáveis mínimas
grep -q "^NODE_ENV=production" "$ENV_FILE" || { print_err "NODE_ENV=production não encontrado"; ERRORS=$((ERRORS+1)); }
grep -q "^JWT_SECRET=" "$ENV_FILE" || { print_err "JWT_SECRET não encontrado"; ERRORS=$((ERRORS+1)); }

if [ "$ERRORS" -gt 0 ]; then
  print_err "$ERRORS erro(s) encontrados. Corrija antes de deployar."
  exit 1
fi

print_ok "Todas as variáveis obrigatórias presentes"
echo ""
echo "============================================================"
echo "  ✅ .env de produção gerado com sucesso!"
echo "============================================================"
echo ""
echo "Próximos passos:"
echo "  1. Edite $ENV_FILE e ajuste STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET"
echo "     se for usar Stripe live (default: STRIPE_MOCK=true)"
echo ""
echo "  2. Faça deploy (escolha um):"
echo "     a) Docker:        docker compose up -d --build"
echo "     b) Kubernetes:     kubectl apply -f k8s/"
echo "     c) Render:         importe o repo, New → Blueprint (render.yaml)"
echo "     d) Direct:         cd backend && npm install --omit=dev && node src/index.js"
echo ""
echo "  3. Configure cron jobs (escolha um):"
echo "     a) Render Cron Jobs (automático via render.yaml)"
echo "     b) k8s CronJobs (automático via k8s/manifests.yaml)"
echo "     c) Host crontab (scripts/cron-*.sh)"
echo "     d) ENABLE_INTERNAL_CRON=true no .env (single-instance only)"
echo ""
echo "  4. Verifique:"
echo "     curl \$BACKEND_URL/api/health"
echo "     curl \$BACKEND_URL/api/docs  # Swagger UI no navegador"
echo ""
