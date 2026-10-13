#!/usr/bin/env bash
# Explicit operator-only activation of dedicated Minecraft in EXISTING GamesNavagador.
# Run as root ON THE VPS; never from GitHub Actions. Backs up changed files.
set -Eeuo pipefail
EXP=/home/gamesforchildren/experiments/minecraft-dedicated
LIVE=/home/gamesforchildren/apps/games-for-children
ENV=/home/gamesforchildren/.config/opuscraft-dedicated.env
SERVICE=games-for-children.service
DROP=/etc/systemd/system/games-for-children.service.d
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACK="$LIVE/backup/dedicated-pilot-$STAMP"
test "$(id -u)" -eq 0
test -s "$ENV" && test -s "$EXP/ops/opuscraft-headless/generated/engine.mjs"
test -s "$EXP/public/opuscraft/index.html" && test -s "$EXP/public/app.js"
test -s "$EXP/server.cjs" && test -d "$LIVE/public/opuscraft"
test "$(systemctl is-active "$SERVICE")" = active
test "$(systemctl is-active opuscraft-dedicated.service)" = active
curl -fsS --max-time 3 http://127.0.0.1:3100/api/health | grep -q '"ok":true'
ss -lnt | grep -q '127.0.0.1:4185'
test ! -e "$DROP/opuscraft-dedicated.conf"
mkdir -p "$BACK" "$DROP"
cp -a "$LIVE/server.cjs" "$LIVE/public/app.js" "$LIVE/public/opuscraft" "$BACK/"
restore(){
 echo 'OPUSCRAFT_DEDICATED_ROLLBACK_BEGIN'
 cp -a "$BACK/server.cjs" "$LIVE/server.cjs"
 cp -a "$BACK/app.js" "$LIVE/public/app.js"
 rm -rf -- "$LIVE/public/opuscraft"
 cp -a "$BACK/opuscraft" "$LIVE/public/opuscraft"
 rm -f "$DROP/opuscraft-dedicated.conf"
 systemctl daemon-reload
 systemctl restart "$SERVICE" || true
 echo "OPUSCRAFT_DEDICATED_ROLLBACK_DONE backup=$BACK"
}
trap restore ERR
# EnvFile is read by systemd, not by browsers. Existing user accounts/data untouched.
printf '[Service]\nEnvironmentFile=%s\n' "$ENV" > "$DROP/opuscraft-dedicated.conf"
chmod 644 "$DROP/opuscraft-dedicated.conf"
cp -a "$EXP/server.cjs" "$LIVE/server.cjs"
cp -a "$EXP/public/app.js" "$LIVE/public/app.js"
# Replace ONLY compiled OpusCraft; retain existing GamesNavagador assets.
rm -rf -- "$LIVE/public/opuscraft"
cp -a "$EXP/public/opuscraft" "$LIVE/public/opuscraft"
chown gamesforchildren:gamesforchildren "$LIVE/server.cjs" "$LIVE/public/app.js"
chown -R gamesforchildren:gamesforchildren "$LIVE/public/opuscraft"
NODE=/home/gamesforchildren/.nvm/versions/node/v24.21.0/bin/node
"$NODE" --check "$LIVE/server.cjs"
"$NODE" --check "$LIVE/public/app.js"
systemctl daemon-reload
systemctl restart "$SERVICE"
ready=0
for _ in $(seq 1 30); do
 if curl -fsS --max-time 2 http://127.0.0.1:3100/api/health | grep -q '"ok":true' &&
    systemctl is-active --quiet opuscraft-dedicated.service; then ready=1;break;fi
 sleep 1
done
test "$ready" -eq 1
trap - ERR
echo "OPUSCRAFT_GAMESNAVAGADOR_DEDICATED_GATEWAY_READY backup=$BACK"
echo 'Open the EXISTING GamesNavagador domain, sign in, and select Minecraft.'
