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
 # esbuild is an isolated smoke-test bundler, not an upstream runtime dependency.
 npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2
 # Branch-only headless integration smoke: real upstream engine in Node without Chromium.
 node "$REPO_ROOT/ops/opuscraft-headless/smoke-upstream.mjs" "$PWD"
 # Experimental dedicated Node engine: creates a reusable module, not just a smoke bundle.
 node "$REPO_ROOT/ops/patch-opuscraft-trusted-relay.mjs" "$PWD"
 node "$REPO_ROOT/ops/opuscraft-headless/build-dedicated-engine.mjs" "$PWD" "$REPO_ROOT/ops/opuscraft-headless/generated/engine.mjs"
 node --check "$REPO_ROOT/ops/opuscraft-headless/generated/engine.mjs"

 # Build original OpusCraft game logic and graphics; adapt only the exact
 # trusted GamesNavagador HTTPS origin for authenticated player hosting.
 npm run build -- --base=/opuscraft/
)
test -s "$TMP/opuscraft/dist/index.html"
rm -rf -- "$REPO_ROOT/public/opuscraft"
mkdir -p "$REPO_ROOT/public/opuscraft"
cp -a "$TMP/opuscraft/dist/." "$REPO_ROOT/public/opuscraft/"
cp "$TMP/opuscraft/LICENSE" "$REPO_ROOT/public/opuscraft/OPUSCRAFT-LICENSE.txt"
cp "$TMP/opuscraft/scripts/relay.mjs" "$REPO_ROOT/ops/opuscraft-relay.mjs"
test -s "$REPO_ROOT/ops/opuscraft-relay.mjs"
echo "$UPSTREAM" > "$REPO_ROOT/public/opuscraft/UPSTREAM-COMMIT.txt"
printf "%s\n" "${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)}" > "$REPO_ROOT/public/opuscraft/GFC-BUILD-ID.txt"
echo "OpusCraft WebGL2 bundle built and relay copied successfully"
