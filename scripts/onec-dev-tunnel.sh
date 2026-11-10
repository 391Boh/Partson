#!/usr/bin/env bash
# Local development reaches 1C through SSH instead of the public port 8080.
# Requests then arrive at Apache from the server itself (127.0.0.1), which
# both 1C access rules allow (sites-enabled/partson.conf and the <Directory>
# block in apache2.conf), so a new laptop IP needs SSH access only, never an
# Apache change. Point ONEC_BASE_URL in .env.local at
# http://127.0.0.1:18080/RetailShopAuto1/hs/serv while this runs.
set -euo pipefail

PORT="${ONEC_TUNNEL_PORT:-18080}"
echo "1C tunnel: http://127.0.0.1:${PORT}/RetailShopAuto1/hs/serv (Ctrl+C closes it)"
exec ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "127.0.0.1:${PORT}:127.0.0.1:8080" \
  partson-prod
