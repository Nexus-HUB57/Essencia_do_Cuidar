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
    with open('netlify.toml', 'rb') as f:
        d = tomllib.load(f)
    print('  \033[0;32m✓\033[0m netlify.toml é TOML válido')
    b = d.get('build', {})
    print(f'  \033[0;32m✓\033[0m base={b.get("base")}, publish={b.get("publish")}, command={b.get("command")}')
    env = d.get('build', {}).get('environment', {})
    print(f'  \033[0;32m✓\033[0m NODE_VERSION={env.get("NODE_VERSION")}, VITE_API_URL={env.get("VITE_API_URL")}')
    redirects = d.get('redirects', [])
    print(f'  \033[0;32m✓\033[0m {len(redirects)} redirects:')
    for r in redirects:
        print(f'    {r.get("from")} → {r.get("to")} (status={r.get("status")}, force={r.get("force")})')
    headers = d.get('headers', [])
    print(f'  \033[0;32m✓\033[0m {len(headers)} header rules')
    # Verifica redirects obrigatórios
    has_api = any(r.get('from') == '/api/*' for r in redirects)
    has_uploads = any(r.get('from') == '/uploads/*' for r in redirects)
    has_socketio = any(r.get('from') == '/socket.io/*' for r in redirects)
    has_spa = any(r.get('from') == '/*' and r.get('to') == '/index.html' for r in redirects)
    print(f'  {"\033[0;32m✓\033[0m" if has_api else "\033[0;31m✗\033[0m"} proxy /api/*')
    print(f'  {"\033[0;32m✓\033[0m" if has_uploads else "\033[0;31m✗\033[0m"} proxy /uploads/*')
    print(f'  {"\033[0;32m✓\033[0m" if has_socketio else "\033[0;31m✗\033[0m"} proxy /socket.io/*')
    print(f'  {"\033[0;32m✓\033[0m" if has_spa else "\033[0;31m✗\033[0m"} SPA fallback /*')
except ImportError:
    print('  \033[1;33m⚠\033[0m tomllib indisponível (Python < 3.11) — pulando validação TOML')
    sys.exit(0)
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
  CODE_API=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/api/health")
  if [ "$CODE_API" = "200" ]; then
    green "GET /api/health → 200 (backend OK)"
  elif [ "$CODE_API" = "502" ] || [ "$CODE_API" = "504" ]; then
    yellow "GET /api/health → $CODE_API (backend offline ou host errado no netlify.toml)"
  else
    yellow "GET /api/health → $CODE_API (verifique proxy/redirect no netlify.toml)"
  fi
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
