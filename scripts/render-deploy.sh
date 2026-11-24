#!/usr/bin/env bash
# ============================================================================
# render-deploy.sh — configura e publica o backend na Render, pela API
#
# POR QUE ESTE SCRIPT
#
# Em 23/11/2026 o backend de produção (https://essencia-backend.onrender.com)
# respondia 404 em TODAS as rotas — inclusive /api/health e /api/auth/login.
# A causa não era o código: o serviço publicado no Render não estava
# apontando para este repositório/branch/rootDir. Diagnosticar isso pelo
# painel do Render a cada vez é lento e Manual; este script faz o diagnóstico
# E a correção em um comando.
#
# O QUE ELE FAZ
#
#   1. valida a chave da API do Render;
#   2. localiza o Web Service (por id, ou pelo nome em render.yaml);
#   3. compara a configuração do serviço com a declarativa (render.yaml) e
#      corrige repo / branch / rootDir / buildCommand / startCommand /
#      autoDeploy;
#   4. garante as variáveis de ambiente (FRONTEND_URL, NODE_ENV, cron,
#      protocolos...) sem apagar as que já existem;
#   5. dispara o deploy e espera o status ficar "live";
#   6. verifica /api/health no host público e diagnostica a falha com
#      clareza: 404 = serviço não monta as rotas; 502 = serviço caiu.
#
# USO
#
#   export RENDER_API_KEY=rend_xxxxxxxx
#   bash scripts/render-deploy.sh                 # corrige, publica e verifica
#   bash scripts/render-deploy.sh --dry-run       # só diagnóstico
#   bash scripts/render-deploy.sh --skip-deploy   # corrige sem publicar
#   bash scripts/render-deploy.sh --generate-jwt  # cria JWT_SECRET se faltar
#
# A chave sai de: Render → Account Settings → API Keys → Create API Key.
# ============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Base da API — sobrescrevível para testes contra um mock local.
RENDER_API="${RENDER_API:-https://api.render.com/v1}"
GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; DIM="\033[2m"; NC="\033[0m"

DRY_RUN=0
SKIP_DEPLOY=0
GENERATE_JWT=0
DEPLOY_TIMEOUT="${RENDER_DEPLOY_TIMEOUT:-900}"

step() { echo -e "${YELLOW}▶ $*${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
bad()  { echo -e "  ${RED}✗${NC} $*"; }
die()  { bad "$*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)      DRY_RUN=1 ;;
    --skip-deploy)  SKIP_DEPLOY=1 ;;
    --generate-jwt) GENERATE_JWT=1 ;;
    --timeout)      DEPLOY_TIMEOUT="$2"; shift ;;
    -h|--help)      sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              die "opção desconhecida: $1" ;;
  esac
  shift
done

cd "$REPO_ROOT"

# ── 1. chave da API ────────────────────────────────────────────────────────
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  die "RENDER_API_KEY não definida.
   Crie uma chave em Render → Account Settings → API Keys e exporte:
     export RENDER_API_KEY=rend_xxxxxxxx"
fi

render_curl() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -m 60 -X "$method" "${RENDER_API}${path}" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -m 60 -X "$method" "${RENDER_API}${path}" \
      -H "Authorization: Bearer ${RENDER_API_KEY}"
  fi
}

step "Validando a chave da API do Render"
services_json=$(render_curl GET "/services")
if echo "$services_json" | grep -q '"code":"unauthorized"\|"code":"invalid"\|"message":"Unauthorized"'; then
  die "a chave da API do Render foi recusada. Confira RENDER_API_KEY."
fi
if ! echo "$services_json" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  die "resposta inesperada da API do Render: $(echo "$services_json" | head -c 200)"
fi
ok "chave aceita"

