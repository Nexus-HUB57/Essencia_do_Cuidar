#!/usr/bin/env bash
# Smoke test das avaliações (feature do branch f18051a, portada para o driver unificado).
# Uso: BASE=http://localhost:4000 ./scripts/smoke-test-avaliacoes.sh
set -uo pipefail

BASE="${BASE:-http://localhost:4000}"
PASS=0
FAIL=0
GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"

assert_eq() {
  local expected=$1 actual=$2 label=$3
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($actual)"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label (esperado: $expected, recebido: $actual)"; FAIL=$((FAIL+1))
  fi
}
http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
http_body() { curl -s "$@"; }

echo -e "${YELLOW}=== Smoke test — Avaliações ===${NC}"
echo "BASE = $BASE"; echo ""

# Logins
CONT_TOKEN=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"maria@demo.com","senha":"demo1234"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
PROF_TOKEN=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"joao@demo.com","senha":"demo1234"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
PROF_ID=$(http_body "$BASE/api/auth/me" -H "Authorization: Bearer $PROF_TOKEN" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])")
[ -n "$CONT_TOKEN" ] && [ -n "$PROF_TOKEN" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "login falhou"; }

# 1. Perfil público do profissional traz stats de avaliação
echo "[1] GET /avaliacoes/profissional/:id — stats + comentários"
RESP=$(http_body "$BASE/api/avaliacoes/profissional/$PROF_ID")
MEDIA=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['stats']['media'])" 2>/dev/null || echo "")
TOTAL=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['stats']['total'])" 2>/dev/null || echo 0)
echo "  média: $MEDIA | total: $TOTAL"
[ -n "$MEDIA" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 2. Vaga do contratante para testar criação
echo "[2] Criar vaga para avaliação"
VAGA_ID=$(http_body -X POST "$BASE/api/vagas" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d '{"complexidade":"baixa","servico_descricao":"Vaga para teste de avaliação E2E aqui","profissional_desejado":"Fisioterapeuta","remuneracao_tipo":"hora","remuneracao_valor":90}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['vaga']['id'])" 2>/dev/null)
[ -n "$VAGA_ID" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "criar vaga falhou"; }

# 3. Profissional candidatou-se
echo "[3] Candidatura do profissional"
http_body -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $PROF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_ID,\"mensagem\":\"Teste\"}" > /dev/null
PASS=$((PASS+1))

# 4. Avaliar SEM aceite → 403
echo "[4] Avaliar sem aceite → 403"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_profissional\":$PROF_ID,\"id_vaga\":$VAGA_ID,\"nota\":5}")
assert_eq 403 "$CODE" "avaliar sem aceite retorna 403"

# 5. Aceitar candidatura
echo "[5] Aceitar candidatura"
CAND_ID=$(http_body "$BASE/api/candidaturas/vaga/$VAGA_ID" -H "Authorization: Bearer $CONT_TOKEN" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['candidatos'][0]['id'])" 2>/dev/null)
http_body -X PATCH "$BASE/api/candidaturas/$CAND_ID" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d '{"status_candidatura":"aceita"}' > /dev/null
PASS=$((PASS+1))

# 6. Nota inválida → 400
echo "[6] Nota fora do range (1-5) → 400"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_profissional\":$PROF_ID,\"id_vaga\":$VAGA_ID,\"nota\":9}")
assert_eq 400 "$CODE" "nota=9 retorna 400"

# 7. Criar avaliação válida → 201
echo "[7] Criar avaliação válida → 201"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_profissional\":$PROF_ID,\"id_vaga\":$VAGA_ID,\"nota\":5,\"comentario\":\"Excelente!\"}")
assert_eq 201 "$CODE" "criar avaliação retorna 201"

# 8. Duplicata → atualiza (200 com updated:true)
echo "[8] Reavaliar mesma vaga → atualiza (200 + updated:true)"
RESP=$(http_body -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_profissional\":$PROF_ID,\"id_vaga\":$VAGA_ID,\"nota\":4,\"comentario\":\"Reavaliei\"}")
echo "$RESP" | grep -q '"updated":true' && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  não atualizou"; }

# 9. Contratante vê suas avaliações
echo "[9] GET /avaliacoes/minhas"
RESP=$(http_body "$BASE/api/avaliacoes/minhas" -H "Authorization: Bearer $CONT_TOKEN")
N=$(echo "$RESP" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['avaliacoes']))" 2>/dev/null || echo 0)
echo "  avaliações do contratante: $N"
[ "$N" -ge 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 10. Profissional não pode avaliar (tipo errado) → 403
echo "[10] Profissional tentando avaliar → 403"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $PROF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_profissional\":$PROF_ID,\"id_vaga\":$VAGA_ID,\"nota\":5}")
assert_eq 403 "$CODE" "profissional avaliando retorna 403"

# 11. Sem auth → 401
echo "[11] Sem token → 401"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" -H "Content-Type: application/json" \
  -d '{"id_profissional":1,"id_vaga":1,"nota":5}')
assert_eq 401 "$CODE" "sem token retorna 401"

echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1