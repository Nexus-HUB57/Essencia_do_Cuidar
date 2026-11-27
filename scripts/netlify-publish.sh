#!/usr/bin/env bash
# ============================================================================
# netlify-publish.sh — publicação do frontend na Netlify (usado pelo CI)
#
# Entradas (env):
#   NETLIFY_TOKEN_A — secret CREDENCIAIS_NETFLY
#   NETLIFY_TOKEN_B — secret TOKEN_NETFLY
#   GITHUB_SHA      — commit a publicar (mensagem do deploy)
#
# O que faz:
#   1. Sanitiza os tokens (quebras de linha, aspas, JSON embrulhado);
#   2. Identifica a conta de cada token (GET /user) e lista os sites;
#   3. Seleciona o site essenciadocuidar (exige que a conta o possua);
#   4. Publica --prod --site <id> via netlify-cli;
#   5. Falha RUIDOSAMENTE com mensagem acionável se não publicar.
#
# Saída: steps.netlify.outputs.deploy-url (via $GITHUB_OUTPUT, se presente).
# ============================================================================
set -uo pipefail

SHA="${GITHUB_SHA:-local}"
TOKENS=("${NETLIFY_TOKEN_A:-}" "${NETLIFY_TOKEN_B:-}")

USADO=""
SITE_ID=""
CONTA=""

extract_token() {
  # remove quebras, tabs, espaços e aspas; extrai campo se vier em JSON
  local t
  t=$(printf '%s' "$1" | tr -d '\r\n\t "')
  if [[ "$t" == \{* ]]; then
    t=$(printf '%s' "$t" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("token") or d.get("api_token") or d.get("NETLIFY_AUTH_TOKEN") or "")
except Exception:
    print("")')
  fi
  printf '%s' "$t"
}

netlify_get() {
  # $1=token $2=path $3=arquivo de saída -> imprime o código HTTP
  curl -s -m 20 -o "$3" -w "%{http_code}" -H "Authorization: Bearer $1" \
    "https://api.netlify.com/api/v1/$2" 2>/dev/null || printf 'curl_erro'
}

i=0
for T in "${TOKENS[@]}"; do
  i=$((i + 1))
  [ -n "$T" ] || { echo "Secret $i: vazio"; continue; }
  TSAN=$(extract_token "$T")
  [ -n "$TSAN" ] || { echo "Secret $i: vazio após sanitização"; continue; }
  echo "Secret $i: len=${#TSAN} prefixo=$(printf '%s' "$TSAN" | cut -c1-3)…"

  WHO=$(netlify_get "$TSAN" "user" /tmp/netlify_user.json)
  CONTA=$(python3 - <<'PY' 2>/dev/null
import json
try:
    u = json.load(open('/tmp/netlify_user.json'))
    print(u.get('email') or u.get('full_name') or '?')
except Exception:
    print('?')
PY
)
  echo "Secret $i: GET /api/v1/user -> HTTP $WHO | conta: ${CONTA:-?}"

  CODE=$(netlify_get "$TSAN" "sites" /tmp/netlify_sites.json)
  echo "Secret $i: GET /api/v1/sites -> HTTP $CODE"
  if [ "$CODE" != "200" ]; then
    echo "Secret $i: inválido (HTTP $CODE)"
    continue
  fi

  LISTA=$(python3 - <<'PY' 2>/dev/null
import json
try:
    sites = json.load(open('/tmp/netlify_sites.json'))
    print(' | '.join(
        f"{s.get('name')} id={s.get('id')} dominios={s.get('domain_aliases')}"
        for s in sites[:20]) or '(vazio)')
except Exception:
    print('(erro ao ler)')
PY
)
  echo "Sites na conta: ${LISTA:-?}"

  SITE_ID=$(python3 - <<'PY' 2>/dev/null
import json
try:
    sites = json.load(open('/tmp/netlify_sites.json'))
    cand = [
        s for s in sites
        if 'essenciadocuidar' in ' '.join([
            s.get('name') or '',
            s.get('ssl_url') or '',
            s.get('custom_domain') or '',
            ' '.join(s.get('domain_aliases') or []),
        ])
    ]
    print(cand[0]['id'] if cand else '')
except Exception:
    print('')
PY
)
  if [ -n "$SITE_ID" ]; then
    USADO="$TSAN"
    echo "site-id selecionado: $SITE_ID"
    break
  fi
  echo "Secret $i: autentica, mas a conta não tem o site essenciadocuidar — testando próximo secret"
done

if [ -z "$USADO" ]; then
  echo "::error::Nenhum secret Netlify válido. O token precisa ser CLÁSSICO (acesso total) e criado NA CONTA DONA do site essenciadocuidar.netlify.app (veja 'conta:' e 'Sites na conta' acima)."
  exit 1
fi
if [ -z "$SITE_ID" ]; then
  echo "::error::O token autentica como '${CONTA:-?}', que NÃO possui o site essenciadocuidar. Crie o Personal Access Token na conta dona do site (app.netlify.com → equipe que mostra o site essenciadocuidar → User settings → Applications → New access token) e atualize o secret TOKEN_NETFLY."
  exit 1
fi

# garante o netlify-cli (o workflow já instala; aqui é só salvaguarda)
command -v netlify >/dev/null 2>&1 || npm install -g netlify-cli >/dev/null 2>&1 || true

cd frontend 2>/dev/null || { echo "::error::diretório frontend/ não encontrado"; exit 1; }

export NETLIFY_AUTH_TOKEN="$USADO"
echo "Publicando em produção (site $SITE_ID)…"
RC=0
npx netlify deploy --prod --site "$SITE_ID" --dir dist --message "Deploy $SHA" > /tmp/netlify_deploy.log 2>&1 || RC=$?
echo "--- netlify_deploy.log (tail 40) ---"
tail -40 /tmp/netlify_deploy.log
echo "------------------------------------"
if [ "$RC" -ne 0 ]; then
  echo "::error::netlify deploy falhou (rc=$RC) — ver tail acima."
  exit "$RC"
fi

DEPLOY_URL=$(grep -oP 'Website URL:\s*\Khttps://\S+' /tmp/netlify_deploy.log | head -1)
[ -n "$DEPLOY_URL" ] || DEPLOY_URL=$(grep -oP 'https://[a-z0-9-]+\.netlify\.app' /tmp/netlify_deploy.log | head -1)
echo "Deploy URL: $DEPLOY_URL"
if [ -n "$DEPLOY_URL" ] && [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "deploy-url=$DEPLOY_URL" >> "$GITHUB_OUTPUT"
fi
[ -n "$DEPLOY_URL" ] || { echo "::error::Deploy sem erro explícito, mas nenhuma URL de publicação foi detectada."; exit 1; }
exit 0
