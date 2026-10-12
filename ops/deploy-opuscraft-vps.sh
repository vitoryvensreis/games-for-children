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
 # Immutable recovery point before the ONE-TIME switch to the V2 family town.
 # The browser profile contains world chunks, inventories, and landmark metadata.
 # Never wipe the profile; the original V1 world remains in IndexedDB.
 if ! test -s backup/opuscraft-family-v1-pre-v2.tar.gz; then
  tar -czf backup/opuscraft-family-v1-pre-v2.tar.gz -C data/opuscraft profile
  test -s backup/opuscraft-family-v1-pre-v2.tar.gz
  echo "OPUSCRAFT_FAMILY_V1_ARCHIVED_BEFORE_V2"
 fi
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
# Do not claim that a successful process startup means the constructions
# exist. Demand a physical post-save landmark in the new world as well.
sign_ready=0
for attempt in $(seq 1 360); do
 status="$(curl -fsS --max-time 5 http://127.0.0.1:4173/__npc/status || true)"
 if printf '%s' "$status" | grep -q '"version":2' &&
    printf '%s' "$status" | grep -q '"attractions":\[{"name":"names"'; then
  sign_ready=1
  break
 fi
 if (( attempt % 45 == 0 )); then
  echo "Waiting for V2 sign construction, attempt=$attempt"
  printf '%s\n' "$status" | head -c 800 || true
 fi
 sleep 1
done
if test "$sign_ready" -ne 1; then
 echo "The new family world did not save its first sign; rolling back app"
 curl -fsS --max-time 4 http://127.0.0.1:4173/__npc/status || true
 false
fi
echo "OPUSCRAFT_V2_SIGN_SAVED_ON_VPS"
echo "OPUSCRAFT_PERMANENT_WORLD_READY"
curl -fsS --max-time 3 http://127.0.0.1:4173/__health
# Retire only obsolete runtime/files after the replacement world passes health checks.
# Preserve all world/data directories, JSON state, IndexedDB profiles and backups.
# MCGalaxy world/config files were archived earlier as backup/classicube-legacy.tar.gz.
rm -rf public/classicube vendor/mcgalaxy
rm -f database/family-village.cjs database/exploration-world.cjs database/mining-world.cjs database/family-play.cjs database/minecraft-control.cjs ops/CLASSICUBE.md
trap - ERR
echo "OPUSCRAFT_DEPLOY_HEALTH_OK"
