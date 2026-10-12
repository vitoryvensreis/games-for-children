'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('V3 remains unchanged with no world reset, new seed, destruction or attraction builder',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),host=read('ops/opuscraft-host.cjs');
 assert.match(patch,/gamesnavagador-family-world-v3/);
 assert.match(patch,/gamesnavagador-exploration-clean-2026-v3/);
 assert.match(host,/profile-v3/);
 assert.doesNotMatch(patch,/gamesnavagador-family-world-v4|deleteWorld|clearWorld/);
});
test('Native OpusCraft chunk pipeline replaces early terrain display and low bandwidth cap',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),build=read('ops/build-opuscraft.sh');
 assert.doesNotMatch(patch,/isReady\(this\.player\.x, this\.player\.z, this\.mode === 'client' \? 1/);
 assert.doesNotMatch(patch,/CHUNKS_PER_TICK = 3/);
 assert.doesNotMatch(patch,/this\.ticks % 70 === 0/);
 assert.doesNotMatch(patch,/Math\.min\(1,this\.opts\.renderDistance\)/);
 assert.doesNotMatch(build,/node "\$REPO_ROOT\/ops\/patch-opuscraft-mesh\.mjs"/);
 assert.doesNotMatch(build,/cp "\$REPO_ROOT\/ops\/gfc-leaf-merge\.ts"/);
 assert.match(build,/bc0c753f730ef15bc8f8acf093d40797700b87ee/);
});
test('Native graphics and extended 3–8 view range have safe optional lightweight fallback',()=>{
 const client=read('ops/gfc-family-client.ts'),patch=read('ops/patch-opuscraft.mjs'),ui=read('public/app.js');
 assert.match(client,/quality\.setMode\('original'\)/);
 assert.match(client,/mobile\?4:6/);
 assert.match(client,/mobile\?6:8/);
 assert.match(client,/gfc-family-native-view-distance-v1/);
 assert.doesNotMatch(client,/game\.opts\.graphics = 0/);
 assert.doesNotMatch(client,/game\.opts\.smoothLighting = false/);
 assert.doesNotMatch(client,/game\.opts\.maxFps = Math\.min/);
 assert.match(patch,/mode !== 'original' \? \(mobile \? 720 : 900\) : 8192/);
 assert.match(ui,/Original OpusCraft \(padrão\)/);
 assert.match(ui,/Máximo do servidor — 8 chunks/);
 assert.match(ui,/gfc-family-native-view-distance-v1/);
 assert.match(ui,/No celular o máximo recomendado é 6 chunks/);
});
