#!/usr/bin/env bash
# ============================================================================
# deploy-netlify.sh — publica o frontend na Netlify a partir da sua máquina
#
# POR QUE ESTE SCRIPT
#
# O workflow .github/workflows/deploy-netlify.yml faz o mesmo deploy, mas
# depende de duas coisas que hoje não funcionam no repositório:
#
#   1. do secret `secrets.TOKEN_NETFLY` (personal access token do Netlify);
#   2. de permissão de escrita em .github/workflows/ para ajustar o
#      workflow (o token do GitHub App conectado não tem o escopo
#      `workflow` — toda escrita em .github/workflows/ é recusada).
#
# Rodando localmente, o mesmo deploy é feito em ~1 minuto, sem depender do
# CI, e dá para conferir o resultado na hora.
#
# USO
#
#   export NETLIFY_AUTH_TOKEN=<seu personal access token do Netlify>
#   bash scripts/deploy-netlify.sh
#
# O token sai de: Netlify → Account settings → Personal access tokens →
# New personal access token (precisa do escopo "deploy" ou "site owner").
#
# O script:
#   1. valida o token (chama a API da Netlify);
#   2. confere que o site alvo existe e é o certo;
#   3. roda o build do frontend;
#   4. publica com --site <id> --prod (nunca --allow-anonymous: isso cria
#      um site novo e aleatório e o app real continua no ar antigo);
#   5. confere que o site publicado serve o bundle recém-gerado.
# ============================================================================

set -uo pipefail

SITE_ID="${NETLIFY_SITE_ID:-7ba263f5-b5db-4874-8c0e-bc487a31c6d1}"
SITE_NAME="${NETLIFY_SITE_NAME:-ecuidar}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"

fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }
step() { echo -e "${YELLOW}▶ $*${NC}"; }

cd "$REPO_ROOT"

# ── 1. token ─────────────────────────────────────────────────────────────
if [[ -z "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  fail "NETLIFY_AUTH_TOKEN não definido.
   Gere um token em Netlify → Account settings → Personal access tokens e
   exporte antes de rodar este script."
fi
command -v netlify >/dev/null 2>&1 || fail "netlify-cli não instalado (npm install -g netlify-cli)"

step "Validando o token e o site $SITE_NAME ($SITE_ID)"
site_json=$(curl -s -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  "https://api.netlify.com/api/v1/sites/$SITE_ID" || true)

if echo "$site_json" | grep -q '"id"'; then
  site_url=$(echo "$site_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ssl_url') or json.load(sys.stdin).get('url') or '')" 2>/dev/null || echo "")
  echo -e "  ${GREEN}✓${NC} site encontrado: ${site_url:-https://$SITE_NAME.netlify.app}"
else
  echo -e "  ${RED}✗${NC} a API da Netlify não autorizou este token para o site $SITE_ID."
  echo "    Resposta: $(echo "$site_json" | head -c 200)"
  exit 1
fi

# ── 2. build ─────────────────────────────────────────────────────────────
step "Build do frontend"
( cd frontend && npm ci --no-audit --no-fund && npm run build ) || fail "build falhou"

BUNDLE=$(ls frontend/dist/assets/index-*.js 2>/dev/null | head -1 | xargs -r basename)
[ -n "$BUNDLE" ] || fail "bundle não encontrado em frontend/dist/assets/"
echo -e "  ${GREEN}✓${NC} bundle: $BUNDLE"

# ── 3. deploy ────────────────────────────────────────────────────────────
step "Publicando na Netlify (--site $SITE_ID --prod)"
deploy_out=$(cd frontend && netlify deploy --prod --site "$SITE_ID" --dir dist \
  --message "Deploy manual $(git rev-parse --short HEAD 2>/dev/null || echo local)" 2>&1)
rc=$?

echo "$deploy_out" | sed 's/^/  /' | tail -n 15
[ $rc -eq 0 ] || fail "o netlify-cli retornou código $rc (veja a saída acima)"

# ── 4. verificação ───────────────────────────────────────────────────────
step "Conferindo o site publicado"
sleep 5
published=$(curl -s "https://$SITE_NAME.netlify.app/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ "$published" = "$BUNDLE" ]; then
  echo -e "  ${GREEN}✓${NC} no ar: https://$SITE_NAME.netlify.app ($published)"
  exit 0
fi

echo -e "  ${YELLOW}⚠${NC} o site ainda serve '$published' (esperado '$BUNDLE')."
echo "    A propagação no CDN da Netlify costuma levar 1-3 minutos."
echo "    Confira em: https://$SITE_NAME.netlify.app"
exit 1
