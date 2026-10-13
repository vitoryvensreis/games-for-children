// The upstream LAN host assumes a local browser host player in broadcastEffects.
// A dedicated Node server has no local player, only remote guests. Adapt only
// that one dereference and retain original network distribution of sounds.
import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2];
if(!dir)throw Error('usage: node patch-opuscraft-dedicated-effects.mjs <upstream-dir>');
const file=path.join(dir,'src/net/effects.ts');
const source=fs.readFileSync(file,'utf8');
const anchor='if (!own().wonGame) sound.play(name, x, y, z, volume, pitch);';
if(source.split(anchor).length!==2)throw Error('Upstream sound host guard changed');
fs.writeFileSync(file,source.replace(anchor,'if (!own() || !own()!.wonGame) sound.play(name, x, y, z, volume, pitch);'));
console.log('OPUSCRAFT_DEDICATED_NO_LOCAL_PLAYER_EFFECTS_OK');
