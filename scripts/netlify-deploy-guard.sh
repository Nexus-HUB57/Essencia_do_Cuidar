#!/usr/bin/env bash
# ============================================================================
# netlify-deploy-guard.sh — proteção do deploy na Netlify
#
# POR QUE ISTO EXISTE
#
# O workflow .github/workflows/deploy-netlify.yml faz o deploy assim:
#
#   npx netlify deploy --prod --dir dist ...                 # com o token
#   se falhou:
#     npx netlify deploy --prod --dir dist --allow-anonymous # SEM token
#
# O fallback anônimo não atualiza o site real: ele cria um site NOVO e
# aleatório a cada push (o app linkado continua no ar com a versão velha).
# Em 07/11 e em 13/11 o log mostra isso:
#
#   Tentando deploy com TOKEN_NETFLY...
#   Token falhou. Removendo NETLIFY_AUTH_TOKEN do env...
#   Deploy URL: http://eclectic-salamander-821ce9.netlify.app   ← site lixo
#
# Além de poluir a conta Netlify, o workflow escondia o motivo da falha: a
# saída do deploy ia para /tmp/deploy.log e só era grepado por uma URL, de
# modo que o erro real (secret ausente/inválido) nunca aparecia.
#
# O QUE ESTE GUARD FAZ
#
#   1. --allow-anonymous → BLOQUEIA. Publicar num site aleatório é pior do
#      que não publicar. O log fica explícito sobre o site que deveria
#      receber o deploy.
#   2. Sem --allow-anonymous → mostra no log da Actions se o token está
#      presente e repassa a saída do CLI (em vez de engolir em arquivo).
#      Se o token faltar ou for inválido, o erro aparece na hora.
#   3. Todo deploy passa a rodar em `netlify deploy` de verdade (o binário
#      global instalado pelo próprio workflow), sem alterar o resultado.
#
# COMO É INSTALADO
#
# O frontend/package.json tem um "postinstall" que chama este script com
# --install, criando frontend/node_modules/.bin/netlify. O `npx netlify`
# do workflow prefere o binário local — por isso o guard entra em ação
# sem precisar mexer no workflow (que exige permissão de escrita em
# .github/workflows/).
#
# O QUE AINDA PRECISA SER FEITO (pelo dono do repo)
#
#   secrets.TOKEN_NETFLY = <personal access token válido do Netlify>
#
# Alternativa melhor: conectar o site à Netlify ao repositório
# (Netlify → Site configuration → Build & deploy → Git). Aí a Netlify
# constrói e publica a cada push, sem token no GitHub.
# ============================================================================

set -uo pipefail

SITE_ID="7ba263f5-b5db-4874-8c0e-bc487a31c6d1"
SITE_NAME="ecuidar"

install_mode() {
  local self="$1"
  local target_dir="node_modules/.bin"
  local target="$target_dir/netlify"

  mkdir -p "$target_dir"
  cp "$self" "$target"
  chmod +x "$target"
  echo "guard de deploy instalado em $target"
}

# ── modo instalação (chamado pelo postinstall do frontend) ───────────────
if [[ "${1:-}" == "--install" ]]; then
  # O postinstall roda com cwd = frontend/
  self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  install_mode "$self"
  exit 0
fi

# ── modo execução (o `npx netlify` do workflow cai aqui) ─────────────────
#
# PROTEÇÃO CONTRA RECURSÃO — leia antes de mexer.
#
# O `npx` coloca o node_modules/.bin do projeto no PATH do processo que ele
# spawna, e é lá que este guard é instalado (node_modules/.bin/netlify).
# Chamar `netlify` por nome dentro do guard chamava o GUARD DE NOVO, numa
# recursão infinita: cada nível abria um watchdog (bash + sleep) e um
# netlify-cli. O resultado no runner era centenas de processos órfãos
# ("Terminate orphan process: bash / sleep"), o job morria com
# "Out of memory" e o fork do processo seguinte falhava com EAGAIN
# ("Resource temporarily unavailable"). Era a causa raiz de o deploy nunca
# publicar.
if [ -n "${NETLIFY_GUARD_ACTIVE:-}" ]; then
  echo "ERRO: o guard de deploy foi invocado recursivamente (NETLIFY_GUARD_ACTIVE já está definido)." >&2
  echo "   Isso significa que o guard está chamando a si mesmo em vez do netlify-cli real." >&2
  exit 1
