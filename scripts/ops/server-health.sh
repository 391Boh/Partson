#!/bin/bash
# PartsON server health check, every 5 minutes from cron (installed as
# /usr/local/bin/partson-health.sh by scripts/ops/install-server-health-cron.sh).
#
# Writes one line to /var/log/partson-health.log: disk, RAM, swap, the
# Next.js process (RSS, uptime, PM2 restarts) and 1C answers of the last
# 5 minutes from Apache's log. Two guarded repairs, both from the 2026-11-20
# incident (V8 OOM core dumps filled the disk, then 1C answered HTTP 500 to
# ~92% of requests until an `apache2ctl graceful`):
#   - disk >= 88%: delete what is always safe to delete (core dumps, npm
#     cache, Turbopack build caches of release dirs, journal over 50 MB);
#   - >= 50 1C answers in 5 minutes and >= 80% of them 5xx: graceful-restart
#     Apache (1C runs inside it), at most once per 30 minutes.
set -u

LOG=/var/log/partson-health.log
APACHE_LOG=/var/log/apache2/other_vhosts_access.log
STAMP=/var/lib/partson/health-last-graceful
mkdir -p /var/lib/partson

now=$(date '+%Y-%m-%d %H:%M:%S')
disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
avail=$(free -m | awk '/^Mem/{print $7}')
swap=$(free -m | awk '/^Swap/{print $3}')

pid=$(pgrep -f '^next-server' | head -1)
if [ -n "$pid" ]; then
  rss=$(( $(awk '/VmRSS/{print $2}' "/proc/$pid/status") / 1024 ))
  up=$(ps -o etimes= -p "$pid" | tr -d ' ')
else
  rss=0; up=0
fi
restarts=$(pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const p=JSON.parse(d).find(a=>a.name==="partson-web");process.stdout.write(String(p?p.pm2_env.restart_time:-1))}catch{process.stdout.write("-1")}})')

# 1C answers of the last 5 minutes (Apache time format: [20/Nov/2026:12:21:08 +0200]).
since=$(date -d '-5 min' '+%H:%M:%S')
today=$(date '+%d/%b/%Y')
read -r total errors < <(tail -n 20000 "$APACHE_LOG" 2>/dev/null | awk -v d="$today" -v t="$since" '
  index($5, d) && substr($5, 14, 8) >= t && $8 ~ /RetailShopAuto1/ { n++; if ($10 >= 500) e++ }
  END { print n + 0, e + 0 }')

actions=""

if [ "${disk:-0}" -ge 88 ]; then
  rm -f /var/lib/apport/coredump/core.* 2>/dev/null
  npm cache clean --force >/dev/null 2>&1
  rm -rf /var/www/Partson-release-*/.next/cache/turbopack 2>/dev/null
  journalctl --vacuum-size=50M >/dev/null 2>&1
  actions="$actions disk-cleanup(${disk}%->$(df --output=pcent / | tail -1 | tr -dc '0-9')%)"
fi

if [ "$total" -ge 50 ] && [ $(( errors * 100 / total )) -ge 80 ]; then
  last=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - last )) -ge 1800 ]; then
    apache2ctl graceful && date +%s > "$STAMP"
    actions="$actions apache-graceful(1C ${errors}/${total} 5xx)"
  else
    actions="$actions 1C-failing(${errors}/${total} 5xx, graceful done <30m ago)"
  fi
fi

echo "$now disk=${disk}% avail=${avail}MB swap=${swap}MB next_rss=${rss}MB next_up=${up}s pm2_restarts=${restarts} 1c_5min=${total} 1c_5xx=${errors}${actions:+ ACTION:$actions}" >> "$LOG"

# Keep the log small (~2 months of 5-minute lines).
if [ "$(wc -l < "$LOG")" -gt 20000 ]; then
  tail -n 17000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
