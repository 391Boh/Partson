#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
LOCK_FILE="$LOG_DIR/merchant-feed.lock"
LOG_FILE="$LOG_DIR/merchant-feed.log"

mkdir -p "$LOG_DIR"

{
  echo "========================================"
  echo "Merchant feed update started: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Project: $ROOT_DIR"

  if command -v flock >/dev/null 2>&1; then
    flock -n 9 || {
      echo "Another merchant feed update is already running."
      exit 0
    }
  fi

  cd "$ROOT_DIR"
  # cron starts with a bare PATH (/usr/bin:/bin), so npm was never found and
  # every scheduled run failed. Add the usual Homebrew/node locations, then
  # fall back to nvm if npm is still missing.
  export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
  if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found (PATH=$PATH)"
    exit 1
  fi
  npm run generate:feed

  echo "Merchant feed update finished: $(date '+%Y-%m-%d %H:%M:%S')"
} 9>"$LOCK_FILE" >>"$LOG_FILE" 2>&1
