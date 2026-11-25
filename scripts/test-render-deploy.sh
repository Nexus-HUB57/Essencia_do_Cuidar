#!/usr/bin/env bash
# ============================================================================
# test-render-deploy.sh — testa o script de deploy do Render contra um mock
#
# POR QUE EXISTE
#
# `scripts/render-deploy.sh` mexe na infraestrutura de produção. Um erro
# silencioso nesse script (patch com JSON inválido, status code concatenado,
# env-vars apagadas) só aparece quando o deploy real já estragou o serviço.
#
# Aqui o script roda contra um servidor falso que imita a API do Render
# (`tests/mock-render.py`), cobrindo os caminhos que importam:
#
#   1. serviço com repo/branch/rootDir/start errados → o script corrige;
#   2. backend saudável           → o script termina com sucesso;
#   3. backend devolvendo 404     → o script falha COM o diagnóstico certo;
#   4. sem RENDER_API_KEY         → o script falha com instrução clara;
#   5. env-vars preservadas       → o script não apaga o que já existe.
#
# USO: bash scripts/test-render-deploy.sh
# ============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"
PASS=0; FAIL=0

ok()   { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS+1)); }
bad()  { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL+1)); }
step() { echo -e "${YELLOW}▶ $*${NC}"; }

MOCK_PORT=8799
HEALTH_PORT=8798
BROKEN_PORT=8797
MOCK_PID=""

cleanup() {
  [[ -n "$MOCK_PID" ]] && kill "$MOCK_PID" 2>/dev/null
  pkill -f "[m]ock-render.py" 2>/dev/null
  pkill -f "[f]ake404" 2>/dev/null
}
trap cleanup EXIT

# ── sobe o mock ────────────────────────────────────────────────────────────
step "Subindo o mock da API do Render"
python3 tests/mock-render.py --port "$MOCK_PORT" --health-port "$HEALTH_PORT" > /tmp/mock-render-test.log 2>&1 &
MOCK_PID=$!
for i in $(seq 1 20); do
  curl -s -m 2 "http://127.0.0.1:$MOCK_PORT/v1/services" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -s -m 2 "http://127.0.0.1:$MOCK_PORT/v1/services" >/dev/null 2>&1 \
  || { echo "  o mock não subiu (veja /tmp/mock-render-test.log)"; exit 1; }
ok "mock no ar (:$MOCK_PORT) e backend falso (:$HEALTH_PORT)"

# backend que responde 404 como o Express (o caso real de produção)
cat > /tmp/mock404.py <<'PY'
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        b = b"<!DOCTYPE html><html><body><pre>Cannot GET " + self.path.encode() + b"</pre></body></html>"
        self.send_response(404); self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
ThreadingHTTPServer(("127.0.0.1", 8797), H).serve_forever()
PY
python3 /tmp/mock404.py > /dev/null 2>&1 &
MOCK404_PID=$!
sleep 1

RENDER_ENV=(RENDER_API="http://127.0.0.1:$MOCK_PORT/v1" RENDER_API_KEY="rend_mock"
            FRONTEND_URL="https://essenciadocuidar.netlify.app")

# ── 1. sem credencial ──────────────────────────────────────────────────────
step "Sem RENDER_API_KEY o script falha com instrução"
out=$(env -u RENDER_API_KEY bash scripts/render-deploy.sh 2>&1)
if [[ $? -ne 0 ]] && echo "$out" | grep -q "RENDER_API_KEY não definida"; then
  ok "falhou com a instrução certa"
else
  bad "não falhou como esperado: $(echo "$out" | head -n 3)"
fi

# ── 2. serviço quebrado → o script corrige ────────────────────────────────
step "Serviço com repo/branch/rootDir/start errados"
python3 - <<'PY'
import json, urllib.request
req = urllib.request.Request(
    "http://127.0.0.1:8799/v1/services/srv-mock-001",
    data=json.dumps({
        "repo": "https://github.com/outro/repo", "branch": "dev", "rootDir": "",
        "autoDeployTrigger": "off",
        "serviceDetails": {"buildCommand": "npm start", "startCommand": "node index.js"},
    }).encode(),
    headers={"Authorization": "Bearer rend_mock", "Content-Type": "application/json"},
    method="PATCH")
urllib.request.urlopen(req)
PY
out=$(env "${RENDER_ENV[@]}" RENDER_SERVICE_HOST="127.0.0.1:$HEALTH_PORT" \
      RENDER_SERVICE_SCHEME="http" bash scripts/render-deploy.sh 2>&1)
rc=$?
if [[ $rc -eq 0 ]]; then
  ok "deploy concluído com sucesso (exit 0)"
else
  bad "o script falhou (exit $rc): $(echo "$out" | tail -n 5)"
fi

# o serviço foi corrigido?
svc=$(curl -s -H "Authorization: Bearer rend_mock" "http://127.0.0.1:$MOCK_PORT/v1/services/srv-mock-001")
for chave in '"repo": "https://github.com/Nexus-HUB57/Essencia_do_Cuidar"' '"branch": "main"' '"rootDir": "backend"' '"startCommand": "node src/index.js"' '"autoDeployTrigger": "commit"'; do
  if echo "$svc" | grep -q "$chave"; then ok "corrigido: $chave"
  else bad "não corrigiu: $chave"; fi
done

# ── 3. env-vars preservadas ───────────────────────────────────────────────
step "Variáveis de ambiente preservadas e atualizadas"
envjson=$(curl -s -H "Authorization: Bearer rend_mock" "http://127.0.0.1:$MOCK_PORT/v1/services/srv-mock-001/env-vars")
echo "$envjson" | grep -q '"key": "JWT_SECRET"' \
  && ok "JWT_SECRET preservado (segredo não foi apagado)" \
  || bad "JWT_SECRET foi apagado"
echo "$envjson" | grep -q '"key": "FRONTEND_URL"' \
  && ok "FRONTEND_URL presente" \
  || bad "FRONTEND_URL ausente"
echo "$envjson" | grep -q 'essenciadocuidar.netlify.app' \
  && ok "FRONTEND_URL aponta para o domínio real do site" \
  || bad "FRONTEND_URL não aponta para o domínio real"

# ── 4. backend com 404 → falha com o diagnóstico certo ───────────────────
step "Backend devolvendo 404 (serviço sem as rotas montadas)"
out=$(env "${RENDER_ENV[@]}" RENDER_SERVICE_HOST="127.0.0.1:$BROKEN_PORT" \
      RENDER_SERVICE_SCHEME="http" bash scripts/render-deploy.sh 2>&1)
rc=$?
if [[ $rc -ne 0 ]]; then
  ok "falhou com exit != 0 (exit $rc)"
else
  bad "deveria ter falhado"
fi
if echo "$out" | grep -q "NÃO monta as rotas da API"; then
  ok "diagnóstico correto: não monta as rotas"
else
  bad "diagnóstico ausente ou errado: $(echo "$out" | tail -n 4)"
fi

# ── 5. resumo ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[[ $FAIL -eq 0 ]] || exit 1
exit 0
