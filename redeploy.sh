#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only

npm ci
npm run build
npm test

mkdir -p /srv/uidesigneditor
rsync -a --delete --chmod=D755,F644 -- dist/ /srv/uidesigneditor/

./startServer.sh

printf 'Published to /srv/uidesigneditor\n'