# ── 2. configuração declarativa (render.yaml) ──────────────────────────────
step "Lendo a configuração declarativa (render.yaml)"
desired_json=$(python3 - "$REPO_ROOT/render.yaml" <<'PY'
import json, re, sys

texto = open(sys.argv[1], encoding='utf-8').read()
linhas = texto.split('\n')

# Extrai o bloco do primeiro serviço web (type: web) do render.yaml.
inicio = None
for i, l in enumerate(linhas):
    if re.match(r'^\s*-\s*type:\s*web\s*$', l):
        inicio = i
        break
if inicio is None:
    print(json.dumps({"erro": "nenhum serviço 'type: web' no render.yaml"}))
    sys.exit(0)

fim = len(linhas)
for j in range(inicio + 1, len(linhas)):
    # fim do serviço: próximo item da lista de nível superior
    if re.match(r'^  -\s*type:', linhas[j]) or re.match(r'^services:', linhas[j]):
        fim = j
        break
bloco = linhas[inicio:fim]

cfg = {}
chaves = ('name', 'rootDir', 'buildCommand', 'startCommand', 'healthCheckPath',
          'autoDeploy', 'runtime', 'plan')

def limpar(valor):
    """Tira comentário inline do YAML e aspas em volta."""
    v = valor.split(' #')[0].strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        v = v[1:-1]
    return v

for l in bloco:
    m = re.match(r'^\s{4}(\w+):\s*(.+?)\s*$', l)
    if m and m.group(1) in chaves:
        cfg[m.group(1)] = limpar(m.group(2))

# envVars: lista de - key: X / value: Y
env = {}
i = 0
while i < len(bloco):
    m = re.match(r'^\s{6}-\s*key:\s*(\S+)\s*$', bloco[i])
    if m:
        key = m.group(1)
        valor = None
        sync = False
        j = i + 1
        while j < len(bloco) and not re.match(r'^\s{6}-\s*key:', bloco[j]):
            mv = re.match(r'^\s{8}value:\s*(.+?)\s*$', bloco[j])
            ms = re.match(r'^\s{8}sync:\s*(.+?)\s*$', bloco[j])
            if mv: valor = limpar(mv.group(1))
            if ms: sync = (limpar(ms.group(1)) == 'false')
            j += 1
        if valor is not None:
            env[key] = valor
        elif sync:
            env[key] = None      # segredo: precisa ser definido fora do repo
        i = j
        continue
    i += 1

print(json.dumps({
    "name": cfg.get("name"),
    "rootDir": cfg.get("rootDir"),
    "buildCommand": cfg.get("buildCommand"),
    "startCommand": cfg.get("startCommand"),
    "healthCheckPath": cfg.get("healthCheckPath"),
    "autoDeploy": cfg.get("autoDeploy"),
    "envVars": env,
}, ensure_ascii=False))
PY
)

SERVICE_NAME=$(echo "$desired_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('name') or '')" 2>/dev/null)
DESIRED_ROOT=$(echo "$desired_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('rootDir') or '')" 2>/dev/null)
DESIRED_BUILD=$(echo "$desired_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('buildCommand') or '')" 2>/dev/null)
DESIRED_START=$(echo "$desired_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('startCommand') or '')" 2>/dev/null)
DESIRED_HEALTH=$(echo "$desired_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('healthCheckPath') or '')" 2>/dev/null)
[[ -n "$SERVICE_NAME" ]] || die "não consegui ler o nome do serviço em render.yaml"

ok "serviço declarado: $SERVICE_NAME (rootDir=$DESIRED_ROOT, start=$DESIRED_START)"

