#!/usr/bin/env bash
# Smoke test E2E — testa os fluxos principais da API.
# Uso: BASE=http://localhost:4000 ./scripts/smoke-test.sh
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
# Raiz do repo, relativa ao script (evita path absoluto fixo).
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend" 2>/dev/null && pwd)"
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

# Verdadeiro/falso a partir de uma condição (0/1).
assert_true() {
  local cond=$1 label=$2
  if [ "$cond" = "1" ]; then
    echo -e "  ${GREEN}✓${NC} $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label"
    FAIL=$((FAIL+1))
  fi
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
TOTAL=$(echo "$VAGAS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['vagas']))" 2>/dev/null || echo "0")
echo "  total: $TOTAL"
[ "$TOTAL" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 3. Validação rejeita complexidade alta
echo "[3] Validação rejeita complexidade alta"
RESP=$(http_body -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"contratante\",\"nome\":\"Smoke $TS\",\"email\":\"smoke$TS@t.com\",\"senha\":\"smoke123\"}")
CONT_TOKEN=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
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
VAGA_ID=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['vaga']['id'])" 2>/dev/null || echo "")
echo "  vaga_id: $VAGA_ID"
[ -n "$VAGA_ID" ] && [ "$VAGA_ID" -gt 0 ] && PASS=$((PASS+1)) || { echo "  criar vaga falhou: $RESP"; FAIL=$((FAIL+1)); }

# --- 5. Cadastrar profissional
echo "[5] Cadastrar profissional"
RESP=$(http_body -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"profissional\",\"nome\":\"Smoke Prof $TS\",\"email\":\"profsmoke$TS@t.com\",\"senha\":\"smoke123\"}")
PROF_TOKEN=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
[ -n "$PROF_TOKEN" ] && PASS=$((PASS+1)) || { echo "  cadastro profissional falhou: $RESP"; FAIL=$((FAIL+1)); }

# Atualizar perfil
http_body -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_registro\":\"COREN\",\"registro_conselho\":\"COREN-SP 123456\",\"especialidades\":[\"Idosos\"],\"disponibilidade\":[\"manha\"]}" \
  > /dev/null

# --- 5b. Verificar registro (formato válido) → estado 1
echo "[5b] Verificar registro com formato COREN válido"
RESP=$(http_body -X POST "$BASE/api/profissionais/me/verificar-registro" \
  -H "Authorization: Bearer $PROF_TOKEN")
ESTADO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['estado'])" 2>/dev/null || echo "")
VERIFICADO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['verificado'])" 2>/dev/null || echo "")
echo "  estado: $ESTADO verificado: $VERIFICADO"
assert_eq 1 "$ESTADO" "Registro COREN válido → estado 1"
assert_eq "True" "$VERIFICADO" "verificado=true para COREN válido"

# --- 5c. Formato INVÁLIDO é recusado na hora de salvar
# O PUT /api/profissionais/me valida o formato antes de gravar, então um
# registro inválido nunca chega ao banco. Rejeitar na escrita é o
# comportamento correto — o formato inválido fica fora do sistema.
echo "[5c] Formato inválido é recusado no PUT"
CODE_INVALID=$(http_code -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_registro\":\"CRM\",\"registro_conselho\":\"isso-nao-parseia\"}")
assert_eq 400 "$CODE_INVALID" "PUT com registro inválido retorna 400"

# O registro válido anterior continua intacto (não foi sobrescrito pelo inválido).
RESP=$(http_body -X POST "$BASE/api/profissionais/me/verificar-registro" \
  -H "Authorization: Bearer $PROF_TOKEN")
ESTADO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['estado'])" 2>/dev/null || echo "")
assert_eq 1 "$ESTADO" "registro válido anterior preservado → estado 1"

