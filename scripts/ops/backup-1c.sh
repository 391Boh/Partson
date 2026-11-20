#!/bin/bash
# Weekly copy of the 1C file infobase (installed as /usr/local/bin/partson-1c-backup.sh,
# cron Sun 04:30, see install-server-health-cron.sh). 1C runs inside Apache in
# file mode, so a consistent copy needs Apache stopped for the ~10 s the copy
# takes; the site keeps serving its caches meanwhile. The daily 03:10 cron keeps
# the two newest 1Cv8.1CD.bak.* files. Before 2026-11-20 the newest copy was
# 19 days old when 1C reported a damaged temp file.
set -euo pipefail

DB=/var/1c/bases/partson/1Cv8.1CD
TARGET="$DB.bak.$(date +%Y-%m-%d_%H-%M-%S)"
LOG=/var/log/partson-1c-backup.log

size=$(stat -c %s "$DB")
free=$(( $(df --output=avail -B1 /var/1c | tail -1) ))
if [ "$free" -lt $(( size + 2 * 1024 * 1024 * 1024 )) ]; then
  echo "$(date -Is) SKIP: $((free / 1048576)) MB free, need copy + 2 GB headroom" >> "$LOG"
  exit 1
fi

started=$(date +%s)
systemctl stop apache2
trap 'systemctl start apache2' EXIT
cp --preserve=mode,ownership,timestamps "$DB" "$TARGET"
# Compared while 1C is still stopped: once Apache is back, 1C writes to $DB.
ok=0
cmp -s "$DB" "$TARGET" && ok=1
systemctl start apache2
trap - EXIT

if [ "$ok" -eq 1 ]; then
  echo "$(date -Is) OK $TARGET ($((size / 1048576)) MB, Apache down $(( $(date +%s) - started )) s)" >> "$LOG"
else
  echo "$(date -Is) FAILED: copy differs from $DB" >> "$LOG"
  exit 1
fi
