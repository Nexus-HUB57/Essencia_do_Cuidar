#!/usr/bin/env bash
#
# scripts/cron-candidatura-cleanup.sh
#
# Cron job para expiração automática de candidaturas pendentes há mais de
# CANDIDATURA_EXPIRA_DIAS (default 30).
#
# Uso (crontab -e):
#   0 3 * * * /path/to/Essencia_do_Cuidar/scripts/cron-candidatura-cleanup.sh >> /var/log/essencia-cron.log 2>&1
#
# Ou manualmente:
#   bash scripts/cron-candidatura-cleanup.sh

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
ADMIN_TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN deve estar setado. Gere via /api/auth/login com conta admin.}"

echo "[$(date -Iseconds)] Iniciando expiração de candidaturas antigas em $BACKEND_URL..."

RESP=$(curl -sS -X POST "$BACKEND_URL/api/admin/candidaturas/limpar-expiradas" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "[$(date -Iseconds)] Resposta: $RESP"

OK=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
if [ "$OK" = "True" ]; then
  EXPIRADAS=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('expiradas', 0))" 2>/dev/null || echo 0)
  NOTIFICADAS=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('notificadas', 0))" 2>/dev/null || echo 0)
  echo "[$(date -Iseconds)] ✓ expiradas=$EXPIRADAS notificadas=$NOTIFICADAS"
  exit 0
else
  echo "[$(date -Iseconds)] ✗ Falha ao expirar candidaturas"
  exit 1
fi
