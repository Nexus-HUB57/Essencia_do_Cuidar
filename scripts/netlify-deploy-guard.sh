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
    if [[ -s /tmp/netlify-deploy.log ]]; then
      echo ""
      echo "--- causa original (deploy com token) -------------------------"
      tail -25 /tmp/netlify-deploy.log
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
echo "→ site alvo: ${SITE_NAME} (id ${SITE_ID})"
echo "→ executando: netlify $*"

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
timeout --foreground "$DEPLOY_TIMEOUT_SEG" \
  netlify --non-interactive --no-telemetry "$@" > /tmp/netlify-deploy.log 2>&1
rc=$?
if [ "$rc" -eq 124 ]; then
  echo "❌ netlify-cli excedeu ${DEPLOY_TIMEOUT_SEG}s e foi interrompido."
  echo "   O passo seria travado indefinidamente (e cancelaria o próximo"
  echo "   deploy por causa do concurrency: cancel-in-progress)."
  echo "--- últimas linhas do log ----------------------------------------"
  tail -20 /tmp/netlify-deploy.log
  echo "------------------------------------------------------------------"
  rc=1
fi
cat /tmp/netlify-deploy.log
exit "$rc"
