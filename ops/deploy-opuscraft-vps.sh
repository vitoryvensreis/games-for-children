#!/usr/bin/env bash
set -Eeuo pipefail
cd /home/gamesforchildren/apps/games-for-children
mkdir -p backup
cp -f server.cjs backup/server-pre-opuscraft.cjs
cp -f package.json backup/package-pre-opuscraft.json
if test -d public; then rm -rf backup/public-pre-opuscraft; cp -a public backup/public-pre-opuscraft; fi
if test -d ops; then rm -rf backup/ops-pre-opuscraft; cp -a ops backup/ops-pre-opuscraft; fi
if test -d vendor/mcgalaxy && ! test -s backup/classicube-legacy.tar.gz; then
 tar -czf backup/classicube-legacy.tar.gz -C vendor/mcgalaxy levels properties bots
 test -s backup/classicube-legacy.tar.gz
fi
NPM=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/npm
NODEBIN=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin
rollback(){
 echo "OPUSCRAFT_DEPLOY_FAILED_ROLLBACK"
 cp -f backup/server-pre-opuscraft.cjs server.cjs
 cp -f backup/package-pre-opuscraft.json package.json
 if test -d backup/public-pre-opuscraft; then rm -rf public; cp -a backup/public-pre-opuscraft public; fi
 if test -d backup/ops-pre-opuscraft; then rm -rf ops; cp -a backup/ops-pre-opuscraft ops; fi
 PATH="$NODEBIN:$PATH" "$NPM" install --omit=dev --no-audit --no-fund || true
 sudo -n /usr/bin/systemctl restart games-for-children.service || true
}
trap rollback ERR
# Deploy account is allowed to restart, but not to stop/start separately.
# Keep the original process serving until its replacement has been installed.
# A live snapshot is supplemental; the original persistent profile is never deleted.
# The browser flushes its world during the permitted service restart.
if test -d data/opuscraft/profile; then
 tar -czf backup/opuscraft-profile-latest.tar.gz -C data/opuscraft profile
fi
tar -xzf release.tar.gz
PATH="$NODEBIN:$PATH" "$NPM" install --omit=dev --no-audit --no-fund
sudo -n /usr/bin/systemctl restart games-for-children.service
ready=0
for attempt in $(seq 1 110); do
 if curl -fsS --max-time 3 http://127.0.0.1:3100/api/health | grep -q '"ok":true' &&
    curl -fsS --max-time 3 http://127.0.0.1:4173/__health | grep -q '"ready":true' &&
    curl -fsS --max-time 3 http://127.0.0.1:4173/__health | grep -Eq '"lastSave":"20[0-9][0-9]-'; then
  ready=1
  break
 fi
 sleep 2
done
if test "$ready" -ne 1; then
 echo "OpusCraft did not demonstrate live multiplayer AND persisted world"
 curl -fsS --max-time 3 http://127.0.0.1:4173/__health || true
 /usr/bin/journalctl --no-pager -u games-for-children.service -n 90 || true
 false
fi
echo "OPUSCRAFT_PERMANENT_WORLD_READY"
curl -fsS --max-time 3 http://127.0.0.1:4173/__health
# The old ClassiCube is deleted only after new WebGL2 world is verified.
# Its full world/bot/settings backup stays in backup/classicube-legacy.tar.gz.
rm -rf public/classicube vendor/mcgalaxy
trap - ERR
echo "OPUSCRAFT_DEPLOY_HEALTH_OK"
