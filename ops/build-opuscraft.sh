#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM="bc0c753f730ef15bc8f8acf093d40797700b87ee"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Fetching audited OpusCraft source $UPSTREAM"
git clone --filter=blob:none --no-checkout https://github.com/Oppenheimerism/OpusCraft.git "$TMP/opuscraft"
git -C "$TMP/opuscraft" fetch --depth 1 origin "$UPSTREAM"
git -C "$TMP/opuscraft" checkout --detach "$UPSTREAM"
test "$(git -C "$TMP/opuscraft" rev-parse HEAD)" = "$UPSTREAM"
(
 cd "$TMP/opuscraft"
 npm ci --no-audit --no-fund
 cp "$REPO_ROOT/ops/gfc-world-backup.ts" src/gfc-world-backup.ts
 cp "$REPO_ROOT/ops/gfc-npc.ts" src/gfc-npc.ts
cp "$REPO_ROOT/ops/gfc-family-client.ts" src/gfc-family-client.ts
cp "$REPO_ROOT/ops/gfc-adaptive-quality.ts" src/gfc-adaptive-quality.ts
 cp "$REPO_ROOT/ops/gfc-leaf-merge.ts" src/render/gfc-leaf-merge.ts
 node "$REPO_ROOT/ops/patch-opuscraft.mjs" "$PWD"
 node "$REPO_ROOT/ops/patch-opuscraft-mesh.mjs" "$PWD"
 node "$REPO_ROOT/ops/patch-opuscraft-host-cpu.mjs" "$PWD"
 npm run build -- --base=/opuscraft/
)
test -s "$TMP/opuscraft/dist/index.html"
mkdir -p "$REPO_ROOT/public/opuscraft"
cp -a "$TMP/opuscraft/dist/." "$REPO_ROOT/public/opuscraft/"
cp "$TMP/opuscraft/LICENSE" "$REPO_ROOT/public/opuscraft/OPUSCRAFT-LICENSE.txt"
cp "$TMP/opuscraft/scripts/relay.mjs" "$REPO_ROOT/ops/opuscraft-relay.mjs"
test -s "$REPO_ROOT/ops/opuscraft-relay.mjs"
echo "$UPSTREAM" > "$REPO_ROOT/public/opuscraft/UPSTREAM-COMMIT.txt"
printf "%s\n" "${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)}" > "$REPO_ROOT/public/opuscraft/GFC-BUILD-ID.txt"
echo "OpusCraft WebGL2 bundle built and relay copied successfully"
