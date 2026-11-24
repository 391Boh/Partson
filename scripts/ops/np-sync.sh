#!/usr/bin/env bash
# Pulls Nova Poshta TTN statuses into open orders (shipped → arrived →
# completed / returned) via /api/admin/orders/np-sync. Needs CRON_SECRET in
# .env.local (or the environment); the app must be running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_URL="${NP_SYNC_URL:-http://127.0.0.1:${PORT:-3000}}"

if [ -z "${CRON_SECRET:-}" ] && [ -f "$ROOT_DIR/.env.local" ]; then
  CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ROOT_DIR/.env.local" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
fi
if [ -z "${CRON_SECRET:-}" ]; then
  echo "$(date -Iseconds) np-sync: CRON_SECRET is not set" >&2
  exit 1
fi

curl -fsS -m 120 -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/admin/orders/np-sync" \
  | sed "s/^/$(date -Iseconds) /"
echo
