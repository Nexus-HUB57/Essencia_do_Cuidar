#!/usr/bin/env bash
# Smoke test — Sistema de Matching Vagas x Profissional (Sprint 2 / M1-fix)
#
# Cobre:
#   - taxonomia de profissões (GET /api/profissionais/profissoes)
#   - GET /api/vagas/:id/recomendar  (contratante → profissionais)
#   - GET /api/profissionais/me/recomendar (profissional → vagas)
#   - o critério de profession realmente pontua (regressão do bug do Sprint 1)
#   - exclusão de quem já se candidatou
#   - filtros minScore / limite
#   - autorização (dono da vaga, tipo de usuário, token ausente)
#   - persistência de profissao/regiao em PUT /api/profissionais/me
#   - filtros expandidos de listagem (M4)
#
# Uso: BASE=http://localhost:4000 ./scripts/smoke-test-matching.sh
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

assert_ne() {
  local a=$1 b=$2 label=$3
  if [ "$a" != "$b" ]; then
    echo -e "  ${GREEN}✓${NC} $label ($a ≠ $b)"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label (esperava valores diferentes, ambos: $a)"
    FAIL=$((FAIL+1))
  fi
}

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

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
http_body() { curl -s "$@"; }
json() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo ""; }

echo -e "${YELLOW}=== Smoke test — Matching Vagas x Profissional ===${NC}"
echo "BASE = $BASE"
echo ""

# ── 0. Healthcheck ────────────────────────────────────────────────────────
echo "[0] Healthcheck"
HC=$(http_body "$BASE/api/health")
assert_true "$(echo "$HC" | grep -q '"reachable":true' && echo 1 || echo 0)" "banco de dados acessível"

# ── 1. Taxonomia de profissões ───────────────────────────────────────────
echo ""
echo "[1] Taxonomia de profissões"
PROFISSOES=$(http_body "$BASE/api/profissionais/profissoes")
N_PROF=$(echo "$PROFISSOES" | json "len(d['profissoes'])")
assert_true "$([ "${N_PROF:-0}" -ge 10 ] && echo 1 || echo 0)" "lista traz $N_PROF profissões"
assert_true "$(echo "$PROFISSOES" | grep -q '"cuidador"' && echo 1 || echo 0)" "inclui 'cuidador'"
assert_true "$(echo "$PROFISSOES" | grep -q '"fisioterapeuta"' && echo 1 || echo 0)" "inclui 'fisioterapeuta'"

# ── 2. Logins ────────────────────────────────────────────────────────────
echo ""
echo "[2] Autenticação"
CONTRATANTE=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"maria@demo.com","senha":"demo1234"}')
TOKEN_C=$(echo "$CONTRATANTE" | json "d.get('token','')")
assert_true "$([ -n "$TOKEN_C" ] && echo 1 || echo 0)" "login do contratante (maria@demo.com)"

PROFISSIONAL=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"joao@demo.com","senha":"demo1234"}')
TOKEN_P=$(echo "$PROFISSIONAL" | json "d.get('token','')")
assert_true "$([ -n "$TOKEN_P" ] && echo 1 || echo 0)" "login do profissional (joao@demo.com)"

# ── 3. Recomendações para uma vaga ───────────────────────────────────────
echo ""
echo "[3] GET /api/vagas/:id/recomendar"
# Resolve a vaga pelo profession pedido em vez de fixar o id — o id depende
# do estado do banco. Pega a de MENOR id entre as de cuidador: a API ordena
# por criado_em DESC, então "a primeira" seria a mais recente (inclusive as
# que o smoke-test.sh acabou de criar), e não a vaga do seed.
VAGA_ID=$(http_body "$BASE/api/vagas" \
  | python3 -c "import json,sys;v=json.load(sys.stdin)['vagas'];c=[x['id'] for x in v if 'Cuidador' in x['profissional_desejado']];print(min(c) if c else '')" 2>/dev/null || echo "")
assert_true "$([ -n "$VAGA_ID" ] && echo 1 || echo 0)" "vaga de cuidador encontrada (id $VAGA_ID)"

