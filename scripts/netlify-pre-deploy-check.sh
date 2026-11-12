#!/usr/bin/env bash
#
# scripts/netlify-pre-deploy-check.sh
#
# Validação pré-deploy para Netlify. Roda antes de `netlify deploy --prod`
# para garantir que tudo está 100% pronto.
#
# Uso:
#   bash scripts/netlify-pre-deploy-check.sh
#   # ou apontando para URL pública após deploy:
#   SITE_URL=https://meu-site.netlify.app bash scripts/netlify-pre-deploy-check.sh

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
WARN=0

green()  { echo -e "  \033[0;32m✓\033[0m $1"; PASS=$((PASS+1)); }
red()    { echo -e "  \033[0;31m✗\033[0m $1"; FAIL=$((FAIL+1)); }
yellow() { echo -e "  \033[1;33m⚠\033[0m $1"; WARN=$((WARN+1)); }
info()   { echo -e "  \033[0;34mℹ\033[0m $1"; }

# O script usa caminhos relativos ao repo (netlify.toml, frontend/...). Sem
# este cd, rodando de fora da raiz o TOML não era encontrado e a validação
# falhava (ou era pulada) silenciosamente.
cd "$ROOT_DIR"

echo "============================================================"
echo "  Essência do Cuidar — Validação pré-deploy Netlify"
echo "============================================================"
echo ""

# ───────────────────────────────────────────────────────────────────
# 1. Verificar arquivos de configuração
# ───────────────────────────────────────────────────────────────────
echo "› 1. Arquivos de configuração Netlify:"
echo ""

[ -f "$ROOT_DIR/netlify.toml" ] && green "netlify.toml presente" || red "netlify.toml ausente"
[ -f "$ROOT_DIR/frontend/public/_redirects" ] && green "frontend/public/_redirects presente" || red "_redirects ausente"
[ -f "$ROOT_DIR/frontend/public/_headers" ] && green "frontend/public/_headers presente" || red "_headers ausente"
[ -f "$ROOT_DIR/frontend/vite.config.ts" ] && green "frontend/vite.config.ts presente" || red "vite.config.ts ausente"
[ -f "$ROOT_DIR/frontend/package.json" ] && green "frontend/package.json presente" || red "package.json ausente"
[ -f "$ROOT_DIR/frontend/package-lock.json" ] && green "frontend/package-lock.json presente (npm ci disponível)" || yellow "package-lock.json ausente (npm install em vez de npm ci)"

# ───────────────────────────────────────────────────────────────────
# 2. Validar sintaxe do netlify.toml (TOML)
# ───────────────────────────────────────────────────────────────────
echo ""
echo "› 2. Validar netlify.toml (sintaxe TOML):"
echo ""

python3 << 'PYEOF' || red "netlify.toml inválido"
import sys

try:
    import tomllib
except ImportError:
    print('  \033[1;33m⚠\033[0m tomllib indisponível (Python < 3.11) — pulando validação TOML')
    sys.exit(0)

# Cores em variáveis: backslash dentro da expressão de um f-string é
# SyntaxError em todas as versões do Python suportadas.
OK = '\033[0;32m✓\033[0m'
NG = '\033[0;31m✗\033[0m'

falhas = []

def check(cond, msg):
    print(f'  {OK if cond else NG} {msg}')
    if not cond:
        falhas.append(msg)

try:
    with open('netlify.toml', 'rb') as f:
        d = tomllib.load(f)
except Exception as e:
    print(f'  {NG} netlify.toml não pôde ser lido: {e}')
    sys.exit(1)

print(f'  {OK} netlify.toml é TOML válido')
b = d.get('build', {})
print(f'  {OK} base={b.get("base")}, publish={b.get("publish")}, command={b.get("command")}')
env = b.get('build', {}).get('environment', {})
print(f'  {OK} NODE_VERSION={env.get("NODE_VERSION")}, VITE_API_URL={env.get("VITE_API_URL")}')

redirects = d.get('redirects', [])
print(f'  {OK} {len(redirects)} redirects:')
for r in redirects:
    print(f'    {r.get("from")} → {r.get("to")} (status={r.get("status")}, force={r.get("force")})')

