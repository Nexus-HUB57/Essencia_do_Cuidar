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

step "1. Dependências (npm ci) e seed"
# Derruba qualquer servidor anterior: com a API no ar, o `npm ci` falha ao
# remover o node_modules (o better-sqlite3 fica aberto) e o seed trava no
# banco. O padrão [n] evita que o pkill case o próprio shell.
pkill -f "[n]ode src/index.js" 2>/dev/null
sleep 1
( cd backend && npm ci --no-audit --no-fund > /tmp/val-npm.log 2>&1 ) \
  && ok "npm ci no backend" || bad "npm ci no backend (veja /tmp/val-npm.log)"
# O frontend também precisa das dependências: sem isso o `npx tsc` baixa um
# TypeScript avulso (v7, que rejeita o `baseUrl` do tsconfig) e o build
# falha com "vite: not found" — o script só funcionava numa máquina onde
# o node_modules do frontend já existia.
# Antes do `npm ci`, o servidor de dev do Vite precisa ser derrubado: com
# arquivos abertos em node_modules (o binário nativo do rollup), o npm falha
# com ENOTEMPTY ao remover a pasta. O padrão [v] evita que o pkill case o
# próprio shell.
pkill -f "[v]ite" 2>/dev/null
sleep 1
( cd frontend && npm ci --no-audit --no-fund > /tmp/val-npm-frontend.log 2>&1 ) \
  && ok "npm ci no frontend" || bad "npm ci no frontend (veja /tmp/val-npm-frontend.log)"
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

# Jornada de custódia (matching → pagamento → check-in → check-out → liberação).
# É a única suíte que percorre o caminho do dinheiro inteiro via HTTP.
python3 "scripts/smoke-test-custodia.py" http://localhost:4000 > /tmp/val-smoke-test-custodia.out 2>&1 \
  && ok "smoke-test-custodia.py — jornada completa OK" \
  || { bad "smoke-test-custodia.py (exit $?)"; grep -E "✗|FALHAS" /tmp/val-smoke-test-custodia.out; }

step "3b. Limpeza — banco de volta ao estado de demo"
# As suítes de smoke gravam no mesmo banco de desenvolvimento (usuários
# "Smoke", vagas "Smoke Test"...). Sem este reseed, quem abre a API logo
# depois da validação vê esses registros fantasma — inclusive no ranking do
# matching, com um "Smoke Prof" recommendations na lista do contratante.
( cd backend && npm run seed > /tmp/val-reseed.log 2>&1 ) \
  && ok "banco reencodado (registros de teste removidos)" \
  || bad "reseed falhou (veja /tmp/val-reseed.log)"

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