REC=$(http_body "$BASE/api/vagas/$VAGA_ID/recomendar" -H "Authorization: Bearer $TOKEN_C")
TOTAL_REC=$(echo "$REC" | json "d['total']")
assert_true "$([ "${TOTAL_REC:-0}" -ge 2 ] && echo 1 || echo 0)" "retorna $TOTAL_REC profissionais para a vaga $VAGA_ID"

# ── 4. REGRESSÃO: o critério de profissão precisa pontuar ─────────────────
# No Sprint 1 o matcher comparava a profissão da vaga com as *especialidades*
# do profissional, o que dava 0 sempre e achatava todos os scores em ~0.5.
echo ""
echo "[4] Critério de profissão pontua (regressão do Sprint 1)"
TEM_PROF=$(echo "$REC" | json "sum(1 for r in d['recomendacoes'] for m in r['motivosDetalhados'] if m['codigo'].startswith('profissao') and m['pontos'] and m['pontos'] > 0)")
assert_true "$([ "${TEM_PROF:-0}" -ge 1 ] && echo 1 || echo 0)" "há match de profissão com pontos > 0"

# ── 5. Scores diferenciados (ordem por compatibilidade) ───────────────────
echo ""
echo "[5] Scores diferenciados e ordenados"
SCORES=$(echo "$REC" | json "','.join(str(r['score']) for r in d['recomendacoes'])")
DISTINTOS=$(echo "$REC" | json "len({r['score'] for r in d['recomendacoes']})")
assert_true "$([ "${DISTINTOS:-0}" -ge 2 ] && echo 1 || echo 0)" "scores distintos entre os recommendations ($SCORES)"
ORDENADO=$(echo "$REC" | json "1 if all(d['recomendacoes'][i]['score'] >= d['recomendacoes'][i+1]['score'] for i in range(len(d['recomendacoes'])-1)) else 0")
assert_eq 1 "$ORDENADO" "lista ordenada por score decrescente"

# ── 6. Motivos estruturados (traduzíveis) ────────────────────────────────
echo ""
echo "[6] Motivos estruturados"
CODIGOS=$(echo "$REC" | json "','.join(sorted({m['codigo'] for r in d['recomendacoes'] for m in r['motivosDetalhados']}))")
echo "  códigos: $CODIGOS"
assert_true "$(echo "$REC" | grep -q '"codigo"' && echo 1 || echo 0)" "motivos trazem 'codigo' (i18n)"
assert_true "$(echo "$REC" | grep -q '"detalhe"' && echo 1 || echo 0)" "motivos trazem 'detalhe' (interpolação)"
assert_true "$(echo "$REC" | grep -q '"nivel"' && echo 1 || echo 0)" "recomendações trazem 'nivel'"

# ── 7. Match exato de profissão fica no topo ─────────────────────────────
echo ""
echo "[7] Match exato de profissão ranqueia primeiro"
TOPO=$(echo "$REC" | json "d['recomendacoes'][0]['profissional']['profissao'] if d['recomendacoes'] else ''")
VAGA_PROF=$(http_body "$BASE/api/vagas/1" | json "d['vaga']['profissional_desejado']")
echo "  vaga pede: $VAGA_PROF | topo: $TOPO"
assert_eq "cuidador" "$TOPO" "topo é o profissional com a profissão da vaga"

# ── 8. Recomendações para o profissional ──────────────────────────────────
echo ""
echo "[8] GET /api/profissionais/me/recomendar"
REC_P=$(http_body "$BASE/api/profissionais/me/recomendar" -H "Authorization: Bearer $TOKEN_P")
TOTAL_REC_P=$(echo "$REC_P" | json "d['total']")
assert_true "$([ "${TOTAL_REC_P:-0}" -ge 1 ] && echo 1 || echo 0)" "retorna $TOTAL_REC_P vagas para o profissional"
TOPO_P=$(echo "$REC_P" | json "d['recomendacoes'][0]['vaga']['profissional_desejado'] if d['recomendacoes'] else ''")
assert_eq "Fisioterapeuta" "$TOPO_P" "topo é a vaga da profissão do profissional"

