#!/usr/bin/env bash
# Smoke test E2E — testa os fluxos principais da API.
# Uso: BASE=http://localhost:4000 ./scripts/smoke-test.sh
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
TS=$(date +%s)
PASS=0
FAIL=0

# Cores
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

assert_eq() {
  local expected=$1; shift
  local actual=$1;   shift
  local label=$1;    shift
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($actual)"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label (esperado: $expected, recebido: $actual)"
    FAIL=$((FAIL+1))
  fi
}

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

http_body() {
  curl -s "$@"
}

echo -e "${YELLOW}=== Smoke test E2E — Essência do Cuidar ===${NC}"
echo "BASE = $BASE"
echo ""

# --- 1. Healthcheck
echo "[1] Healthcheck"
HC=$(http_body "$BASE/api/health")
echo "  payload: $HC"
echo "$HC" | grep -q "\"ok\":true" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 2. Listar vagas
echo "[2] Listar vagas públicas"
VAGAS=$(http_body "$BASE/api/vagas")
TOTAL=$(echo "$VAGAS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)["vagas"]))" 2>/dev/null || echo "0")
echo "  total: $TOTAL"
[ "$TOTAL" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 3. Validação rejeita complexidade alta
echo "[3] Validação rejeita complexidade alta"
RESP=$(http_body -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"contratante\",\"nome\":\"Smoke $TS\",\"email\":\"smoke$TS@t.com\",\"senha\":\"smoke123\"}")
CONT_TOKEN=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["token"])" 2>/dev/null || echo "")
[ -n "$CONT_TOKEN" ] && PASS=$((PASS+1)) || { echo "  cadastro falhou: $RESP"; FAIL=$((FAIL+1)); }

# Criar vaga alta (deve falhar)
CODE=$(http_code -X POST "$BASE/api/vagas" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"complexidade\":\"alta\",\"servico_descricao\":\"vaga inválida\",\"profissional_desejado\":\"Médico\"}")
assert_eq 400 "$CODE" "POST /vagas com complexidade=alta retorna 400"

# --- 4. Criar vaga válida
echo "[4] Criar vaga válida"
RESP=$(http_body -X POST "$BASE/api/vagas" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"complexidade\":\"baixa\",\"servico_descricao\":\"Smoke test vaga de baixa complexidade.\",\"profissional_desejado\":\"Cuidador de Idosos\",\"jornada_horario\":\"08h às 18h\",\"regiao\":\"Smoke Test\"}")
VAGA_ID=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["vaga"]["id"])" 2>/dev/null || echo "")
echo "  vaga_id: $VAGA_ID"
[ -n "$VAGA_ID" ] && [ "$VAGA_ID" -gt 0 ] && PASS=$((PASS+1)) || { echo "  criar vaga falhou: $RESP"; FAIL=$((FAIL+1)); }

# --- 5. Cadastrar profissional
echo "[5] Cadastrar profissional"
RESP=$(http_body -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"profissional\",\"nome\":\"Smoke Prof $TS\",\"email\":\"profsmoke$TS@t.com\",\"senha\":\"smoke123\"}")
PROF_TOKEN=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["token"])" 2>/dev/null || echo "")
[ -n "$PROF_TOKEN" ] && PASS=$((PASS+1)) || { echo "  cadastro profissional falhou: $RESP"; FAIL=$((FAIL+1)); }

# Atualizar perfil
http_body -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_registro\":\"COREN\",\"registro_conselho\":\"COREN-SP 12345\",\"especialidades\":[\"Idosos\"],\"disponibilidade\":[\"mana\"]}" \
  > /dev/null

# --- 5b. Verificar registro (formato válido) → estado 1
echo "[5b] Verificar registro com formato COREN válido"
RESP=$(http_body -X POST "$BASE/api/profissionais/me/verificar-registro" \
  -H "Authorization: Bearer $PROF_TOKEN")
ESTADO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["estado"])" 2>/dev/null || echo "")
VERIFICADO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["verificado"])" 2>/dev/null || echo "")
echo "  estado: $ESTADO verificado: $VERIFICADO"
assert_eq 1 "$ESTADO" "Registro COREN válido → estado 1"
assert_eq "True" "$VERIFICADO" "verificado=true para COREN válido"

