#!/usr/bin/env bash
# ============================================================================
# deploy-e2e.sh — publica backend (Render) + frontend (Netlify) e VERIFICA
#
# POR QUE ESTE SCRIPT
#
# Publicar o frontend e publicar o backend são passos separados, com
# credenciais em provedores diferentes. O resultado, no dia 23/11/2026, foi
# um site no ar apontando para um backend que não existia: o frontend
# respondia 200 e TODA chamada de API devolvia 404. Nenhum passo falhou
# visivelmente — o deploy "deu certo" e o app nasceu quebrado.
#
# Este script fecha o ciclo: publica os dois lados, espera o backend ficar
# saudável e só então confere, no site real, que o app funciona de ponta a
# ponta (login + API + painel).
#
# USO
#
#   export RENDER_API_KEY=rend_xxx
#   export NETLIFY_AUTH_TOKEN=nfp_xxx
#   bash scripts/deploy-e2e.sh
#
#   --skip-backend   não mexe no Render (assume o backend já no ar)
#   --skip-frontend  não republica o frontend
#   --dry-run        só diagnostica
# ============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; DIM="\033[2m"; NC="\033[0m"

SKIP_BACKEND=0
SKIP_FRONTEND=0
DRY_RUN=0
# Allowlist de CORS do backend — os dois domínios da conta Netlify servem o app.
FRONTEND_URL="${FRONTEND_URL:-https://ecuidar.netlify.app,https://essenciadocuidar.netlify.app}"
# Domínio usado nas verificações (o canônico é o "ecuidar").
SITE_URL="${SITE_URL:-https://ecuidar.netlify.app}"
BACKEND_URL="${BACKEND_URL:-https://essencia-backend-o2mw.onrender.com}"

step() { echo -e "${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
bad()  { echo -e "  ${RED}✗${NC} $*"; }
die()  { bad "$*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-backend)  SKIP_BACKEND=1 ;;
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --dry-run)       DRY_RUN=1 ;;
    -h|--help)       sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)               die "opção desconhecida: $1" ;;
  esac
  shift
done

cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════════════"
echo "  Deploy end-to-end — Essência do Cuidar"
echo "  frontend: $SITE_URL"
echo "  backend : $BACKEND_URL"
echo "═══════════════════════════════════════════════════════════════"

# ── 0. pré-requisitos ──────────────────────────────────────────────────────
step "Pré-requisitos"
if [[ $SKIP_BACKEND -eq 0 && -z "${RENDER_API_KEY:-}" ]]; then
  die "RENDER_API_KEY não definida — não dá para publicar o backend.
   Crie uma chave em Render → Account Settings → API Keys.
   (use --skip-backend se o backend já estiver no ar)"