fi
export NETLIFY_GUARD_ACTIVE=1

for arg in "$@"; do
  if [[ "$arg" == "--allow-anonymous" ]]; then
    echo "❌ Deploy anônimo BLOQUEADO pelo guard de deploy."
    echo "   Publicar sem token criaria um site novo e aleatório"
    echo "   (ex.: http://comfy-torte-9378b6.netlify.app) e o app real"
    echo "   continuaria no ar com a versão antiga."
    echo "   Site que deveria receber o deploy: $SITE_NAME (id $SITE_ID)"
    echo "   Causa do bloqueio: o deploy com token falhou logo acima."
    echo "   Configure o secret TOKEN_NETFLY no repositório ou conecte o"
    echo "   site ao GitHub na Netlify. Nada foi publicado."
    # A tentativa com token (que acabou de falhar) deixou o log em
    # /tmp/netlify-deploy.log — o workflow sobrescreve /tmp/deploy.log com a
    # tentativa anônima, então é daqui que a causa original sai.
    if [ -s /tmp/netlify-deploy.log ]; then
      echo ""
      echo "--- causa original (deploy com token) -------------------------"
      tail -n 25 /tmp/netlify-deploy.log
      echo "--------------------------------------------------------------"
    fi
    exit 1
  fi
done

if [[ -n "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  echo "→ token Netlify presente (${#NETLIFY_AUTH_TOKEN} caracteres)"
else
  echo "→ NENHUM NETLIFY_AUTH_TOKEN no ambiente: o deploy vai falhar."
  echo "  Configure o secret TOKEN_NETFLY no repositório."
fi
# Sem a URL completa de propósito: o workflow faz
#   grep -oP 'https://[a-z0-9-]+\.netlify\.app' /tmp/deploy.log
# e interpretaria esta linha como "deploy publicado" — mesmo sem ter
# publicado nada. O nome do site e o ID bastam para diagnóstico.

# A saída do CLI vai para um arquivo e depois é exibida no log da Actions
# (antes ela só ia para /tmp/deploy.log e era grepada por URL, escondendo o
# erro real).
#
# ⚠️ NÃO usar `| tee`: o `tee` das runners do GitHub (Ubuntu 26.04) é a
# reimplementação em Rust (uutils), que entra em panic com "2nd pipe should
# have enough spare" quando o leitor fecha o pipe — o SIGPIPE matava o
# netlify-cli no meio do deploy.
# ── nunca travar o workflow ─────────────────────────────────────────────
# Sem isto o passo "Deploy na Netlify" pode ficar in_progress por horas:
# o netlify-cli espera input interativo (link do site, confirmação) ou
# fica esperando a rede. E o grupo de concorrência do workflow tem
# `cancel-in-progress: true` — um deploy travado faz o PRÓXIMO deploy ser
# CANCELADO, e o site fica defasado em vários commits.
#
# Três defesas:
#   1. --non-interactive  → nunca pergunta nada
#   2. --no-telemetry     → não abre prompt de telemetria
#   3. timeout            → se travar, morre em DEPLOY_TIMEOUT_SEG
DEPLOY_TIMEOUT_SEG="${DEPLOY_TIMEOUT_SEG:-300}"

# ⚠️ `--site` SEMPRE explícito. Sem ele, se o token do secret estiver
# inválido (expirado), o CLI não consegue ler o site e cai no prompt
# interativo "This folder isn't linked to a project yet / What would you
# like to do?" — em CI não há TTY, então o passo fica in_progress POR
# HORAS (já aconteceu: um deploy ficou 33 minutos pendurado) e, como o
# grupo de concorrência tem `cancel-in-progress: true`, o deploy seguinte
# era cancelado e o site ficava defasado em vários commits.
#
# Com `--site`, o CLI vai direto à API: ou publica, ou falha na hora com
# "Unauthorized: could not retrieve project".
#
# ⚠️ `--non-interactive` e `--no-telemetry` NÃO existem no netlify-cli v27
# (erro: "unknown option") e faziam o deploy falhar sempre. A telemetria
# se desliga pela variável de ambiente NETLIFY_TELEMETRY_DISABLED.
# O netlify-cli real é o global (o workflow faz `npm install -g netlify-cli`).
# NÃO chamamos `netlify` pelo PATH: o PATH do `npx` tem o guard na frente
# (ver a proteção contra recursão acima).
netlify_bin=""
for candidato in \
  "$(npm prefix -g 2>/dev/null)/bin/netlify" \
  "$(npm root -g 2>/dev/null)/netlify-cli/bin/run.js" ; do
  if [ -x "$candidato" ]; then
    netlify_bin="$candidato"
    break
  fi
done
if [ -z "$netlify_bin" ]; then
  echo "ERRO: netlify-cli global não encontrado (npm install -g netlify-cli)." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────
# Resolve o site alvo pela API (e corrige o siteId obsoleto sozinho).
#
# O "Project not found" do CLI vinha do siteId guardado no
# .netlify/state.json: ele apontava para um site que a conta do token não
# enxerga (site recriado ou token de outra conta). Em vez de depender do
# arquivo, consultamos a API: /api/v1/user mostra com quem estamos
# autenticados e /api/v1/sites lista os sites dessa conta.
#
# Se o siteId configurado não estiver na lista, procuramos pelo nome
# (ecuidar) e usamos o id encontrado — assim o deploy se corrige sozinho.
# ─────────────────────────────────────────────────────────────────────────
resolver_site() {
  local token="$1" id nome alvo
  local user_json sites_json

  user_json=$(curl -s -m 20 -H "Authorization: Bearer $token" \
    "https://api.netlify.com/api/v1/user" 2>/dev/null || true)

  if echo "$user_json" | grep -q '"id"'; then
    echo "→ token autenticado como: $(echo "$user_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("email") or d.get("slug") or d.get("id"))' 2>/dev/null || echo "?")"
  else
    echo "→ API: o token NÃO foi aceito (401). O secret TOKEN_NETFLY está ausente, expirado ou é de outra conta."
    return 1
  fi

  sites_json=$(curl -s -m 30 -H "Authorization: Bearer $token" \
    "https://api.netlify.com/api/v1/sites?per_page=100" 2>/dev/null || true)

  if ! echo "$sites_json" | grep -q '"id"'; then
    echo "→ API: não foi possível listar os sites (usando o siteId do state.json)"
    return 0
  fi

  alvo=$(echo "$sites_json" | python3 -c '
import json, sys
sites = json.load(sys.stdin)
alvo = sys.argv[1]; nome = sys.argv[2]
achei = None
for s in sites:
    if s.get("id") == alvo:
        achei = s
        break
if not achei:
    for s in sites:
        if (s.get("name") or "").lower() == nome.lower() or (s.get("ssl_url") or "").lower().startswith("https://" + nome.lower()):
            achei = s
            break
if achei:
    print(achei["id"], (achei.get("name") or "")[:40])
else:
    print("NONE", "")
' "$SITE_ID" "$SITE_NAME" 2>/dev/null || echo "NONE ")

  id=$(echo "$alvo" | awk '{print $1}')
  nome=$(echo "$alvo" | cut -d' ' -f2-)

  if [ "$id" = "NONE" ] || [ -z "$id" ]; then
    echo "→ API: o site '$SITE_NAME' ($SITE_ID) não está na conta do token."
    echo "   Sites visíveis: $(echo "$sites_json" | python3 -c 'import json,sys; print(", ".join((s.get("name") or "?")+" ("+(s.get("id") or "")[:8]+")" for s in json.load(sys.stdin)[:12]) or "nenhum")' 2>/dev/null)"
    return 1
  fi

  if [ "$id" != "$SITE_ID" ]; then
    echo "→ siteId do state.json obsoleto — usando o id real da API: $id ($nome)"
  fi
  SITE_ID="$id"
  [ -n "$nome" ] && SITE_NAME="$nome"
  return 0
}

if [ -n "${NETLIFY_AUTH_TOKEN:-}" ]; then
  if ! resolver_site "$NETLIFY_AUTH_TOKEN"; then
    echo "ERRO: não foi possível resolver o site alvo — nada foi publicado." >&2
    exit 1
  fi
fi

cmd=("$netlify_bin" "$@")

echo "→ site alvo: ${SITE_NAME} (id ${SITE_ID})"
echo "→ cli: $netlify_bin"
echo "→ executando: ${netlify_bin} $* --site ${SITE_ID}"
tem_site_explicito=0
for arg in "$@"; do
  case "$arg" in
    --site|--site=*|--create-site|--site-name) tem_site_explicito=1 ;;
  esac
done
if [ "$tem_site_explicito" -eq 0 ]; then
  cmd+=(--site "$SITE_ID")
fi

# ⚠️ SEM `timeout`: nas runners do GitHub (Ubuntu 26.04) o `timeout` é a
# reimplementação em Rust (uutils) e falha ao spawnar o processo com
# "failed to execute process: Resource temporarily unavailable (os error 11)"
# — o deploy nem começava. O mesmo happened com o `tee` (panic). Por isso
# aqui o watchdog é feito em bash puro: o CLI roda em background e um
# temporizador em background mata o grupo de processos se ele passar do
# prazo.
# Limita o heap do Node do netlify-cli. O runner de repositório público
# tem 7 GB e o job já usou o build do Vite, o tsc, o check pré-deploy e o
# `npm install -g netlify-cli` (1188 pacotes) antes de chegar aqui: sem o
# limite, o V8 do CLI crescia até o cgroup matar o processo ("Out of
# memory" na anotação da run).
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"

# Devolve memória ao sistema antes de subir o CLI (o page cache dos npm/
# node_modules conta no limite do cgroup). Best-effort: sem sudo, segue.
sync 2>/dev/null || true
sudo -n sh -c "echo 3 > /proc/sys/vm/drop_caches" 2>/dev/null || true

NETLIFY_TELEMETRY_DISABLED=1 "${cmd[@]}" > /tmp/netlify-deploy.log 2>&1 &
cli_pid=$!

# O watchdog redireciona a saída: se herdar o stdout do wrapper, ele segura
# o pipe aberto e quem lê a saída (ex.: `| tail`) fica esperando até o
# sleep terminar.
# `exec` faz o subshell VIRAR o sleep: assim $watchdog_pid é o PID do sleep
# e o `kill` realmente o encerra (sem exec, o sleep ficava órfão).
( exec sleep "$DEPLOY_TIMEOUT_SEG"; kill -TERM "$cli_pid" 2>/dev/null ) > /dev/null 2>&1 &
watchdog_pid=$!

wait "$cli_pid"
rc=$?

kill "$watchdog_pid" 2>/dev/null
wait "$watchdog_pid" 2>/dev/null
# Garante que nenhum filho do netlify-cli sobreviva (eles segurariam o
# stdout do passo e o runner os mataria como órfãos no fim).
kill -- -"$cli_pid" 2>/dev/null || true
if [ "$rc" -eq 143 ] || [ "$rc" -eq 124 ]; then
  echo "❌ netlify-cli excedeu ${DEPLOY_TIMEOUT_SEG}s e foi interrompido."
  echo "   O passo seria travado indefinidamente (e cancelaria o próximo"
  echo "   deploy por causa do concurrency: cancel-in-progress)."
  echo "--- últimas linhas do log ----------------------------------------"
  tail -20 /tmp/netlify-deploy.log
  echo "------------------------------------------------------------------"
  rc=1
fi
# Sanitiza a saída antes de mostrá-la. O workflow faz
#   grep -oP 'https://[a-z0-9-]+\.netlify\.app' /tmp/deploy.log
# e, se o arquivo tiver bytes de controle (as barras de progresso do CLI
# escrevem ANSI), o grep responde "binary file matches" e a URL do deploy
# se perde — o resumo saía com "Deploy URL:" vazio mesmo com o deploy
# tendo sido publicado.
sed -i -e 's/\x1B\[[0-9;?]*[a-zA-Z]//g' -e 's/[^\x20-\x7E\t]//g' \
  /tmp/netlify-deploy.log 2>/dev/null || true

if [ "$rc" -eq 0 ]; then
  echo "DEPLOY_RESULT=sucesso"
else
  echo "DEPLOY_RESULT=falha (código $rc)"
fi
tail -n 60 /tmp/netlify-deploy.log
exit "$rc"
