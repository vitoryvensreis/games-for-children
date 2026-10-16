#!/usr/bin/env bash
set -Eeuo pipefail
cd /home/gamesforchildren/apps/games-for-children
mkdir -p backup
# Save app files for rollback; do NOT include/alter profiles of other games.
# Unique rollback snapshot; previous snapshots must remain untouched.
SNAPSHOT="$(mktemp -d -p backup ps2-deploy-XXXXXXXX)"
cp -f server.cjs "$SNAPSHOT/server.cjs"
cp -f package.json "$SNAPSHOT/package.json"
if test -d public; then cp -a public "$SNAPSHOT/public"; fi
if test -d ops; then cp -a ops "$SNAPSHOT/ops"; fi
echo "PS2_ROLLBACK_SNAPSHOT=$SNAPSHOT"
NPM=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/npm
NODEBIN=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin
rollback(){
 echo "OPUSCRAFT_PLAYER_HOST_DEPLOY_ROLLBACK"
 cp -f "$SNAPSHOT/server.cjs" server.cjs
 cp -f "$SNAPSHOT/package.json" package.json
 if test -d "$SNAPSHOT/public"; then cp -a "$SNAPSHOT/public/." public/; fi
 if test -d "$SNAPSHOT/ops"; then cp -a "$SNAPSHOT/ops/." ops/; fi
 PATH="$NODEBIN:$PATH" "$NPM" install --omit=dev --no-audit --no-fund || true
 sudo -n /usr/bin/systemctl restart games-for-children.service || true
}
trap rollback ERR
# Remove outdated compiled game files before extracting the clean release.
# Rollback copies in backup/ remain available if activation fails.
# Retain existing OpusCraft files and persistent local state; tar overlays new build.
tar -xzf release.tar.gz
PATH="$NODEBIN:$PATH" "$NPM" install --omit=dev --no-audit --no-fund
sudo -n /usr/bin/systemctl restart games-for-children.service
ready=0
for attempt in $(seq 1 90); do
 if curl -fsS --max-time 3 http://127.0.0.1:3100/api/health | grep -q '"ok":true' &&
    curl -fsS --max-time 3 http://127.0.0.1:4173/__health | grep -q '"mode":"player-hosted"' &&
    test -s public/opuscraft/index.html &&
    test -s ops/opuscraft-relay.mjs; then
  ready=1;break
 fi
 sleep 2
done
if test "$ready" -ne 1; then
 echo "Original OpusCraft or authenticated player relay did not start"
 /usr/bin/journalctl --no-pager -u games-for-children.service -n 90 || true
 false
fi
echo "OPUSCRAFT_ORIGINAL_PLAYER_RELAY_READY"
curl -fsS http://127.0.0.1:4173/__health
# Do not touch ANY persisted worlds, map backups, family snapshots or
# legacy operational scripts during this unrelated PS2 laboratory deploy.
# In particular, never rm -rf data/opuscraft and never prune backup/*.tar.gz.
test -s public/ps2/index.html
test -s public/ps2/emulator/Play.js
test -s public/ps2/emulator/Play.wasm
test -s public/ps2/emulator/License.txt
# The PS2 route must NOT serve protected assets without an admin session.
ps2_status="$(curl -sS --max-time 6 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/ps2/index.html)"
test "$ps2_status" = 401 || { echo "PS2_AUTH_GUARD_FAILED: $ps2_status"; false; }
ps2_binary_status="$(curl -sS --max-time 6 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/ps2/emulator/Play.wasm)"
test "$ps2_binary_status" = 401 || { echo "PS2_RUNTIME_AUTH_GUARD_FAILED: $ps2_binary_status"; false; }
trap - ERR
echo "OPUSCRAFT_PERSISTED_WORLDS_AND_BACKUPS_PRESERVED"
echo "PS2_ADMIN_ONLY_LAB_READY"
echo "GAMESFORCHILDREN_DEPLOY_HEALTH_OK"
