#!/usr/bin/env bash
# Installs (or replaces) the cron job that keeps .next/server/route-cache of
# the active release within budget (scripts/prune-route-cache.mjs).
# Idempotent: the block between the markers is replaced, never duplicated.
# A backup of the previous crontab is written first and the diff is printed.
#
#   APP_DIR=/var/www/<active-release> scripts/ops/install-route-cache-prune-cron.sh
# Options (env): SCHEDULE ("*/15 * * * *"), MAX_MB (600), MAX_AGE_HOURS (48),
#   BACKUP_DIR (/root), CRONTAB_FILE (operate on this file instead of the real
#   crontab — for testing), REMOVE=1 (only remove the block).
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
SCHEDULE="${SCHEDULE:-*/15 * * * *}"
MAX_MB="${MAX_MB:-600}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"
BACKUP_DIR="${BACKUP_DIR:-/root}"
BEGIN="# BEGIN partson route-cache prune"
END="# END partson route-cache prune"

[ -f "$APP_DIR/scripts/prune-route-cache.mjs" ] || { echo "STOP: $APP_DIR/scripts/prune-route-cache.mjs not found"; exit 1; }
[ -d "$APP_DIR/.next/server" ] || { echo "STOP: $APP_DIR/.next/server not found (not a built release)"; exit 1; }
NODE_BIN="$(command -v node)" || { echo "STOP: node not found"; exit 1; }
FLOCK_BIN="$(command -v flock || true)"

read_tab() { if [ -n "${CRONTAB_FILE:-}" ]; then cat "$CRONTAB_FILE" 2>/dev/null || true; else crontab -l 2>/dev/null || true; fi; }
write_tab() { if [ -n "${CRONTAB_FILE:-}" ]; then cat > "$CRONTAB_FILE"; else crontab -; fi; }

CURRENT="$(read_tab)"
BEGIN_COUNT="$(printf '%s\n' "$CURRENT" | grep -cxF "$BEGIN" || true)"
END_COUNT="$(printf '%s\n' "$CURRENT" | grep -cxF "$END" || true)"
[ "$BEGIN_COUNT" = "$END_COUNT" ] && [ "$BEGIN_COUNT" -le 1 ] || {
  echo "STOP: crontab has $BEGIN_COUNT begin / $END_COUNT end markers — fix manually"; exit 1; }

mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/crontab-backup-$(date +%Y%m%d-%H%M%S).txt"
printf '%s\n' "$CURRENT" > "$BACKUP"
echo "backup: $BACKUP"

WITHOUT_BLOCK="$(printf '%s\n' "$CURRENT" | awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1;next} $0==e{skip=0;next} !skip')"
LOCK_PREFIX=""
[ -n "$FLOCK_BIN" ] && LOCK_PREFIX="$FLOCK_BIN -n $APP_DIR/logs/route-cache-prune.flock "
JOB="$SCHEDULE cd $APP_DIR && mkdir -p logs && ${LOCK_PREFIX}$NODE_BIN scripts/prune-route-cache.mjs --max-mb $MAX_MB --max-age-hours $MAX_AGE_HOURS >> logs/route-cache-prune.log 2>&1"

# Lines outside the block are written back exactly as read (command
# substitution only drops trailing newlines at the very end of the crontab).
if [ "${REMOVE:-0}" = 1 ]; then
  NEW="$WITHOUT_BLOCK"
elif [ -z "$WITHOUT_BLOCK" ]; then
  NEW="$(printf '%s\n%s\n%s' "$BEGIN" "$JOB" "$END")"
else
  NEW="$(printf '%s\n%s\n%s\n%s' "$WITHOUT_BLOCK" "$BEGIN" "$JOB" "$END")"
fi
printf '%s\n' "$NEW" | write_tab

AFTER="$(read_tab)"
echo "--- diff (backup -> installed)"
diff <(printf '%s\n' "$CURRENT") <(printf '%s\n' "$AFTER") || true
COUNT="$(printf '%s\n' "$AFTER" | grep -cxF "$BEGIN" || true)"
if [ "${REMOVE:-0}" = 1 ]; then
  [ "$COUNT" = 0 ] || { echo "STOP: block still present"; exit 1; }
else
  [ "$COUNT" = 1 ] || { echo "STOP: expected exactly one block, found $COUNT"; exit 1; }
  printf '%s\n' "$AFTER" | grep -qxF "$JOB" || { echo "STOP: job line not installed as expected"; exit 1; }
fi
if [ "${REMOVE:-0}" = 1 ]; then ACTION=removed; else ACTION=installed; fi
echo "ok: route-cache prune cron $ACTION for $APP_DIR"