# ── 3. localizar o serviço ─────────────────────────────────────────────────
step "Localizando o serviço na Render"
SERVICE_ID="${RENDER_SERVICE_ID:-}"
if [[ -z "$SERVICE_ID" ]]; then
  SERVICE_ID=$(echo "$services_json" | python3 -c "
import json,sys
nome='$SERVICE_NAME'
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for s in d:
    if s.get('type')=='web' and (s.get('name')==nome or s.get('slug')==nome):
        print(s['id']); break
")
fi
[[ -n "$SERVICE_ID" ]] || die "serviço '$SERVICE_NAME' não encontrado (use RENDER_SERVICE_ID=<srv-xxx>)
   Serviços visíveis: $(echo "$services_json" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: d=[]
print(', '.join(f\"{s.get('name')}({s.get('type')})\" for s in d) or 'nenhum')
")"

svc=$(render_curl GET "/services/$SERVICE_ID")
echo "$svc" | grep -q '"id"' || die "não consegui ler o serviço $SERVICE_ID: $(echo "$svc" | head -c 200)"

CURRENT_REPO=$(echo "$svc"     | python3 -c "import json,sys; print(json.load(sys.stdin).get('repo') or '')")
CURRENT_BRANCH=$(echo "$svc"   | python3 -c "import json,sys; print(json.load(sys.stdin).get('branch') or '')")
CURRENT_ROOT=$(echo "$svc"     | python3 -c "import json,sys; print(json.load(sys.stdin).get('rootDir') or '')")
CURRENT_BUILD=$(echo "$svc"    | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('serviceDetails') or {}).get('buildCommand') or '')")
CURRENT_START=$(echo "$svc"    | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('serviceDetails') or {}).get('startCommand') or '')")
CURRENT_AUTO=$(echo "$svc"     | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('autoDeployTrigger') or d.get('autoDeploy') or '')")
BUILD_SOURCE=$(echo "$svc"     | python3 -c "import json,sys; print(json.load(sys.stdin).get('buildSourceId') or '')")
SERVICE_SLUG=$(echo "$svc"     | python3 -c "import json,sys; print(json.load(sys.stdin).get('slug') or '')")
SERVICE_HOST="${RENDER_SERVICE_HOST:-${SERVICE_SLUG}.onrender.com}"

echo "  id        : $SERVICE_ID"
echo "  repo      : ${CURRENT_REPO:-<vazio>}"
echo "  branch    : ${CURRENT_BRANCH:-<vazio>}"
echo "  rootDir   : ${CURRENT_ROOT:-<vazio>}"
echo "  build     : ${CURRENT_BUILD:-<vazio>}"
echo "  start     : ${CURRENT_START:-<vazio>}"
echo "  autoDeploy: ${CURRENT_AUTO:-<vazio>}"
[[ -n "$BUILD_SOURCE" ]] && echo "  buildSrc  : $BUILD_SOURCE (build source compartilhado)"

# ── 4. corrigir a configuração ─────────────────────────────────────────────
step "Comparando com a configuração declarativa"

REPO_URL="${RENDER_REPO_URL:-https://github.com/Nexus-HUB57/Essencia_do_Cuidar}"
BRANCH="${RENDER_BRANCH:-main}"

# Calcula o patch do SERVIÇO em Python (evita montar JSON à mão em bash).
patch_service=$(SVC_JSON="$svc" REPO_URL="$REPO_URL" BRANCH="$BRANCH" \
  DESIRED_ROOT="$DESIRED_ROOT" DESIRED_BUILD="$DESIRED_BUILD" DESIRED_START="$DESIRED_START" \
  HAS_BUILD_SOURCE="$BUILD_SOURCE" python3 - <<'PY'
import json, os

svc = json.loads(os.environ["SVC_JSON"])
tem_bs = bool(os.environ.get("HAS_BUILD_SOURCE"))

patch = {}

# Com build source, repo/branch/rootDir/buildCommand vivem no BUILD SOURCE —
# a API rejeita mexer neles no serviço ("Cannot be combined with
# build-configuration changes"). No serviço só o startCommand é livre.
if not tem_bs:
    if svc.get("repo") != os.environ["REPO_URL"]:
        patch["repo"] = os.environ["REPO_URL"]
    if svc.get("branch") != os.environ["BRANCH"]:
        patch["branch"] = os.environ["BRANCH"]
    if (svc.get("rootDir") or "") != os.environ["DESIRED_ROOT"]:
        patch["rootDir"] = os.environ["DESIRED_ROOT"]

sd = svc.get("serviceDetails") or {}
novo_sd = {}
if (sd.get("buildCommand") or "") != os.environ["DESIRED_BUILD"] and not tem_bs:
    novo_sd["buildCommand"] = os.environ["DESIRED_BUILD"]
if (sd.get("startCommand") or "") != os.environ["DESIRED_START"]:
    novo_sd["startCommand"] = os.environ["DESIRED_START"]
if novo_sd:
    patch["serviceDetails"] = novo_sd

auto = svc.get("autoDeployTrigger") or svc.get("autoDeploy") or ""
if auto not in ("commit", "yes"):
    patch["autoDeployTrigger"] = "commit"

print(json.dumps(patch))
PY
)

if [[ -n "$BUILD_SOURCE" ]]; then
  # Serviço ligado a um build source: repo/branch/rootDir/buildCommand vão
  # no build source; no serviço só pode mudar o startCommand.
  bs=$(render_curl GET "/build-sources/$BUILD_SOURCE")
  BS_REPO=$(echo "$bs"    | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('git') or {}).get('repo') or '')" 2>/dev/null)
  BS_BRANCH=$(echo "$bs"  | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('git') or {}).get('branch') or '')" 2>/dev/null)
  BS_ROOT=$(echo "$bs"    | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('git') or {}).get('rootDir') or '')" 2>/dev/null)
  BS_BUILD=$(echo "$bs"   | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('git') or {}).get('buildCommand') or '')" 2>/dev/null)
  echo "  build source: repo=${BS_REPO:-<vazio>} branch=${BS_BRANCH:-<vazio>} rootDir=${BS_ROOT:-<vazio>} build=${BS_BUILD:-<vazio>}"
  patch_buildsource=$(BS_REPO="$BS_REPO" BS_BRANCH="$BS_BRANCH" BS_ROOT="$BS_ROOT" BS_BUILD="$BS_BUILD" \
    REPO_URL="$REPO_URL" BRANCH="$BRANCH" \
    DESIRED_ROOT="$DESIRED_ROOT" DESIRED_BUILD="$DESIRED_BUILD" python3 - <<'PY'
import json, os
git = {}
if os.environ["BS_REPO"] != os.environ["REPO_URL"]:
    git["repo"] = os.environ["REPO_URL"]
if os.environ["BS_BRANCH"] != os.environ["BRANCH"]:
    git["branch"] = os.environ["BRANCH"]
if (os.environ["BS_ROOT"] or "") != os.environ["DESIRED_ROOT"]:
    git["rootDir"] = os.environ["DESIRED_ROOT"]
if (os.environ["BS_BUILD"] or "") != os.environ["DESIRED_BUILD"]:
    git["buildCommand"] = os.environ["DESIRED_BUILD"]
print(json.dumps({"git": git} if git else {}))
PY
)
  if [[ "$patch_buildsource" != "{}" ]]; then
    ok "build source precisa de ajuste: $patch_buildsource"
    if [[ $DRY_RUN -eq 0 ]]; then
      out=$(render_curl PATCH "/build-sources/$BUILD_SOURCE" "$patch_buildsource")
      echo "$out" | grep -q '"id"' && ok "build source atualizado" || bad "falha ao atualizar build source: $(echo "$out" | head -c 200)"
    fi
  else
    ok "build source já está correto"
  fi
