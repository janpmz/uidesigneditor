#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only

npm run build
npm test

sudo install -d -m 755 /srv/uidesigneditor
sudo rsync -a --delete --chmod=D755,F644 -- dist/ /srv/uidesigneditor/

printf 'Published to /srv/uidesigneditor\n'