headers = d.get('headers', [])
print(f'  {OK} {len(headers)} header rules')

# Posição de cada regra — o catch-all "/*" precisa vir DEPOIS das específicas,
# senão ele engole /api/*, /uploads/* e /socket.io/*.
pos = {}
for i, r in enumerate(redirects):
    pos.setdefault(r.get('from'), i)

check(pos.get('/api/*') is not None, 'proxy /api/*')
check(pos.get('/uploads/*') is not None, 'proxy /uploads/*')
check(pos.get('/socket.io/*') is not None, 'proxy /socket.io/*')
check(
    any(r.get('from') == '/*' and r.get('to') == '/index.html' for r in redirects),
    'SPA fallback /*'
)

catch_all = pos.get('/*')
if catch_all is not None:
    for especifica in ('/api/*', '/uploads/*', '/socket.io/*'):
        i = pos.get(especifica)
        if i is not None:
            check(i < catch_all, f'ordem: {especifica} vem antes do catch-all /*')

if falhas:
    print(f'  {NG} {len(falhas)} verificação(ões) de redirect falharam')
    sys.exit(1)
PYEOF

# ───────────────────────────────────────────────────────────────────
# 3. Build do frontend
# ───────────────────────────────────────────────────────────────────
echo ""
echo "› 3. Build do frontend (npm run build em frontend/):"
echo ""

