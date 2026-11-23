#!/usr/bin/env bash
# Daily: send pages whose sitemap <lastmod> changed in the last 26 h to
# IndexNow (Bing, Yandex, Seznam…). Cron: 30 6 * * * bash <release>/scripts/indexnow-daily.sh
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT_DIR/logs"
exec >>"$ROOT_DIR/logs/indexnow.log" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S')"
cd "$ROOT_DIR"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
LIST="$(mktemp)"; trap 'rm -f "$LIST"' EXIT
node scripts/collect-changed-urls.mjs --hours "${INDEXNOW_HOURS:-26}" > "$LIST"
COUNT=$(grep -c . "$LIST" || true)
[ "$COUNT" -gt 0 ] || { echo "Нічого не змінилось"; exit 0; }
head -n 10000 "$LIST" > "$LIST.cut" && mv "$LIST.cut" "$LIST"
npm run -s indexnow:submit -- --file "$LIST"
