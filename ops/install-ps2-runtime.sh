#!/usr/bin/env bash
# Fetch only the official emulator. Game data is never downloaded.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/public/ps2/emulator"
mkdir -p "$DEST"
JS_HASH="5599ff16ae5e3534f9b779736aedfa20661821d57be7f03e587e31ef8d090317"
WASM_HASH="c7cdaee26e8fd0a3aab50cfe27ac6ec5ca2bfba0cc5962958b07d739c1a73ab3"
check_hash(){ test "$(sha256sum "$1" | cut -d' ' -f1)" = "$2"; }
if test -s "$DEST/Play.js" && test -s "$DEST/Play.wasm" && check_hash "$DEST/Play.js" "$JS_HASH" && check_hash "$DEST/Play.wasm" "$WASM_HASH"; then
 echo "PS2_RUNTIME_ALREADY_VERIFIED"
 exit 0
fi
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
curl -fsSL --retry 3 --connect-timeout 20 --max-time 180 -o "$TMP/Play.js" 'https://playjs.purei.org/Play.js'
curl -fsSL --retry 3 --connect-timeout 20 --max-time 360 -o "$TMP/Play.wasm" 'https://playjs.purei.org/Play.wasm'
curl -fsSL --retry 3 --connect-timeout 20 --max-time 60 -o "$TMP/License.txt" 'https://raw.githubusercontent.com/jpd002/Play-/master/License.txt'
check_hash "$TMP/Play.js" "$JS_HASH" || { echo "PS2_JAVASCRIPT_HASH_MISMATCH"; exit 1; }
check_hash "$TMP/Play.wasm" "$WASM_HASH" || { echo "PS2_WASM_HASH_MISMATCH"; exit 1; }
grep -q 'export default Play' "$TMP/Play.js"
test -s "$TMP/License.txt"
install -m 0644 "$TMP/Play.js" "$DEST/Play.js"
install -m 0644 "$TMP/Play.wasm" "$DEST/Play.wasm"
install -m 0644 "$TMP/License.txt" "$DEST/License.txt"
echo "PS2_RUNTIME_VERIFIED_AND_INSTALLED"