# --- 5c. Atualizar registro para formato INVÁLIDO e re-verificar → estado 2
echo "[5c] Verificar registro com formato inválido → estado 2"
http_body -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_registro\":\"CRM\",\"registro_conselho\":\"isso-nao-parseia\"}" > /dev/null

RESP=$(http_body -X POST "$BASE/api/profissionais/me/verificar-registro" \
  -H "Authorization: Bearer $PROF_TOKEN")
ESTADO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["estado"])" 2>/dev/null || echo "")
echo "  estado: $ESTADO"
assert_eq 2 "$ESTADO" "Registro CRM inválido → estado 2 (em análise)"

# --- 5d. Restaurar formato válido para o smoke continuar (candidatura etc.)
http_body -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_registro\":\"COREN\",\"registro_conselho\":\"COREN-SP 12345\"}" > /dev/null

# --- 5e. Verificar sem registro preenchido (deve 400)
echo "[5e] Verificar sem registro preenchido retorna 400"
RESP2=$(http_body -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"profissional\",\"nome\":\"Smoke Sem Reg $TS\",\"email\":\"smokesemreg$TS@t.com\",\"senha\":\"smoke123\"}")
SEM_TOKEN=$(echo "$RESP2" | python3 -c "import json,sys;print(json.load(sys.stdin)["token"])" 2>/dev/null || echo "")
CODE=$(http_code -X POST "$BASE/api/profissionais/me/verificar-registro" \
  -H "Authorization: Bearer $SEM_TOKEN")
assert_eq 400 "$CODE" "verificar-registro sem dados retorna 400"

# --- 6. Profissional se candidata
echo "[6] Candidatura"
RESP=$(http_body -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_ID,\"mensagem\":\"Smoke test candidatura\"}")
CAND_ID=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["candidatura"]["id"])" 2>/dev/null || echo "")
[ -n "$CAND_ID" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 7. Duplicata rejeitada
echo "[7] Duplicata de candidatura rejeitada"
CODE=$(http_code -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_ID,\"mensagem\":\"duplicada\"}")
assert_eq 409 "$CODE" "Candidatura duplicada retorna 409"

# --- 8. Contratante vê candidatos
echo "[8] Contratante vê candidatos"
CANDIDATOS=$(http_body -X GET "$BASE/api/candidaturas/vaga/$VAGA_ID" \
  -H "Authorization: Bearer $CONT_TOKEN")
TOTAL_CAND=$(echo "$CANDIDATOS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)["candidatos"]))" 2>/dev/null || echo "0")
echo "  total candidatos: $TOTAL_CAND"
[ "$TOTAL_CAND" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 9. Aceitar candidatura
echo "[9] Aceitar candidatura"
CODE=$(http_code -X PATCH "$BASE/api/candidaturas/$CAND_ID" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status_candidatura\":\"aceita\"}")
assert_eq 200 "$CODE" "Aceitar candidatura retorna 200"

# --- 9b. Avaliação: tentar antes de fechar (deve falhar)
echo "[9b] Avaliação bloqueada com vaga ativa"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_candidatura\":$CAND_ID,\"nota\":5,\"comentario\":\"ainda nao\"}")
assert_eq 400 "$CODE" "Avaliação com vaga ativa retorna 400"

# --- 9c. Fechar vaga
echo "[9c] Fechar vaga para permitir avaliação"
CODE=$(http_code -X PATCH "$BASE/api/vagas/$VAGA_ID/status" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"fechada\"}")
assert_eq 200 "$CODE" "Fechar vaga retorna 200"

# --- 9d. Contratante avalia o profissional
echo "[9d] Contratante avalia profissional"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_candidatura\":$CAND_ID,\"nota\":5,\"comentario\":\"Excelente!\"}")
assert_eq 201 "$CODE" "Avaliação criada retorna 201"

# --- 9e. Duplicata bloqueada
echo "[9e] Avaliação duplicada bloqueada"
CODE=$(http_code -X POST "$BASE/api/avaliacoes" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_candidatura\":$CAND_ID,\"nota\":3}")
assert_eq 409 "$CODE" "Avaliação duplicada retorna 409"

