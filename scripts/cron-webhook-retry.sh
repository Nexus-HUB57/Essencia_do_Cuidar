#!/usr/bin/env bash
#
# scripts/cron-webhook-retry.sh
#
# Cron job para retry de webhooks com falha.
# Reenvia webhook_logs com erro != null ou status >= 500 nas últimas 24h.
#
# Uso (crontab -e):
#   */30 * * * * /path/to/Essencia_do_Cuidar/scripts/cron-webhook-retry.sh >> /var/log/essencia-cron.log 2>&1
#
# Ou manualmente:
#   bash scripts/cron-webhook-retry.sh
#
# Env vars necessárias:
#   BACKEND_URL      — URL do backend (default: http://localhost:4000)
#   ADMIN_TOKEN      — JWT de admin (para autenticar no endpoint)
#                     gerar: curl -X POST $BACKEND_URL/api/auth/login \
#                             -H "Content-Type: application/json" \
#                             -d '{"email":"admin@demo.com","senha":"admin1234"}'

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
ADMIN_TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN deve estar setado. Gere via /api/auth/login com conta admin.}"

echo "[$(date -Iseconds)] Iniciando retry de webhooks em $BACKEND_URL..."

RESP=$(curl -sS -X POST "$BACKEND_URL/api/admin/webhooks/retry" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "[$(date -Iseconds)] Resposta: $RESP"

# Verifica sucesso
OK=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
if [ "$OK" = "True" ]; then
  TENTADOS=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('tentados', 0))" 2>/dev/null || echo 0)
  SUCESSO=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('sucesso', 0))" 2>/dev/null || echo 0)
  FALHA=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('falha', 0))" 2>/dev/null || echo 0)
  echo "[$(date -Iseconds)] ✓ tentados=$TENTADOS sucesso=$SUCESSO falha=$FALHA"
  exit 0
else
  echo "[$(date -Iseconds)] ✗ Falha ao executar retry"
  exit 1
fi
