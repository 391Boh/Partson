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
  npm run generate:feed

  echo "Merchant feed update finished: $(date '+%Y-%m-%d %H:%M:%S')"
} 9>"$LOCK_FILE" >>"$LOG_FILE" 2>&1
