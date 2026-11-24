#!/usr/bin/env bash
# Installs the Nova Poshta order-status sync (scripts/ops/np-sync.sh) into the
# current user's crontab. Default: every 2 hours, 8:00–22:00.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/ops/np-sync.sh"
LOG_PATH="${NP_SYNC_LOG:-/var/log/partson-np-sync.log}"
SCHEDULE="${NP_SYNC_CRON_SCHEDULE:-17 8-22/2 * * *}"
BEGIN_MARKER="# BEGIN partson np sync"
END_MARKER="# END partson np sync"

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
  printf '%s /bin/bash "%s" >> "%s" 2>&1\n' "$SCHEDULE" "$SCRIPT_PATH" "$LOG_PATH"
  echo "$END_MARKER"
} > "$TMP_FILE"

crontab "$TMP_FILE"
echo "Installed Nova Poshta sync cron:"
printf '%s /bin/bash "%s" >> "%s" 2>&1\n' "$SCHEDULE" "$SCRIPT_PATH" "$LOG_PATH"