cd "$ROOT_DIR/frontend"
if npm run build > /tmp/build.log 2>&1; then
  green "Build OK"
  if [ -f dist/index.html ]; then
    SIZE=$(wc -c < dist/index.html)
    green "dist/index.html presente ($SIZE bytes)"
  else
    red "dist/index.html ausente"
  fi
  if [ -f dist/_redirects ]; then
    green "dist/_redirects copiado do public/"
  else
    red "dist/_redirects ausente — Vite não copiou de public/"
  fi
  if [ -f dist/_headers ]; then
    green "dist/_headers copiado do public/"
  else
    red "dist/_headers ausente"
  fi
  if [ -f dist/sw.js ]; then
    green "dist/sw.js (service worker PWA) presente"
  else
    yellow "dist/sw.js ausente (PWA pode não funcionar offline)"
  fi
  if [ -f dist/manifest.webmanifest ]; then
    green "dist/manifest.webmanifest presente"
  else
    red "dist/manifest.webmanifest ausente"
  fi
  # Conta imagens da marca
  if [ -d dist/img ]; then
    N_IMG=$(ls dist/img/*.jpg 2>/dev/null | wc -l)
    if [ "$N_IMG" -ge 7 ]; then
      green "$N_IMG imagens da marca presentes em dist/img/"
    else
      yellow "Apenas $N_IMG imagens em dist/img/ (esperado 7)"
    fi
  else
    red "dist/img/ ausente — imagens da marca não foram copiadas"
  fi
else
  red "Build falhou"
  tail -20 /tmp/build.log
fi

# ───────────────────────────────────────────────────────────────────
# 4. Verificar arquivos da marca (git ls-files)
# ───────────────────────────────────────────────────────────────────
echo ""
echo "› 4. Arquivos da marca commitados no git:"
echo ""

cd "$ROOT_DIR"
IMGS_COMMIT=$(git ls-files frontend/public/img/ 2>/dev/null | wc -l)
if [ "$IMGS_COMMIT" -ge 7 ]; then
  green "$IMGS_COMMIT imagens da marca commitadas"
else
  yellow "Apenas $IMGS_COMMIT imagens da marca commitadas (esperado 7+)"
fi

# ───────────────────────────────────────────────────────────────────
# 5. Testar URL pública (se SITE_URL fornecido)
# ───────────────────────────────────────────────────────────────────
if [ -n "${SITE_URL:-}" ]; then
  echo ""
  echo "› 5. Testar URL pública: $SITE_URL"
  echo ""

  CODE_HOME=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL")
  if [ "$CODE_HOME" = "200" ]; then
    green "GET / → 200"
  else
    red "GET / → $CODE_HOME (esperado 200)"
  fi

  for img in logo capa-trabalhamos sobre-nasceu servicos processo agenda-aberta cta-cuidado; do
    CODE_IMG=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/img/$img.jpg")
    if [ "$CODE_IMG" = "200" ]; then
      green "GET /img/$img.jpg → 200"
    else
      red "GET /img/$img.jpg → $CODE_IMG"
    fi
  done

  CODE_MANIFEST=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/manifest.webmanifest")
  [ "$CODE_MANIFEST" = "200" ] && green "GET /manifest.webmanifest → 200" || red "manifest → $CODE_MANIFEST"

  CODE_SW=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/sw.js")
  [ "$CODE_SW" = "200" ] && green "GET /sw.js → 200" || red "sw.js → $CODE_SW"

  # SPA fallback
  CODE_SPA=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/rota-inexistente")
  [ "$CODE_SPA" = "200" ] && green "GET /rota-inexistente → 200 (SPA fallback OK)" || red "rota-inexistente → $CODE_SPA"

  # Headers de segurança
  echo ""
  echo "  Headers de segurança (curl -I):"
  curl -s -I "$SITE_URL" | grep -iE "X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security|Referrer-Policy|Content-Security-Policy|Permissions-Policy" | while read line; do
    echo "    $line"
  done

  # API health (precisa backend rodando no host do proxy)
  echo ""
  echo "  API healthcheck (precisa backend rodando no host do proxy):"
  # Guarda o corpo também: o status sozinho não distingue "não é o nosso
  # backend" de "o backend está fora do ar".
  #   - 200            → backend OK
  #   - 502/504        → backend offline (Render free dorme) ou host errado
  #   - 404 + corpo    → o host responde, mas NÃO é a nossa API: o proxy
  #                      aponta para outro serviço (deploy errado, branch
  #                      errada ou serviço placeholder). Erro de CONFIGURAÇÃO.
  #   - 404 + HTML     → idem: Express serviu o 404 padrão dele
  API_BODY=$(mktemp)
  CODE_API=$(curl -s -o "$API_BODY" -w "%{http_code}" -m 20 "$SITE_URL/api/health")
  if [ "$CODE_API" = "200" ]; then
    green "GET /api/health → 200 (backend OK)"
  elif [ "$CODE_API" = "502" ] || [ "$CODE_API" = "504" ]; then
    yellow "GET /api/health → $CODE_API (backend offline ou host errado no netlify.toml)"
  elif [ "$CODE_API" = "404" ]; then
    # O host responde, mas não é a nossa API — isso é configuration bug,
    # não indisponibilidade. Vale um aviso explícito.
    if grep -q "Rota não encontrada" "$API_BODY" 2>/dev/null; then
      yellow "GET /api/health → 404 (a API responde, mas sem a rota /api/health — backend em versão desatualizada)"
    else
      yellow "GET /api/health → 404 e o corpo NÃO é a nossa API — o host do proxy está servindo outro serviço. Confira o host em netlify.toml (bloco [[redirects]]) e se o deploy do backend saiu do branch certo."
    fi
  else
    yellow "GET /api/health → $CODE_API (verifique proxy/redirect no netlify.toml)"
  fi
  rm -f "$API_BODY"
fi

# ───────────────────────────────────────────────────────────────────
# Resumo
# ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Resultado: $PASS ✓ / $FAIL ✗ / $WARN ⚠"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "❌ Há $FAIL falha(s) crítica(s). Corrija antes do deploy."
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo ""
  echo "⚠ $WARN aviso(s) não críticos. Deploy pode prosseguir."
  exit 0
else
  echo ""
  echo "✅ Tudo OK — pronto para deploy na Netlify!"
  echo ""
  echo "Próximos passos:"
  echo "  1. git push origin main  # dispara deploy automático"
  echo "  2. ou: netlify deploy --prod  # deploy manual via CLI"
  echo "  3. Aguardar 1-3 min e acessar https://<seu-site>.netlify.app"
  exit 0
fi