fi

if [[ "$patch_service" != "{}" ]]; then
  echo "  patch: $patch_service"
  if [[ $DRY_RUN -eq 0 ]]; then
    out=$(render_curl PATCH "/services/$SERVICE_ID" "$patch_service")
    if echo "$out" | grep -q '"id"'; then
      ok "configuração do serviço corrigida"
    else
      bad "falha ao atualizar o serviço: $(echo "$out" | head -c 300)"
    fi
  fi
else
  ok "configuração do serviço já está correta"
fi

# ── 5. variáveis de ambiente ───────────────────────────────────────────────
step "Conferindo as variáveis de ambiente"
env_json=$(render_curl GET "/services/$SERVICE_ID/env-vars")
env_map=$(echo "$env_json" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: d=[]
for e in d:
    print(f\"{e.get('key')}={e.get('value')}\")
" 2>/dev/null)

current_env=$(echo "$env_map" | cut -d= -f1 | tr '\n' ' ')
echo "  definidas: ${current_env:-<nenhuma>}"

# Valores esperados, lidos do render.yaml (single source of truth).
desired_env=$(echo "$desired_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k,v in (d.get('envVars') or {}).items():
    if v is not None: print(f'{k}={v}')
")

# Ajustes que o render.yaml ainda não tinha (bug de CORS: o domínio real do
# site é essenciadocuidar.netlify.app, não ecuidar.netlify.app).
FRONTEND_URL="${FRONTEND_URL:-https://ecuidar.netlify.app,https://essenciadocuidar.netlify.app}"
desired_env=$(printf '%s\n%s\n' "$desired_env" "FRONTEND_URL=$FRONTEND_URL" \
  "ENABLE_INTERNAL_CRON=true" "PROTOCOLOS_ENABLED=true" \
  "PLATFORM_FEE_PCT=10" "PRAZO_PCM_HORAS=48" "PRAZO_PDC_HORAS=72" \
  "PRAZO_LIBERACAO_HORAS=72" "NODE_ENV=production" | sort -u)

# Secrets: precisam existir, mas o valor não está no repo.
tem_jwt=0
echo "$env_map" | grep -q "^JWT_SECRET=" && tem_jwt=1

merged=$(python3 - <<PY
import json, os
atuais = {}
for linha in """$env_map""".splitlines():
    if "=" in linha:
        k, v = linha.split("=", 1)
        atuais[k] = v
for linha in """$desired_env""".splitlines():
    if "=" in linha:
        k, v = linha.split("=", 1)
        if k in atuais and atuais[k] == v:
            continue
        atuais[k] = v
if not atuais.get("JWT_SECRET") and os.environ.get("GENERATE_JWT") == "1":
    import secrets
    atuais["JWT_SECRET"] = secrets.token_hex(32)
print(json.dumps([{"key": k, "value": v} for k, v in sorted(atuais.items())]))
PY
)

if [[ $DRY_RUN -eq 1 ]]; then
  echo "  (dry-run) variáveis que seriam gravadas:"
  echo "$merged" | python3 -c "
import json,sys
for e in json.load(sys.stdin):
    v = e['value']
    mostrar = (v[:12] + '…') if e['key']=='JWT_SECRET' and v else v
    print(f\"    {e['key']}={mostrar}\")
"
else
  out=$(render_curl PUT "/services/$SERVICE_ID/env-vars" "$merged")
  if echo "$out" | grep -q '"key"\|"envVar"\|\['; then
    ok "variáveis de ambiente gravadas"
  else
    bad "falha ao gravar env-vars: $(echo "$out" | head -c 300)"
  fi
fi

if [[ $tem_jwt -eq 0 && $GENERATE_JWT -eq 0 ]]; then
  warn "JWT_SECRET não está definido no serviço."
  echo "    O backend aborta o startup em produção sem ele (app.js)."
  echo "    Gere: openssl rand -hex 32   e defina no painel do Render, ou rode com --generate-jwt."
fi

# ── 6. deploy ──────────────────────────────────────────────────────────────
if [[ $SKIP_DEPLOY -eq 1 ]]; then
  warn "--skip-deploy: não publiquei nada."
  exit 0
fi

step "Disparando o deploy"
deploy=$(render_curl POST "/services/$SERVICE_ID/deploys" '{"clearCache":"do_not_clear","deployMode":"build_and_deploy"}')
DEPLOY_ID=$(echo "$deploy" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [[ -z "$DEPLOY_ID" ]]; then
  die "não consegui disparar o deploy: $(echo "$deploy" | head -c 300)"
fi
ok "deploy $DEPLOY_ID disparado"

step "Aguardando o deploy (limite ${DEPLOY_TIMEOUT}s)"
inicio=$(date +%s)
status=""
while true; do
  d=$(render_curl GET "/services/$SERVICE_ID/deploys/$DEPLOY_ID")
  status=$(echo "$d" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  agora=$(date +%s); decorrido=$(( agora - inicio ))
  printf "\r  ${DIM}status=%-22s %ss${NC}" "$status" "$decorrido"
  case "$status" in
    live)          printf "\r"; ok "deploy no ar (live) em ${decorrido}s"; break ;;
    build_failed|update_failed|pre_deploy_failed|canceled|deactivated)
      printf "\r"
      bad "deploy falhou (status=$status)"
      echo "$d" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('  commit:', (d.get('commit') or {}).get('id','')[:8], '| trigger:', d.get('trigger'))
" 2>/dev/null
      echo "  Logs: https://dashboard.render.com/web/$SERVICE_ID"
      exit 1 ;;
  esac
  if [[ $decorrido -ge $DEPLOY_TIMEOUT ]]; then
    printf "\r"; die "timeout de ${DEPLOY_TIMEOUT}s esperando o deploy (status=$status)"
  fi
  sleep 10
done

# ── 7. verificação do host público ─────────────────────────────────────────
step "Verificando o backend público"
SCHEME="${RENDER_SERVICE_SCHEME:-https}"
HEALTH_URL="${SCHEME}://${SERVICE_HOST}${DESIRED_HEALTH:-/api/health}"
espera=0
while true; do
  code=$(curl -s -o /tmp/render_health.txt -w "%{http_code}" -m 30 "$HEALTH_URL" 2>/dev/null)
  code="${code:-000}"
  corpo=$(head -c 400 /tmp/render_health.txt 2>/dev/null || echo "")
  espera=$(( espera + 5 ))
  if [[ "$code" == "200" ]] && echo "$corpo" | grep -q '{'; then break; fi
  [[ $espera -ge 120 ]] && break
  sleep 5
done

echo "  $HEALTH_URL → HTTP $code"
if [[ "$code" == "200" ]] && echo "$corpo" | grep -q '{'; then
  ok "backend respondendo JSON: $(echo "$corpo" | head -c 160)"
else
  bad "backend não responde como a nossa API (HTTP $code)"
  if echo "$corpo" | grep -q "Cannot GET"; then
    echo "    Diagnóstico: o serviço está no ar mas NÃO monta as rotas da API."
    echo "    Causa provável: rootDir/branch/repo errados no serviço."
    echo "    Confira com: bash scripts/render-deploy.sh --dry-run"
  elif [[ "$code" == "502" || "$code" == "504" || "$code" == "000" ]]; then
    echo "    Diagnóstico: o serviço caiu (502/504) — o start command ou as env vars falharam."
    echo "    Logs: https://dashboard.render.com/web/$SERVICE_ID"
  fi
  exit 1
fi

# ── 8. CORS ────────────────────────────────────────────────────────────────
step "Conferindo o CORS contra o site publicado"
# FRONTEND_URL pode ser uma lista separada por vírgula — cada origem é
# testada separadamente (o header Origin aceita só uma por requisição).
cors_ok=0
cors_falhou=()
IFS=',' read -ra ORIGENS <<< "$FRONTEND_URL"
for origem in "${ORIGENS[@]}"; do
  origem="$(echo "$origem" | tr -d '[:space:]')"
  [ -z "$origem" ] && continue
  hdr=$(curl -sI -m 25 -H "Origin: $origem" "${HEALTH_URL}" \
        | grep -i "^access-control-allow-origin:" | tr -d '\r' | head -1 \
        | cut -d: -f2- | sed 's/^ *//')
  if echo "$hdr" | grep -qi "$(echo "$origem" | sed 's|https://||')"; then
    ok "CORS liberado para $origem"
    cors_ok=$((cors_ok+1))
  else
    cors_falhou+=("$origem")
  fi
done
if [ ${#cors_falhou[@]} -gt 0 ]; then
  bad "o backend não libera CORS para: ${cors_falhou[*]}"
  echo "    FRONTEND_URL precisa conter o domínio real do site Netlify."
  exit 1
fi
[ $cors_ok -gt 0 ] || { bad "nenhuma origem conferida"; exit 1; }

echo
ok "backend no ar e consistente com o frontend"
exit 0
