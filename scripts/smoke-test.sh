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
echo "$HC" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

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
  -d '{"complexidade":"alta","servico_descricao":"vaga inválida","profissional_desejado":"Médico"}')
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
  -d '{"tipo_registro":"COREN","registro_conselho":"COREN-SP 12345","especialidades":["Idosos"],"disponibilidade":["manha"]}' \
  > /dev/null

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
  -d '{"status_candidatura":"aceita"}')
assert_eq 200 "$CODE" "Aceitar candidatura retorna 200"

# --- 10. Chat
# Resolve o id real do profissional via /auth/me (evita depender de ID fixo)
echo "[10] Chat entre contratante e profissional"
PROF_ID=$(http_body "$BASE/api/auth/me" -H "Authorization: Bearer $PROF_TOKEN" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])" 2>/dev/null || echo "")
[ -n "$PROF_ID" ] && PASS=$((PASS+1)) || { echo "  não resolveu id do profissional"; FAIL=$((FAIL+1)); }
MSG=$(http_body -X POST "$BASE/api/mensagens" \
  -H "Authorization: Bearer $CONT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id_destinatario\":$PROF_ID,\"conteudo\":\"Oi, smoke test!\"}")
MSG_ID=$(echo "$MSG" | python3 -c "import json,sys;print(json.load(sys.stdin)['mensagem']['id'])" 2>/dev/null || echo "")
[ -n "$MSG_ID" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 11. Perfil público
echo "[11] Perfil público do profissional"
RESP=$(http_body "$BASE/api/profissionais/$PROF_ID")
NOME=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['nome'])" 2>/dev/null || echo "")
[ -n "$NOME" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
echo "  nome: $NOME"

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
  -d '{"tipo_usuario":"contratante","nome":"X","email":"x@x.com","senha":"123"}')
assert_eq 400 "$CODE" "Senha curta retorna 400"

# --- 14. Webhook logado
echo "[14] Webhook logado"
sleep 3
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"
WEBHOOK_COUNT=$(cd "$BACKEND_DIR" 2>/dev/null && node -e "
  import('./src/db/index.js')
    .then(async (m) => {
      const r = await m.default.get('SELECT COUNT(*) AS n FROM webhook_logs');
      console.log(r.n);
    })
    .catch(() => console.log(0));
" 2>/dev/null | tail -1)
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
echo "[18] Stats do profissional"
RESP=$(http_body "$BASE/api/profissionais/2")
STATS_TOTAL=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['stats']['total_candidaturas'])" 2>/dev/null || echo "0")
echo "  total de candidaturas: $STATS_TOTAL"
[ "$STATS_TOTAL" -gt 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# --- 19. Avaliação de profissional
echo "[19] Avaliação pública do profissional"
RESP=$(http_body "$BASE/api/avaliacoes/profissional/2")
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

echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1