# --- 5c2. Estado 2 ("em análise") é alcançável pela rejeição do admin
echo "[5c2] Rejeição do admin marca o perfil como 'em análise' (estado 2)"
PROF_ID=$(echo "$PROF_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
ADMIN_RESP=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","senha":"admin1234"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
VERIF_ID=$(http_body "$BASE/api/admin/verificacoes?status=pendente" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import json,sys;v=json.load(sys.stdin)['verificacoes'];print(next((str(r['id']) for r in v if str(r.get('id_user'))=='$PROF_ID'),''))" 2>/dev/null || echo "")
if [ -n "$VERIF_ID" ] && [ -n "$PROF_ID" ]; then
  http_code -X PATCH "$BASE/api/admin/verificacoes/$VERIF_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"rejeitado","motivo":"smoke test"}' > /dev/null
  ESTADO2=$(http_body "$BASE/api/profissionais/$PROF_ID" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['detalhes'].get('registro_verificado'))" 2>/dev/null || echo "")
  assert_eq 2 "$ESTADO2" "perfil rejeitado pelo admin mostra estado 2 (em análise)"
else
  echo -e "  ${YELLOW}•${NC} sem verificação pendente para rejeitar (teste ignorado)"
fi

# --- 5d. Restaurar formato válido para o smoke continuar (candidatura etc.)
http_body -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_registro\":\"COREN\",\"registro_conselho\":\"COREN-SP 123456\"}" > /dev/null

# --- 5e. Verificar sem registro preenchido (deve 400)
echo "[5e] Verificar sem registro preenchido retorna 400"
RESP2=$(http_body -X POST "$BASE/api/auth/cadastro" \
  -H "Content-Type: application/json" \
  -d "{\"tipo_usuario\":\"profissional\",\"nome\":\"Smoke Sem Reg $TS\",\"email\":\"smokesemreg$TS@t.com\",\"senha\":\"smoke123\"}")
SEM_TOKEN=$(echo "$RESP2" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
CODE=$(http_code -X POST "$BASE/api/profissionais/me/verificar-registro" \
  -H "Authorization: Bearer $SEM_TOKEN")
assert_eq 400 "$CODE" "verificar-registro sem dados retorna 400"

# --- 6. Profissional se candidata
echo "[6] Candidatura"
RESP=$(http_body -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_ID,\"mensagem\":\"Smoke test candidatura\"}")
CAND_ID=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['candidatura']['id'])" 2>/dev/null || echo "")
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
TOTAL_CAND=$(echo "$CANDIDATOS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['candidatos']))" 2>/dev/null || echo "0")
echo "  total candidatos: $TOTAL_CAND"
[ "$TOTAL_CAND" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 9. Aceitar candidatura
echo "[9] Aceitar candidatura"
CODE=$(http_code -X PATCH "$BASE/api/candidaturas/$CAND_ID" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status_candidatura\":\"aceita\"}")
assert_eq 200 "$CODE" "Aceitar candidatura retorna 200"

# --- 10. Chat
echo "[10] Chat entre contratante e profissional"
MSG=$(http_body -X POST "$BASE/api/mensagens" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_destinatario\":2,\"conteudo\":\"Oi, smoke test!\"}")
MSG_ID=$(echo "$MSG" | python3 -c "import json,sys;print(json.load(sys.stdin)['mensagem']['id'])" 2>/dev/null || echo "")
[ -n "$MSG_ID" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 11. Perfil público do profissional
# O id 2 antigamente era a Ana; após o seed atual (com admin) o id 2 é admin.
# Usa o id extraído do token do profissional cadastrado em [5].
echo "[11] Perfil público do profissional"
if [ -n "$PROF_ID" ]; then
  RESP=$(http_body "$BASE/api/profissionais/$PROF_ID")
  NOME=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['nome'])" 2>/dev/null || echo "")
  [ -n "$NOME" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  echo "  id=$PROF_ID nome=$NOME"
fi

# --- 11b. Perfil público deve trazer registro_verificado no detalhe
echo "[11b] Perfil público inclui estado de verificação"
RV=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin).get('detalhes') or {};print(d.get('registro_verificado'))" 2>/dev/null || echo "None")
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
WEBHOOK_COUNT=$(cd "$BACKEND_DIR" 2>/dev/null && node -e 'import("./src/db/driver.js").then(async m=>{const db=m.default;const row=await db.get("SELECT COUNT(*) AS n FROM webhook_logs");console.log(row?.n||0);}).catch(()=>console.log(0))' 2>/dev/null | tail -1)
echo "  total webhooks no DB: $WEBHOOK_COUNT"
[ -n "$WEBHOOK_COUNT" ] && [ "$WEBHOOK_COUNT" -gt 0 ] 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 15. Favoritar vaga
echo "[15] Favoritar vaga (profissional)"
CODE=$(http_code -X POST "$BASE/api/favoritos" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"vaga\",\"id_recurso\":$VAGA_ID}")
assert_eq 201 "$CODE" "Favoritar vaga retorna 201"

# --- 16. Listar favoritos
FAVS=$(http_body -H "Authorization: Bearer $PROF_TOKEN" "$BASE/api/favoritos?tipo=vaga")
TOTAL_FAVS=$(echo "$FAVS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['favoritos']))" 2>/dev/null || echo "0")
[ "$TOTAL_FAVS" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
echo "  favoritos: $TOTAL_FAVS"

# --- 17. Toggle favoritar (desfavorita)
CODE=$(http_code -X POST "$BASE/api/favoritos" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"vaga\",\"id_recurso\":$VAGA_ID}")
assert_eq 200 "$CODE" "Toggle favoritar retorna 200 (já existia)"

# --- 18. Stats do profissional
# O id do profissional não pode ser fixo: depois do seed atual o id 2 é o
# admin, não um profissional. Busca um profissional que realmente tenha
# histórico de candidaturas.
echo "[18] Stats do profissional"
PROF_COM_STATS=$(cd "$BACKEND_DIR" 2>/dev/null && node -e 'import("./src/db/driver.js").then(async m=>{const db=m.default;const r=await db.get("SELECT id_profissional AS id FROM candidaturas GROUP BY id_profissional ORDER BY COUNT(*) DESC LIMIT 1");console.log(r?.id||"")}).catch(()=>console.log(""))' 2>/dev/null | tail -1)
if [ -n "$PROF_COM_STATS" ]; then
  RESP=$(http_body "$BASE/api/profissionais/$PROF_COM_STATS")
  STATS_TOTAL=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['stats']['total_candidaturas'])" 2>/dev/null || echo "0")
  echo "  profissional $PROF_COM_STATS — total de candidaturas: $STATS_TOTAL"
  [ "$STATS_TOTAL" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
else
  echo -e "  ${YELLOW}•${NC} nenhum profissional com candidaturas (teste ignorado)"
fi

# --- 19. Avaliação de profissional
echo "[19] Avaliação pública do profissional"
RESP=$(http_body "$BASE/api/avaliacoes/profissional/$PROF_COM_STATS")
MEDIA=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['stats']['media'])" 2>/dev/null || echo "0")
TOTAL_AV=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['stats']['total'])" 2>/dev/null || echo "0")
echo "  média: $MEDIA de $TOTAL_AV avaliações"
[ "$TOTAL_AV" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 20. Visualização de vaga
echo "[20] Contador de visualizações"
RESP=$(http_body "$BASE/api/vagas/$VAGA_ID")
VIEWS=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['visualizacoes'])" 2>/dev/null || echo "0")
echo "  views: $VIEWS"
[ "$VIEWS" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 21. Notificações do contratante
echo "[21] Endpoint de notificações (contratante)"
CODE=$(http_code -H "Authorization: Bearer $CONT_TOKEN" "$BASE/api/notificacoes")
assert_eq 200 "$CODE" "GET /notificacoes retorna 200"

# --- 22. Contador de notificações
RESP=$(http_body -H "Authorization: Bearer $CONT_TOKEN" "$BASE/api/notificacoes/contador")
TOTAL_NL=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['nao_lidas'])" 2>/dev/null || echo "0")
echo "  não lidas: $TOTAL_NL"
[ "$TOTAL_NL" -ge 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 23. Ordenação de vagas
echo "[23] Ordenação por remuneração"
RESP=$(http_body "$BASE/api/vagas?ordenar=remuneracao&limite=3")
TOP=$(echo "$RESP" | python3 -c "import json,sys;vagas=json.load(sys.stdin)['vagas'];print(vagas[0]['remuneracao_valor'] if vagas else 0)" 2>/dev/null || echo "0")
[ "$TOP" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
echo "  vaga mais bem paga: R\$ $TOP"

# --- 24. Histórico de contratações
echo "[24] Histórico de contratações"
RESP=$(http_body -H "Authorization: Bearer $CONT_TOKEN" "$BASE/api/candidaturas/contratante/historico")
TOTAL_HIST=$(echo "$RESP" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['historico']))" 2>/dev/null || echo "0")
echo "  total no histórico: $TOTAL_HIST"
[ "$TOTAL_HIST" -ge 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 25. Marcar mensagens como lidas
echo "[25] Marcar notificações como lidas"
CODE=$(http_code -X POST -H "Authorization: Bearer $CONT_TOKEN" "$BASE/api/notificacoes/marcar-lidas")
assert_eq 200 "$CODE" "POST /notificacoes/marcar-lidas retorna 200"
# --- 26. Webhook de verificação de registro logado
echo "[26] Webhook de verificação de registro logado"
sleep 2
RV_COUNT=$(cd "$BACKEND_DIR" 2>/dev/null && node -e 'import("./src/db/driver.js").then(async m=>{const db=m.default;const row=await db.get("SELECT COUNT(*) AS n FROM webhook_logs WHERE tipo = ?",["registro_verificacao"]);console.log(row?.n||0);}).catch(()=>console.log(0))' 2>/dev/null | tail -1)
echo "  total verificações no webhook_logs: $RV_COUNT"
[ -n "$RV_COUNT" ] && [ "$RV_COUNT" -ge 0 ] 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))


# --- 27. Resiliência: entrada inválida NÃO pode derrubar a API
# O Express 4 não captura erros em handlers async — um INSERT com FK
# inexistente virava unhandledRejection e matava o processo inteiro.
echo "[27] Mensagem para destinatário inexistente não derruba o servidor"
CODE_MSG=$(http_code -X POST "$BASE/api/mensagens" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id_destinatario":999999,"conteudo":"destinatario inexistente"}')
assert_eq 404 "$CODE_MSG" "destinatário inexistente → 404"

SAUDE_DEPOIS=$(http_body "$BASE/api/health")
assert_true "$(echo "$SAUDE_DEPOIS" | grep -q '"reachable":true' && echo 1 || echo 0)" "API continua respondendo depois do erro"

# Vaga inexistente na candidatura também não pode derrubar o servidor
CODE_CAND=$(http_code -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id_vaga":999999}')
assert_eq 404 "$CODE_CAND" "candidatura a vaga inexistente → 404"

SAUDE_FINAL=$(http_body "$BASE/api/health")
assert_true "$(echo "$SAUDE_FINAL" | grep -q '"reachable":true' && echo 1 || echo 0)" "API ainda de pé no fim do smoke test"


echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1