# ── 9. Quem já se candidatou não é recomendado ───────────────────────────
echo ""
echo "[9] Profissional que já se candidatou não é recomendado"
# Ana (id 3) já se candidatou nas vagas fechadas do seed. Vamos usar um caso
# controlado: criar uma vaga nova, candidatar e checar que ela some da lista.
VAGA_NOVA=$(http_body -X POST "$BASE/api/vagas" \
  -H "Authorization: Bearer $TOKEN_C" -H "Content-Type: application/json" \
  -d '{"complexidade":"baixa","servico_descricao":"Teste de smoke do matching automatico","profissional_desejado":"Fisioterapeuta","regiao":"Zona Oeste - SP","jornada_horario":"10h-12h","remuneracao_tipo":"hora","remuneracao_valor":100}')
VAGA_TESTE_ID=$(echo "$VAGA_NOVA" | json "d['vaga']['id']")
assert_true "$([ -n "$VAGA_TESTE_ID" ] && echo 1 || echo 0)" "vaga de teste criada (id $VAGA_TESTE_ID)"

# João (fisioterapeuta) se candidata nessa vaga
http_body -X POST "$BASE/api/candidaturas" \
  -H "Authorization: Bearer $TOKEN_P" -H "Content-Type: application/json" \
  -d "{\"id_vaga\":$VAGA_TESTE_ID,\"mensagem\":\"smoke\"}" > /dev/null