fi
if [[ $SKIP_FRONTEND -eq 0 && -z "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  die "NETLIFY_AUTH_TOKEN não definida — não dá para publicar o frontend.
   Use --skip-frontend para não republicar."
fi
ok "credenciais presentes"

# ── 1. backend ─────────────────────────────────────────────────────────────
if [[ $SKIP_BACKEND -eq 0 ]]; then
  step "1/3 Publicando o backend no Render"
  args=()
  [[ $DRY_RUN -eq 1 ]] && args+=(--dry-run)
  # Sem JWT_SECRET o backend aborta o startup em produção (app.js); se a
  # variável ainda não existir no serviço, geramos uma forte na hora.
  args+=(--generate-jwt)
  saida_backend=$(bash scripts/render-deploy.sh "${args[@]+"${args[@]}"}") \
    || { echo "$saida_backend"; die "o deploy do backend falhou (veja o diagnóstico acima)"; }
  echo "$saida_backend"
  ok "backend publicado"
  # O render-deploy.sh imprime RENDER_SERVICE_HOST=<host> — o host REAL do
  # serviço (o slug pode ter sufixo; essencia-backend.onrender.com era de um
  # serviço órfão em outra conta). Se mudou, reescreve o proxy do
  # netlify.toml neste workspace ANTES do deploy do frontend.
  host_novo=$(echo "$saida_backend" | grep -oP 'RENDER_SERVICE_HOST=\K[a-z0-9.-]+\.onrender\.com' | head -1)
  if [[ -n "$host_novo" && "https://$host_novo" != "$BACKEND_URL" ]]; then
    BACKEND_URL="https://$host_novo"
    warn "host real do backend: $BACKEND_URL — atualizando o proxy do netlify.toml neste deploy"
    sed -i "s|essencia-backend\.onrender\.com|$host_novo|g" netlify.toml
    grep -n "$host_novo" netlify.toml | head -3
  fi
else
  step "1/3 Pulando o backend (--skip-backend)"
fi

# ── 2. o backend está saudável? ────────────────────────────────────────────
step "2/3 Conferindo a saúde do backend"
saude=0
for i in $(seq 1 24); do
  code=$(curl -s -o /tmp/e2e_health.txt -w "%{http_code}" -m 25 "${BACKEND_URL}/api/health" 2>/dev/null || echo 000)
  corpo=$(head -c 300 /tmp/e2e_health.txt 2>/dev/null || echo "")
  if [[ "$code" == "200" ]] && echo "$corpo" | grep -q '{'; then
    saude=1
    ok "backend saudável: $(echo "$corpo" | head -c 140)"
    break
  fi
  [[ $(( i % 4 )) -eq 0 ]] && echo -e "  ${DIM}aguardando o backend… (HTTP $code)${NC}"
  sleep 15
done
[[ $saude -eq 1 ]] || die "o backend não está saudável em ${BACKEND_URL}/api/health (último HTTP: $code).
   $(head -c 200 /tmp/e2e_health.txt 2>/dev/null)
   Não publique o frontend antes do backend estar de pé: o app no ar sem API
   é pior do que app fora do ar."

# ── 3. frontend ────────────────────────────────────────────────────────────
if [[ $SKIP_FRONTEND -eq 0 ]]; then
  step "3/3 Publicando o frontend na Netlify"
  # O deploy-netlify.sh resolve o site alvo pela API da Netlify (o siteId
  # guardado no state.json já estava obsoleto) e confere o bundle publicado.
  #
  # Se a publicação CLI falhar por permissão (PAT do secret TOKEN_NETFLY
  # respondendo "Forbidden"), o E2E NÃO morre: o site de produção continua
  # sendo publicado pela integração Git da própria Netlify (rebuild a cada
  # push em main), e as verificações do passo 4 abaixo continuam valendo —
  # elas apontam para o site REAL. Um token válido é pré-requisito apenas
  # para republicar manualmente pela CLI.
  if ! bash scripts/deploy-netlify.sh; then
    echo "::warning::publicação CLI na Netlify falhou (secret TOKEN_NETFLY Forbidden?) — a produção publica via integração Git da Netlify; seguindo com as verificações do site real"
    warn "deploy CLI da Netlify falhou — usando a versão publicada pela integração Git (as verificações abaixo são no site REAL)"
  else
    ok "frontend publicado"
  fi
else
  step "3/3 Pulando o frontend (--skip-frontend)"
fi

# ── 4. verificação real, no site publicado ─────────────────────────────────
step "Verificação ponta a ponta (site publicado)"

# 4a. o site serve o app
site_code=$(curl -s -o /tmp/e2e_site.html -w "%{http_code}" -m 25 "$SITE_URL/" 2>/dev/null || echo 000)
[[ "$site_code" == "200" ]] || die "o site $SITE_URL respondeu HTTP $site_code"
ok "site no ar (HTTP 200)"

# 4b. o proxy /api do site aponta para a nossa API
# Com autoDeploy=commit, o MESMO push que disparou este run também dispara
# um deploy na Render — durante a troca de instância o proxy responde 502
# por ~1 min (run #15). A verificação final precisa tolerar essa janela.
api_code=000
for tentativa in 1 2 3 4 5 6; do
  api_code=$(curl -s -o /tmp/e2e_api.txt -w "%{http_code}" -m 30 "${SITE_URL}/api/health" 2>/dev/null || echo 000)
  api_corpo=$(head -c 300 /tmp/e2e_api.txt 2>/dev/null || echo "")
  if [[ "$api_code" == "200" ]] && echo "$api_corpo" | grep -q '{'; then
    break
  fi
  echo -e "  ${DIM}proxy /api/health → HTTP $api_code (tentativa $tentativa/6, aguardando a troca de deploy terminar…)${NC}"
  sleep 15
done
if [[ "$api_code" == "200" ]] && echo "$api_corpo" | grep -q '{'; then
  ok "proxy /api do site responde a nossa API"
else
  bad "proxy /api do site respondeu HTTP $api_code"
  if echo "$api_corpo" | grep -q "Cannot GET"; then
    echo "    O host do proxy está servindo outro serviço. Confira o bloco"
    echo "    [[redirects]] do netlify.toml e a URL do backend."
  fi
  exit 1
fi

# 4c. login de verdade contra a API de produção
login_code=000
for tentativa in 1 2 3 4; do
  login_code=$(curl -s -o /tmp/e2e_login.txt -w "%{http_code}" -m 30 \
    -X POST "${SITE_URL}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"maria@demo.com","senha":"demo1234"}' 2>/dev/null || echo 000)
  if [[ "$login_code" == "200" ]] && grep -q '"token"' /tmp/e2e_login.txt 2>/dev/null; then break; fi
  echo -e "  ${DIM}login → HTTP $login_code (tentativa $tentativa/4…)${NC}"
  sleep 15
done
if [[ "$login_code" == "200" ]] && grep -q '"token"' /tmp/e2e_login.txt 2>/dev/null; then
  token=$(python3 -c "import json;print(json.load(open('/tmp/e2e_login.txt')).get('token',''))" 2>/dev/null)
  ok "login de demonstração funciona (HTTP 200)"
  # 4d. rota autenticada — prova que o token e o banco funcionam
  if [[ -n "$token" ]]; then
    p_code=000
    for tentativa in 1 2 3 4; do
      p_code=$(curl -s -o /tmp/e2e_prof.txt -w "%{http_code}" -m 30 \
        -H "Authorization: Bearer $token" "${SITE_URL}/api/protocolos" 2>/dev/null || echo 000)
      [[ "$p_code" == "200" ]] && break
      echo -e "  ${DIM}GET /api/protocolos → HTTP $p_code (tentativa $tentativa/4…)${NC}"
      sleep 12
    done
    if [[ "$p_code" == "200" ]]; then
      n=$(python3 -c "
import json
d=json.load(open('/tmp/e2e_prof.txt'))
ps = d if isinstance(d,list) else d.get('protocolos',[])
print(len(ps))" 2>/dev/null || echo "?")
      ok "painel de protocolos responde (HTTP 200, $n protocolos visíveis)"
      if [[ "$n" == "0" ]]; then
        warn "a API responde mas a conta demo não tem protocolos — rode o seed no ambiente de produção:"
        echo "    Render → Shell → cd backend && npm run seed"
      fi
    else
      bad "GET /api/protocolos autenticado respondeu HTTP $p_code"
      exit 1
    fi
  fi
else
  bad "login falhou (HTTP $login_code): $(head -c 160 /tmp/e2e_login.txt 2>/dev/null)"
  echo "    Se for 404: o proxy aponta para outro serviço."
  echo "    Se for 403: FRONTEND_URL no Render não inclui $SITE_URL (CORS)."
  exit 1
fi

echo
echo "═══════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✓ Deploy end-to-end concluído e verificado${NC}"
echo "    frontend: $FRONTEND_URL"
echo "    backend : $BACKEND_URL"
echo "═══════════════════════════════════════════════════════════════"
exit 0
