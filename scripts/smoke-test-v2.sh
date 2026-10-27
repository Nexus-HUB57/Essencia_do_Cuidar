#!/usr/bin/env bash
# Smoke test V2 — cobre as 6 features (PG-ready, registros, pagamento, push, admin, i18n).
# Uso: BASE=http://localhost:4000 ./scripts/smoke-test-v2.sh
set -uo pipefail

BASE="${BASE:-http://localhost:4000}"
TS=$(date +%s)
PASS=0
FAIL=0
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

assert_eq() {
  local expected=$1 actual=$2 label=$3
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($actual)"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label (esperado: $expected, recebido: $actual)"
    FAIL=$((FAIL+1))
  fi
}

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
http_body() { curl -s "$@"; }

echo -e "${YELLOW}=== Smoke test V2 — 6 features ===${NC}"
echo "BASE = $BASE"
echo ""

# 0. Healthcheck
echo "[0] Healthcheck"
HC=$(http_body "$BASE/api/health")
echo "  $HC"
# O main passou a retornar db como objeto {driver, reachable, error}
echo "$HC" | grep -q '"driver":"sqlite"' && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  DB driver errado"; }

# 1. Feature 1 — DB driver exposed
echo ""
echo "[1] DB driver exposto no /health"
echo "$HC" | grep -q '"db"' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 2. Feature 6 — i18n
echo ""
echo "[2] i18n — locales disponíveis"
LOCALES=$(http_body "$BASE/api/i18n")
echo "  $LOCALES"
echo "$LOCALES" | grep -q 'pt-BR' && echo "$LOCALES" | grep -q 'es' && echo "$LOCALES" | grep -q 'en' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 3. i18n strings
echo "[3] i18n — dicionário pt-BR"
PT=$(http_body "$BASE/api/i18n/pt-BR")
echo "$PT" | grep -q 'appName' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
ES=$(http_body "$BASE/api/i18n/es")
echo "$ES" | grep -q 'Soy Profesional' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
EN=$(http_body "$BASE/api/i18n/en")
echo "$EN" | grep -q 'Sign in' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 4. Feature 4 — push config
echo ""
echo "[4] Web push — endpoint /key"
KEY=$(http_body "$BASE/api/push/key")
echo "  $KEY"
echo "$KEY" | grep -q '"enabled"' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 5. Login admin
echo ""
echo "[5] Login admin (Feature 5)"
ADMIN_RESP=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","senha":"admin1234"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('token',''))")
[ -n "$ADMIN_TOKEN" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  Admin login falhou: $ADMIN_RESP"; }

# 6. Admin stats
echo "[6] Admin /stats"
STATS=$(http_body "$BASE/api/admin/stats" -H "Authorization: Bearer $ADMIN_TOKEN")
echo "  $STATS"
echo "$STATS" | grep -q '"users"' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 7. Admin list users
echo "[7] Admin /users (lista)"
USERS=$(http_body "$BASE/api/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN")
TOTAL_USERS=$(echo "$USERS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['users']))" 2>/dev/null || echo 0)
echo "  total: $TOTAL_USERS"
[ "$TOTAL_USERS" -ge 5 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 8. Admin NÃO protegido para não-admin
echo "[8] Admin protegido (não-admin → 403)"
CONT_RESP=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"maria@demo.com","senha":"demo1234"}')
CONT_TOKEN=$(echo "$CONT_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
CODE=$(http_code "$BASE/api/admin/stats" -H "Authorization: Bearer $CONT_TOKEN")
assert_eq 403 "$CODE" "stats com user não-admin retorna 403"

# 9. Login profissional
echo ""
echo "[9] Login profissional"
PROF_RESP=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ana@demo.com","senha":"demo1234"}')
PROF_TOKEN=$(echo "$PROF_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
PROF_ID=$(echo "$PROF_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])")
[ -n "$PROF_TOKEN" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
echo "  ana id=$PROF_ID"

# 10. Feature 3 — Stripe Connect status
echo "[10] Stripe Connect status (profissional)"
SC=$(http_body "$BASE/api/pagamentos/connect/status" -H "Authorization: Bearer $PROF_TOKEN")
echo "  $SC"
echo "$SC" | grep -q '"mock":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 11. Stripe Connect onboarding
echo "[11] Stripe Connect onboarding link"
OB=$(http_body -X POST "$BASE/api/pagamentos/connect/onboarding" -H "Authorization: Bearer $PROF_TOKEN")
echo "  $OB"
echo "$OB" | grep -q '"url"' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 12. Pagamento config
echo "[12] Pagamento /config"
CFG=$(http_body "$BASE/api/pagamentos/config")
echo "  $CFG"
echo "$CFG" | grep -q '"mock":true' && echo "$CFG" | grep -q '"platform_fee_pct"' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 13. Criar vaga + candidatura + aceitar + pagar
echo ""
echo "[13] Fluxo de pagamento end-to-end"
VAGA_RESP=$(http_body -X POST "$BASE/api/vagas" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"complexidade\":\"baixa\",\"servico_descricao\":\"Smoke V2 pagamento teste completo aqui\",\"profissional_desejado\":\"Cuidador de Idosos\",\"jornada_horario\":\"08h às 18h\",\"remuneracao_tipo\":\"hora\",\"remuneracao_valor\":50}")
VAGA_ID=$(echo "$VAGA_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['vaga']['id'])")
echo "  vaga_id=$VAGA_ID"

# Candidatar
CAND_RESP=$(http_body -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $PROF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_ID,\"mensagem\":\"Posso!\"}")
CAND_ID=$(echo "$CAND_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['candidatura']['id'])")
echo "  cand_id=$CAND_ID"

# Aceitar
http_body -X PATCH "$BASE/api/candidaturas/$CAND_ID" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d '{"status_candidatura":"aceita"}' > /dev/null

# Pagar via Pix
PAG_RESP=$(http_body -X POST "$BASE/api/pagamentos" \
  -H "Authorization: Bearer $CONT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_ID,\"metodo\":\"pix\"}")
echo "  $PAG_RESP" | head -c 200
echo ""
PAG_ID=$(echo "$PAG_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['pagamento']['id'])" 2>/dev/null)
[ -n "$PAG_ID" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# Confirmar pagamento
CONF_RESP=$(http_body -X POST "$BASE/api/pagamentos/$PAG_ID/confirmar" -H "Authorization: Bearer $CONT_TOKEN")
echo "$CONF_RESP" | grep -q '"status":"pago"' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 14. Feature 2 — verificação de registro (formato inválido)
echo ""
echo "[14] Verificação de registro — formato inválido"
CODE=$(http_code -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" -H "Content-Type: application/json" \
  -d '{"tipo_registro":"CRM","registro_conselho":"INVALID","uf":"SP"}')
assert_eq 400 "$CODE" "registro inválido retorna 400"

# 15. Verificação formato válido
echo "[15] Verificação — formato válido"
CODE=$(http_code -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" -H "Content-Type: application/json" \
  -d '{"tipo_registro":"CRM","registro_conselho":"123456-SP","uf":"SP"}')
assert_eq 200 "$CODE" "registro válido retorna 200"

# 16. Histórico de verificações
echo "[16] Histórico de verificações"
HIST=$(http_body "$BASE/api/profissionais/$PROF_ID/verificacoes" -H "Authorization: Bearer $PROF_TOKEN")
echo "  $HIST" | head -c 200
echo ""
echo "$HIST" | grep -q 'verificacoes' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 17. Admin vê verificações pendentes
echo "[17] Admin /verificacoes"
VERIF=$(http_body "$BASE/api/admin/verificacoes?status=aprovado" -H "Authorization: Bearer $ADMIN_TOKEN")
echo "  $VERIF" | head -c 200
echo ""
echo "$VERIF" | grep -q 'verificacoes' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 18. Admin webhooks
echo "[18] Admin /webhooks"
WH=$(http_body "$BASE/api/admin/webhooks" -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$WH" | grep -q 'webhooks' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 19. Admin pagamentos
echo "[19] Admin /pagamentos"
PAG=$(http_body "$BASE/api/admin/pagamentos" -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$PAG" | grep -q 'pagamentos' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 20. Feature 5 — Admin suspende usuário
echo ""
echo "[20] Admin suspende usuário"
SUS_RESP=$(http_body -X PATCH "$BASE/api/admin/users/$PROF_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"suspended":true,"motivo":"teste smoke"}')
echo "  $SUS_RESP"

# Tenta login com user suspenso
CODE=$(http_code -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ana@demo.com","senha":"demo1234"}')
assert_eq 403 "$CODE" "login com user suspenso retorna 403"

# Reativar
http_body -X PATCH "$BASE/api/admin/users/$PROF_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"suspended":false}' > /dev/null
CODE=$(http_code -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ana@demo.com","senha":"demo1234"}')
assert_eq 200 "$CODE" "reativação libera login"

# 21. Admin moderar vaga
echo ""
echo "[21] Admin fecha vaga"
CODE=$(http_code -X PATCH "$BASE/api/admin/vagas/$VAGA_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"fechada"}')
assert_eq 200 "$CODE" "moderação de vaga retorna 200"

# 22. Feature 4 — push subscribe (no-op quando VAPID off)
echo ""
echo "[22] Push subscribe (VAPID off → ok mesmo assim)"
SUB_RESP=$(http_body -X POST "$BASE/api/push/subscribe" \
  -H "Authorization: Bearer $PROF_TOKEN" -H "Content-Type: application/json" \
  -d '{"endpoint":"https://fake.push.service/abc","keys":{"p256dh":"fake","auth":"fake"}}')
echo "  $SUB_RESP"
echo "$SUB_RESP" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# 23. Login com credenciais erradas
echo ""
echo "[23] Login inválido"
CODE=$(http_code -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","senha":"errada"}')
assert_eq 401 "$CODE" "senha errada retorna 401"

# Resumo
echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1
