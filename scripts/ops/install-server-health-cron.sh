#!/bin/bash
# Installs scripts/ops/server-health.sh (every 5 minutes) and
# scripts/ops/backup-1c.sh (Sundays 04:30) into /usr/local/bin and root's crontab. Run on the server as root:
#   bash scripts/ops/install-server-health-cron.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
install -m 0755 "$ROOT_DIR/scripts/ops/server-health.sh" /usr/local/bin/partson-health.sh
install -m 0755 "$ROOT_DIR/scripts/ops/backup-1c.sh" /usr/local/bin/partson-1c-backup.sh

BEGIN="# BEGIN partson health"
END="# END partson health"
current="$(crontab -l 2>/dev/null || true)"
cleaned="$(printf '%s\n' "$current" | sed "/^$BEGIN\$/,/^$END\$/d")"
printf '%s\n%s\n%s\n%s\n%s\n' "$cleaned" "$BEGIN" "*/5 * * * * /bin/bash /usr/local/bin/partson-health.sh" "30 4 * * 0 /bin/bash /usr/local/bin/partson-1c-backup.sh" "$END" | grep -v '^$' | crontab -
crontab -l | sed -n "/^$BEGIN\$/,/^$END\$/p"
