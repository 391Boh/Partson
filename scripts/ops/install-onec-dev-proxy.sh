#!/bin/bash
# Key-gated HTTPS access to 1C for local development from any IP.
#
# Apache in front of 1C only admits allowlisted IPs, and a laptop's address
# keeps changing. This adds two nginx locations on partson.shop that proxy to
# 1C on 127.0.0.1:8080 (always allowlisted) — but only for requests carrying
# the secret header X-Partson-Onec-Key:
#   /__onec/<endpoint>   →  /RetailShopAuto1/hs/serv/<endpoint>  (API)
#   /RetailShopAuto1/... →  /RetailShopAuto1/...                  (relative image URLs)
# Without the key both answer 404, as before. Traffic is HTTPS end to end from
# the laptop, and the header is stripped before it reaches 1C.
#
# Run as root on the server:  bash scripts/ops/install-onec-dev-proxy.sh
# Prints the key once. Put in .env.local on the laptop:
#   ONEC_BASE_URL=https://partson.shop/__onec
#   ONEC_ACCESS_KEY=<key>
# Re-running keeps the existing key; `--rotate` makes a new one.
# Remove: delete the BEGIN/END block from the site config and
#   /etc/nginx/conf.d/01-partson-onec-dev.conf, then `nginx -t && systemctl reload nginx`.
set -euo pipefail

SITE_CONF=/etc/nginx/conf.d/partson.conf
MAP_CONF=/etc/nginx/conf.d/01-partson-onec-dev.conf
KEY_FILE=/etc/nginx/partson-onec-dev.key
BACKUP_DIR=/root/nginx-backup
TS=$(date +%Y%m%d-%H%M%S)

[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
[ -f "$SITE_CONF" ] || { echo "Missing $SITE_CONF"; exit 1; }
mkdir -p "$BACKUP_DIR"

if [ ! -s "$KEY_FILE" ] || [ "${1:-}" = "--rotate" ]; then
  umask 077
  openssl rand -hex 24 > "$KEY_FILE"
fi
KEY=$(tr -dc 'a-f0-9' < "$KEY_FILE")
[ ${#KEY} -ge 32 ] || { echo "Bad key in $KEY_FILE"; exit 1; }

cp "$SITE_CONF" "$BACKUP_DIR/partson.conf.$TS-before-onec-dev"
[ -f "$MAP_CONF" ] && cp "$MAP_CONF" "$BACKUP_DIR/01-partson-onec-dev.conf.$TS"

umask 077
cat > "$MAP_CONF" <<EOF
# Key gate for the 1C development proxy (scripts/ops/install-onec-dev-proxy.sh).
map \$http_x_partson_onec_key \$partson_onec_dev_ok {
    default 0;
    "$KEY" 1;
}
limit_req_zone \$binary_remote_addr zone=partson_onec_dev:1m rate=600r/m;
EOF
chmod 600 "$MAP_CONF"

if ! grep -q "BEGIN partson onec dev proxy" "$SITE_CONF"; then
  BLOCK=$(cat <<'EOF'
    # BEGIN partson onec dev proxy (scripts/ops/install-onec-dev-proxy.sh)
    location ^~ /__onec/ {
        if ($partson_onec_dev_ok = 0) { return 404; }
        limit_req zone=partson_onec_dev burst=120 nodelay;
        limit_req_status 429;
        client_max_body_size 25m;
        proxy_pass http://127.0.0.1:8080/RetailShopAuto1/hs/serv/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Partson-Onec-Key "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
        access_log /var/log/nginx/onec-dev.access.log;
    }
    location ^~ /RetailShopAuto1/ {
        if ($partson_onec_dev_ok = 0) { return 404; }
        limit_req zone=partson_onec_dev burst=120 nodelay;
        limit_req_status 429;
        client_max_body_size 25m;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Partson-Onec-Key "";
        proxy_read_timeout 180s;
        access_log /var/log/nginx/onec-dev.access.log;
    }
    # END partson onec dev proxy
EOF
)
  # Insert before the first catch-all `location / {` (the HTTPS site server).
  BLOCK="$BLOCK" awk '
    !done && /^[[:space:]]*location \/ \{/ { print ENVIRON["BLOCK"]; done=1 }
    { print }
  ' "$SITE_CONF" > "$SITE_CONF.tmp"
  grep -q "BEGIN partson onec dev proxy" "$SITE_CONF.tmp" || { rm -f "$SITE_CONF.tmp"; echo "No 'location / {' found"; exit 1; }
  mv "$SITE_CONF.tmp" "$SITE_CONF"
fi

if nginx -t 2>/dev/null; then
  systemctl reload nginx
else
  nginx -t || true
  cp "$BACKUP_DIR/partson.conf.$TS-before-onec-dev" "$SITE_CONF"
  rm -f "$MAP_CONF"
  echo "nginx config test failed — restored the previous config."
  exit 1
fi

code_no_key=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://partson.shop/__onec/allgoods -H "Content-Type: application/json" -d '{}')
code_key=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://partson.shop/__onec/allgoods -H "Content-Type: application/json" -H "X-Partson-Onec-Key: $KEY" -d '{}')
echo "Check: without key → $code_no_key (expect 404); with key → $code_key (expect 401 without 1C credentials)"
echo
echo "Put these two lines in .env.local on the laptop (restart next dev afterwards):"
echo "ONEC_BASE_URL=https://partson.shop/__onec"
echo "ONEC_ACCESS_KEY=$KEY"
