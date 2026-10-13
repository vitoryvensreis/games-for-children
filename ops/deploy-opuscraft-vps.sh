#!/usr/bin/env bash
set -Eeuo pipefail
cd /home/gamesforchildren/apps/games-for-children
mkdir -p backup
# Save app files for rollback; do NOT include/alter profiles of other games.
cp -f server.cjs backup/server-pre-opuscraft.cjs
cp -f package.json backup/package-pre-opuscraft.json
if test -d public; then rm -rf backup/public-pre-opuscraft; cp -a public backup/public-pre-opuscraft; fi
if test -d ops; then rm -rf backup/ops-pre-opuscraft; cp -a ops backup/ops-pre-opuscraft; fi
NPM=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/npm
NODEBIN=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin
rollback(){
 echo "OPUSCRAFT_PLAYER_HOST_DEPLOY_ROLLBACK"
 cp -f backup/server-pre-opuscraft.cjs server.cjs
 cp -f backup/package-pre-opuscraft.json package.json
 if test -d backup/public-pre-opuscraft; then rm -rf public; cp -a backup/public-pre-opuscraft public; fi
 if test -d backup/ops-pre-opuscraft; then rm -rf ops; cp -a backup/ops-pre-opuscraft ops; fi
 PATH="$NODEBIN:$PATH" "$NPM" install --omit=dev --no-audit --no-fund || true
 sudo -n /usr/bin/systemctl restart games-for-children.service || true
}
trap rollback ERR
# Remove outdated compiled game files before extracting the clean release.
# Rollback copies in backup/ remain available if activation fails.
rm -rf -- public/opuscraft
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
# Preserve all legacy OpusCraft worlds, snapshots and auxiliary files.
# A dedicated experimental world uses its own separate data directory.
trap - ERR
echo "OPUSCRAFT_EXISTING_WORLD_DATA_PRESERVED"
echo "OPUSCRAFT_DEPLOY_HEALTH_OK"