REC_DEPOIS=$(http_body "$BASE/api/vagas/$VAGA_TESTE_ID/recomendar" -H "Authorization: Bearer $TOKEN_C")
JOAO_ID=$(echo "$TOKEN_P" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
JA_CANDIDATOU=$(echo "$REC_DEPOIS" | json "1 if any(r['profissional']['id'] == $JOAO_ID for r in d['recomendacoes']) else 0")
assert_eq 0 "$JA_CANDIDATOU" "João (id 4) não aparece após se candidar"

# ── 10. Filtros minScore e limite ─────────────────────────────────────────
echo ""
echo "[10] Filtros minScore e limite"
REC_ALTO=$(http_body "$BASE/api/vagas/$VAGA_ID/recomendar?minScore=0.9" -H "Authorization: Bearer $TOKEN_C")
N_ALTO=$(echo "$REC_ALTO" | json "len(d['recomendacoes'])")
assert_eq 1 "$N_ALTO" "minScore=0.9 mantém só o match alto"
REC_LIM=$(http_body "$BASE/api/vagas/$VAGA_ID/recomendar?limite=1" -H "Authorization: Bearer $TOKEN_C")
N_LIM=$(echo "$REC_LIM" | json "len(d['recomendacoes'])")
assert_eq 1 "$N_LIM" "limite=1 corta a lista"

# ── 11. Autorização ───────────────────────────────────────────────────────
echo ""
echo "[11] Autorização"
assert_eq 401 "$(http_code "$BASE/api/vagas/$VAGA_ID/recomendar")" "sem token → 401"
assert_eq 403 "$(http_code "$BASE/api/vagas/$VAGA_ID/recomendar" -H "Authorization: Bearer $TOKEN_P")" "profissional tentando ver recomendações de vaga → 403"
assert_eq 403 "$(http_code "$BASE/api/profissionais/me/recomendar" -H "Authorization: Bearer $TOKEN_C")" "contratante tentando ver recomendações de perfil → 403"
assert_eq 404 "$(http_code "$BASE/api/vagas/999999/recomendar" -H "Authorization: Bearer $TOKEN_C")" "vaga inexistente → 404"

# Outro contratante não pode ver as recomendações da vaga do maria
OUTRO=$(http_body -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"oliveira@demo.com","senha":"demo1234"}')
TOKEN_O=$(echo "$OUTRO" | json "d.get('token','')")
assert_eq 403 "$(http_code "$BASE/api/vagas/$VAGA_ID/recomendar" -H "Authorization: Bearer $TOKEN_O")" "contratante que não é dono → 403"

# ── 12. Persistência de profissão e região ───────────────────────────────
echo ""
echo "[12] PUT /api/profissionais/me persiste profissão e região"
SAVE=$(http_body -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $TOKEN_P" -H "Content-Type: application/json" \
  -d '{"profissao":"fisioterapeuta","regiao":"Zona Oeste - SP"}')
PROF_SALVA=$(echo "$SAVE" | json "d['detalhes'].get('profissao','')")
REG_SALVA=$(echo "$SAVE" | json "d['detalhes'].get('regiao','')")
assert_eq "fisioterapeuta" "$PROF_SALVA" "profissão persistida"
assert_eq "Zona Oeste - SP" "$REG_SALVA" "região persistida"

# O perfil público também expõe os campos
PUB=$(http_body "$BASE/api/profissionais/4")
assert_true "$(echo "$PUB" | grep -q '"profissao"' && echo 1 || echo 0)" "perfil público inclui 'profissao'"
assert_true "$(echo "$PUB" | grep -q '"regiao"' && echo 1 || echo 0)" "perfil público inclui 'regiao'"

# ── 13. Validação de profissão inválida ──────────────────────────────────
echo ""
echo "[13] Validação de entrada"
CODE_INVALIDA=$(http_code -X PUT "$BASE/api/profissionais/me" \
  -H "Authorization: Bearer $TOKEN_P" -H "Content-Type: application/json" \
  -d '{"profissao":"astrologo"}')
assert_eq 400 "$CODE_INVALIDA" "profissão fora da taxonomia → 400"

# ── 14. Filtros expandidos de listagem (M4) ───────────────────────────────
echo ""
echo "[14] Filtros expandidos em GET /api/vagas"
FILTROS=$(http_body "$BASE/api/vagas?tipoContrato=CLT&remuneracaoTipo=hora")
N_FILTROS=$(echo "$FILTROS" | json "d['total']")
assert_true "$([ "${N_FILTROS:-0}" -ge 1 ] && echo 1 || echo 0)" "tipoContrato+remuneracaoTipo filtram ($N_FILTROS vagas)"

ORD=$(http_body "$BASE/api/vagas?ordenar=remuneracao")
ORD_OK=$(echo "$ORD" | json "1 if all(d['vagas'][i]['remuneracao_valor'] >= d['vagas'][i+1]['remuneracao_valor'] for i in range(len(d['vagas'])-1)) else 0")
assert_eq 1 "$ORD_OK" "ordenar=remuneracao ordena do maior pro menor"

PAG=$(http_body "$BASE/api/vagas?limite=2&offset=1")
N_PAG=$(echo "$PAG" | json "len(d['vagas'])")
assert_eq 2 "$N_PAG" "paginação (limite=2) devolve 2 vagas"
assert_true "$(echo "$PAG" | grep -q '"total"' && echo 1 || echo 0)" "resposta inclui 'total'"

# ── 15. Coluna de ordenação é validada (anti-injeção) ─────────────────────
# Comportamento esperado: um valor fora da whitelist NÃO é erro — o backend
# cai no default (`criado_em`). O que importa é que nada seja injetado no SQL.
echo ""
echo "[15] Anti-injeção no parâmetro ordenar"
CODE_ORD=$(http_code "$BASE/api/vagas?ordenar=criado_em;DROP+TABLE+vagas")
assert_eq 200 "$CODE_ORD" "ordenar inválido cai no default (não injeta)"

ORD_INJ=$(http_body "$BASE/api/vagas?ordenar=criado_em;DROP+TABLE+vagas")
N_INJ=$(echo "$ORD_INJ" | json "len(d['vagas'])")
assert_true "$([ "${N_INJ:-0}" -ge 1 ] && echo 1 || echo 0)" "lista continua válida após tentativa de injeção"

# A tabela precisa continuar de pé depois do ataque.
SAUDE=$(http_body "$BASE/api/health")
assert_true "$(echo "$SAUDE" | grep -q '"reachable":true' && echo 1 || echo 0)" "banco continua íntegro após a tentativa"

# Uma ordenação válida por coluna conhecida deve continuar funcionando.
CODE_ORD_OK=$(http_code "$BASE/api/vagas?ordenar=remuneracao")
assert_eq 200 "$CODE_ORD_OK" "ordenar válido continua aceito"

echo ""
echo "============================================================"
echo -e "  ${GREEN}Passou: $PASS${NC} | ${RED}Falhou: $FAIL${NC}"
echo "============================================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1
