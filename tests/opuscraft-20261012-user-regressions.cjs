'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('V2 repair runs before cache and raises original attractions without resetting user worlds',()=>{
 const s=read('ops/gfc-family-town.ts'),repair=read('ops/gfc-v2-dry-site-repair.ts');
 assert.ok(s.indexOf('dryRepair.tick();return;')<s.indexOf('warmup.tick();return;'),
  'repair must not wait until world cache is complete');
 assert.match(s,/job\.y=Math\.max\(72,Math\.min\(160,/);
 assert.match(repair,/const target=Math\.max\(SAFE_Y,site\.y\)/);
 assert.match(repair,/if\(j\.phase==='saveCopy'\)/);
 assert.match(repair,/saveThen\(j,'eraseOld'\)/);
 assert.match(repair,/!game\.inWorld\|\|!game\.spawned\|\|!game\.server\|\|!empty\(\)/);
 assert.doesNotMatch(repair,/deleteWorld\(|resetWorld\(|localStorage\.clear\(/);
});
test('Remove only exact V2 voxel rotor arms; animated visual blades remain',()=>{
 const repair=read('ops/gfc-v2-dry-site-repair.ts'),rotors=read('ops/gfc-rotors.ts');
 assert.match(repair,/j\.kind==='windmill'\|\|j\.kind==='pinwheels'/);
 assert.match(repair,/const mill=j\.kind==='windmill'/);
 assert.match(repair,/for\(let t=1;t<=\(mill\?4:2\);t\+\+\)/);
 assert.match(repair,/if\(old\(x,y,z\)===wool\)game\.level\.setBlock\(x,y,z,S\('air'\)\)/);
 assert.match(rotors,/__gfcRotorRender/);
 assert.match(rotors,/if\(legacyPresent\)continue/);
 assert.match(rotors,/pose\.rotZ\(time\+arm\*90\)/);
});
test('Castle and village receive torches only on vacant supported blocks',()=>{
 const repair=read('ops/gfc-v2-dry-site-repair.ts');
 assert.match(repair,/j\.kind==='castle'/);
 assert.match(repair,/j\.kind==='village'/);
 assert.match(repair,/existing==='air'&&\['stone_bricks','dirt_path','cobblestone','spruce_planks'\]\.includes\(under\)/);
 assert.match(repair,/game\.level\.setBlock\(x,y,z,S\('torch'\)\)/);
 assert.match(repair,/game\.saveWorld\(\)\.then/);
});
test('Parent minute reset only affects one child and today, never changing the daily limit',()=>{
 const server=read('server.cjs'),ui=read('public/app.js');
 assert.match(server,/\/reset-minutes/);
 assert.match(server,/const key=localDay\(now\(\)\),started=now\(\)/);
 assert.match(server,/x\.userId===child\.id/);
 assert.match(server,/session\.daily\[key\]=0/);
 assert.match(server,/session\.lastTick=started/);
 assert.match(ui,/data-action="reset-minutes"/);
 assert.match(ui,/if\(confirm\('Zerar os minutos de hoje/);
 assert.match(ui,/admin\/users\/'\+u\.id\+'\/reset-minutes'/);
});
test('Farther view distance is optional and negotiated at next multiplayer join only',()=>{
 const client=read('ops/gfc-family-client.ts'),ui=read('public/app.js'),smoke=read('ops/opuscraft-guest-smoke.cjs');
 assert.match(client,/requested=mobile\?2:3/);
 assert.match(client,/Math\.min\(mobile\?3:5,requested\)/);
 assert.match(ui,/id="opusViewDistance"/);
 assert.match(ui,/gfc-family-view-distance/);
 assert.match(ui,/Saia e entre de novo/);
 assert.match(smoke,/status\.renderDistance!==3\|\|status\.hostViewDistance!==3/);
});