# --- 9f. Pendentes (profissional deve ter 1 pendente agora)
echo "[9f] Lista de avaliações pendentes do profissional"
RESP=$(http_body "$BASE/api/avaliacoes/pendentes" -H "Authorization: Bearer $PROF_TOKEN")
N_PEND=$(echo "$RESP" | python3 -c "import json,sys;print(len(json.load(sys.stdin)["pendentes"]))" 2>/dev/null || echo "0")
echo "  pendentes: $N_PEND"
[ "$N_PEND" -ge 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 9g. Stats públicas do profissional (deve ter 1 avaliação, média 5)
echo "[9g] Stats públicas do profissional"
PROF_ID=$(echo "$PROF_TOKEN" | cut -d"." -f2 | base64 -d 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)["id"])" 2>/dev/null || echo "")
if [ -n "$PROF_ID" ]; then
  RESP=$(http_body "$BASE/api/avaliacoes/profissional/$PROF_ID")
  MEDIA=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["stats"]["media"])" 2>/dev/null || echo "0")
  echo "  média: $MEDIA"
  [ "$MEDIA" = "5" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
fi

# --- 10. Chat
echo "[10] Chat entre contratante e profissional"
MSG=$(http_body -X POST "$BASE/api/mensagens" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_destinatario\":2,\"conteudo\":\"Oi, smoke test!\"}")
MSG_ID=$(echo "$MSG" | python3 -c "import json,sys;print(json.load(sys.stdin)["mensagem"]["id"])" 2>/dev/null || echo "")
[ -n "$MSG_ID" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 11. Perfil público
echo "[11] Perfil público do profissional"
RESP=$(http_body "$BASE/api/profissionais/2")
NOME=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)["user"]["nome"])" 2>/dev/null || echo "")
[ -n "$NOME" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
echo "  nome: $NOME"

# --- 11b. Perfil público deve trazer registro_verificado no detalhe
echo "[11b] Perfil público inclui estado de verificação"
RV=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin).get("detalhes") or {};print(d.get("registro_verificado"))" 2>/dev/null || echo "None")
echo "  registro_verificado: $RV"
[ -n "$RV" ] && [ "$RV" != "None" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 12. Auth sem token falha
echo "[12] Auth obrigatória"
CODE=$(http_code -X POST "$BASE/api/vagas" \
  -H "Content-Type: application/json" \
  -d "{}")
assert_eq 401 "$CODE" "POST /vagas sem auth retorna 401"

# --- 13. Validação de senha curta
echo "[13] Validação de senha curta"
CODE=$(http_code -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"contratante\",\"nome\":\"X\",\"email\":\"x@x.com\",\"senha\":\"123\"}")
assert_eq 400 "$CODE" "Senha curta retorna 400"

# --- 14. Webhook logado
echo "[14] Webhook logado"
sleep 3
WEBHOOK_COUNT=$(cd /workspace/Essencia_do_Cuidar/backend 2>/dev/null && node -e "import("./src/db/index.js").then(m=>{const db=m.default;const total=db.prepare("SELECT COUNT(*) AS n FROM webhook_logs").get();process.stderr.write("");console.log(total.n);}).catch(e=>console.log(0))" 2>/dev/null | tail -1)
echo "  total webhooks no DB: $WEBHOOK_COUNT"
[ -n "$WEBHOOK_COUNT" ] && [ "$WEBHOOK_COUNT" -gt 0 ] 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 15. Webhook de verificação de registro logado
echo "[15] Webhook de verificação de registro logado"
sleep 2
RV_COUNT=$(cd /workspace/Essencia_do_Cuidar/backend 2>/dev/null && node -e "import("./src/db/index.js").then(m=>{const db=m.default;const total=db.prepare("SELECT COUNT(*) AS n FROM webhook_logs WHERE tipo = ?").get("registro_verificacao");process.stderr.write("");console.log(total.n);}).catch(e=>console.log(0))" 2>/dev/null | tail -1)
echo "  total verificações no webhook_logs: $RV_COUNT"
[ -n "$RV_COUNT" ] && [ "$RV_COUNT" -ge 1 ] 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1
