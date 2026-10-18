#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

export NODE_ENV=production
export PORT="${PORT:-3000}"
export PUBLIC_DIR="${PUBLIC_DIR:-/srv/uidesigneditor}"
export DATA_DIR="${DATA_DIR:-/var/lib/uidesigneditor}"
log_dir="${LOG_DIR:-$HOME/projects/logs}"

mkdir -p -- "$log_dir" "$DATA_DIR"

if pm2 describe uidesigneditor >/dev/null 2>&1; then
  pm2 restart uidesigneditor --update-env
else
  pm2 start npm --name uidesigneditor --log "$log_dir/uidesigneditor.log" -- run start
fi
pm2 save
