#!/usr/bin/env bash
# Restarts one PM2 app from a new ecosystem file and rolls back automatically
# when the new process does not come up healthy. Other PM2 apps are never
# restarted (their pm_uptime is compared before/after). `pm2 save` runs only
# after every check passed, so a failed switch leaves the saved process list
# unchanged.
#
#   APP_DIR=/var/www/<active-release> ROLLBACK_ECOSYSTEM=<old config> scripts/ops/switch-pm2-app.sh
# Options (env): APP_NAME (partson-web), NEW_ECOSYSTEM (ecosystem.config.js),
#   PORT (3000), BASE_URL (http://127.0.0.1:$PORT), START_TIMEOUT (90 s),
#   EXPECT_PROCESS_TITLE (next-server), CHECKS ("path|status" lines),
#   BACKUP_DIR (/root), PM2 (pm2).
# Exit: 0 switched, 1 failed and rolled back, 2 failed AND rollback failed,
#       3 preflight failed (nothing changed).
set -uo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${ROLLBACK_ECOSYSTEM:?ROLLBACK_ECOSYSTEM is required (config to restore on failure)}"
APP_NAME="${APP_NAME:-partson-web}"
NEW_ECOSYSTEM="${NEW_ECOSYSTEM:-ecosystem.config.js}"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:$PORT}"
START_TIMEOUT="${START_TIMEOUT:-90}"
EXPECT_PROCESS_TITLE="${EXPECT_PROCESS_TITLE:-next-server}"
BACKUP_DIR="${BACKUP_DIR:-/root}"
PM2="${PM2:-pm2}"
CHECKS="${CHECKS:-/robots.txt|200
/|200
/katalog|200
/auto/skoda/fabia-i|200
/product/filtr-povitryanyy-megane-02-af1912|200
/manufacturers/alpha|308
/manufacturers/nonexistent-xyz|404}"

say() { echo "[switch-pm2-app] $*"; }
jlist() { "$PM2" jlist 2>/dev/null | sed -n '/^\[/,$p'; }
uptimes() { jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s||"[]"))if(p.name!==process.argv[1])console.log(p.name+"="+p.pm2_env.pm_uptime)})' "$APP_NAME" | sort; }
app_pid() { "$PM2" pid "$APP_NAME" 2>/dev/null | tail -1 | tr -dc 0-9; }

wait_ready() {
  local deadline=$(( $(date +%s) + START_TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$BASE_URL/robots.txt")" = 200 ] && return 0
    sleep 1
  done
  return 1
}

health() {
  local pid title children line path want code failed=0
  pid="$(app_pid)"
  [ -n "$pid" ] && [ "$pid" != 0 ] || { say "FAIL: $APP_NAME has no pid"; return 1; }
  title="$(ps -o command= -p "$pid" 2>/dev/null)"
  case "$title" in *"$EXPECT_PROCESS_TITLE"*) ;; *) say "FAIL: pid $pid is '$title', expected $EXPECT_PROCESS_TITLE"; failed=1;; esac
  children="$(pgrep -P "$pid" | wc -l | tr -d ' ')"
  [ "$children" = 0 ] || { say "FAIL: pid $pid has $children child process(es)"; failed=1; }
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    path="${line%%|*}"; want="${line##*|}"
    code="$(curl -s -o /dev/null -m 60 -w '%{http_code}' "$BASE_URL$path")"
    if [ "$code" = "$want" ]; then say "ok   $code $path"; else say "FAIL $code $path (expected $want)"; failed=1; fi
  done <<< "$CHECKS"
  return "$failed"
}

start_from() {
  ( cd "$APP_DIR" && "$PM2" start "$1" --only "$APP_NAME" >/dev/null 2>&1 )
}

# --- preflight (nothing is changed if any of this fails)
cd "$APP_DIR" 2>/dev/null || { say "STOP: no $APP_DIR"; exit 3; }
for f in "$NEW_ECOSYSTEM" "$ROLLBACK_ECOSYSTEM"; do
  [ -f "$f" ] || { say "STOP: $f not found in $APP_DIR"; exit 3; }
  # PM2 only treats *.config.js/cjs/mjs, *.json, *.yml/yaml as ecosystem files;
  # any other name would be launched as a plain script.
  case "$f" in
    *.config.js|*.config.cjs|*.config.mjs|*.json|*.yml|*.yaml) ;;
    *) say "STOP: $f is not named like a PM2 ecosystem file (*.config.js)"; exit 3 ;;
  esac
  node -e 'const c=require(require("path").resolve(process.argv[1]));if(!c.apps.some(a=>a.name===process.argv[2]))process.exit(1)' "$f" "$APP_NAME" \
    || { say "STOP: $f has no app $APP_NAME"; exit 3; }
done
[ -n "$(app_pid)" ] || { say "STOP: $APP_NAME is not running under this PM2"; exit 3; }
OTHERS_BEFORE="$(uptimes)"
TS="$(date +%Y%m%d-%H%M%S)"
PM2_DIR="${PM2_HOME:-$HOME/.pm2}"
mkdir -p "$BACKUP_DIR"
[ -f "$PM2_DIR/dump.pm2" ] && cp -a "$PM2_DIR/dump.pm2" "$BACKUP_DIR/pm2-dump.before-switch.$TS" && say "pm2 dump backup: $BACKUP_DIR/pm2-dump.before-switch.$TS"

# --- switch
say "restarting $APP_NAME from $NEW_ECOSYSTEM"
"$PM2" delete "$APP_NAME" >/dev/null 2>&1
if start_from "$NEW_ECOSYSTEM" && wait_ready && health; then
  OTHERS_AFTER="$(uptimes)"
  if [ "$OTHERS_BEFORE" != "$OTHERS_AFTER" ]; then
    say "WARNING: another PM2 app changed uptime:"; diff <(echo "$OTHERS_BEFORE") <(echo "$OTHERS_AFTER")
  fi
  "$PM2" save >/dev/null 2>&1 && say "pm2 saved"
  say "OK: $APP_NAME switched; pid $(app_pid) mem $(jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(Math.round(p.monit.memory/1048576)+"MB")})' "$APP_NAME")"
  exit 0
fi

# --- automatic rollback (pm2 save was NOT run, saved list is still the old one)
say "switch FAILED — rolling back $APP_NAME to $ROLLBACK_ECOSYSTEM"
"$PM2" delete "$APP_NAME" >/dev/null 2>&1
if start_from "$ROLLBACK_ECOSYSTEM" && wait_ready; then
  EXPECT_PROCESS_TITLE="" health >/dev/null 2>&1 || true
  say "rolled back: $APP_NAME online from $ROLLBACK_ECOSYSTEM (pid $(app_pid)); pm2 list NOT saved"
  exit 1
fi
say "CRITICAL: rollback did not come up either — run: cd $APP_DIR && $PM2 start $ROLLBACK_ECOSYSTEM --only $APP_NAME"
exit 2
