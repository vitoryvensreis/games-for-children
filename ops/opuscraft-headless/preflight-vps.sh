#!/usr/bin/env bash
# Read-only preflight for the dedicated OpusCraft pilot on the actual VPS.
# Does not restart, install, alter files, or print secrets.
set -uo pipefail
APP=/home/gamesforchildren/apps/games-for-children
NODE=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/node
WORLD=/home/gamesforchildren/data/opuscraft-experimental
ENV_FILE=/home/gamesforchildren/.config/opuscraft-dedicated.env
bad=0
check(){
 local label="$1"; shift
 if "$@" >/dev/null 2>&1; then printf 'PASS %s\n' "$label"
 else printf 'BLOCKED %s\n' "$label"; bad=1; fi
}
check 'node24' test -x "$NODE"
check 'project-directory' test -d "$APP"
check 'dedicated-entry' test -f "$APP/ops/opuscraft-headless/run-dedicated.cjs"
check 'dedicated-engine-built' test -s "$APP/ops/opuscraft-headless/generated/engine.mjs"
check 'browser-client-built' test -s "$APP/public/opuscraft/index.html"
check 'world-directory' test -d "$WORLD"
check 'world-writable-by-service-user' sudo -n -u gamesforchildren test -w "$WORLD"
check 'environment-file' test -f "$ENV_FILE"
check 'environment-readable-by-service-user' sudo -n -u gamesforchildren test -r "$ENV_FILE"
check 'main-app-service-active' systemctl is-active --quiet games-for-children.service
check 'main-app-health' curl -fsS --max-time 3 http://127.0.0.1:3100/api/health
check 'dedicated-port-not-occupied' bash -c '! (echo > /dev/tcp/127.0.0.1/4185) 2>/dev/null'
printf 'NOTE: no files or systemd units were modified. Do not paste environment-file contents.\n'
if ((bad)); then exit 1; fi
printf 'OPUSCRAFT_DEDICATED_VPS_PREFLIGHT_OK\n'
