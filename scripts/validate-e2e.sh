#!/usr/bin/env bash
# Validação end-to-end local — espelha o que o CI (.github/workflows/ci.yml) roda.
# Uso: bash scripts/validate-e2e.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"
FAILED=0

step() { echo -e "\n${YELLOW}=== $* ===${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
bad()  { echo -e "  ${RED}✗${NC} $*"; FAILED=$((FAILED+1)); }

step "1. Backend — dependências (npm ci) e seed"
( cd backend && npm ci --no-audit --no-fund > /tmp/val-npm.log 2>&1 ) \
  && ok "npm ci no backend" || bad "npm ci no backend (veja /tmp/val-npm.log)"
( cd backend && npm run seed > /tmp/val-seed.log 2>&1 ) \
  && ok "npm run seed" || bad "npm run seed (veja /tmp/val-seed.log)"

step "2. Backend — sobe o servidor"
( cd backend && setsid nohup node src/index.js > /tmp/val-backend.log 2>&1 < /dev/null & )
for i in $(seq 1 30); do
  curl -sf -m 2 http://localhost:4000/api/health > /dev/null && break
  sleep 1
done
curl -sf -m 5 http://localhost:4000/api/health > /dev/null \
  && ok "API respondendo em :4000" \
  || { bad "API não subiu (veja /tmp/val-backend.log)"; cat /tmp/val-backend.log; exit 1; }

step "3. Backend — suítes de smoke test"
for s in smoke-test.sh smoke-test-v2.sh smoke-test-matching.sh; do
  BASE=http://localhost:4000 bash "scripts/$s" > "/tmp/val-$s.out" 2>&1
  code=$?
  p=$(grep -oE 'Passou: [0-9]+' "/tmp/val-$s.out" | tail -1 | grep -oE '[0-9]+')
  f=$(grep -oE 'Falhou: [0-9]+' "/tmp/val-$s.out" | tail -1 | grep -oE '[0-9]+')
  [ "$code" -eq 0 ] && ok "$s — $p passed, $f failed" \
                    || { bad "$s — $p passed, $f failed (exit $code)"; grep -E "✗" "/tmp/val-$s.out" | sed 's/\x1b\[[0-9;]*m//g'; }
done

step "4. Frontend — typecheck e build"
( cd frontend && npx tsc --noEmit > /tmp/val-tsc.log 2>&1 ) \
  && ok "tsc --noEmit sem erros" \
  || { bad "tsc --noEmit"; head -20 /tmp/val-tsc.log; }
( cd frontend && npm run build > /tmp/val-build.log 2>&1 ) \
  && ok "vite build" \
  || { bad "vite build"; tail -20 /tmp/val-build.log; }

step "5. Resiliência — entrada inválida não derruba a API"
TOKEN=$(curl -s -m 5 -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@demo.com","senha":"demo1234"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/api/mensagens \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id_destinatario":999999,"conteudo":"inexistente"}')
[ "$CODE" = "404" ] && ok "mensagem para destinatário inexistente → 404" \
                    || bad "mensagem para destinatário inexistente → $CODE (esperado 404)"
curl -sf -m 5 http://localhost:4000/api/health > /dev/null \
  && ok "API de pé depois do erro" || bad "API morreu com entrada inválida"

echo ""
echo "============================================================"
if [ "$FAILED" -eq 0 ]; then
  echo -e "  ${GREEN}Validação end-to-end: TUDO OK${NC}"
else
  echo -e "  ${RED}Validação end-to-end: $FAILED falha(s)${NC}"
fi
echo "============================================================"
exit $FAILED
