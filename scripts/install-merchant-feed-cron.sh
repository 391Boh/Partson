#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/update-merchant-feed.sh"
SCHEDULE="${MERCHANT_FEED_CRON_SCHEDULE:-0 4 * * *}"
BEGIN_MARKER="# BEGIN partson merchant feed"
END_MARKER="# END partson merchant feed"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Cannot find update script: $SCRIPT_PATH" >&2
  exit 1
fi

chmod +x "$SCRIPT_PATH"

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

{
  crontab -l 2>/dev/null | awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
    $0 == begin { skip = 1; next }
    $0 == end { skip = 0; next }
    skip != 1 { print }
  '
  echo "$BEGIN_MARKER"
  printf '%s /bin/bash "%s"\n' "$SCHEDULE" "$SCRIPT_PATH"
  echo "$END_MARKER"
} > "$TMP_FILE"

crontab "$TMP_FILE"

echo "Installed merchant feed cron:"
printf '%s /bin/bash "%s"\n' "$SCHEDULE" "$SCRIPT_PATH"
