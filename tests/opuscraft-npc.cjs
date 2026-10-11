'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Andarilha remains an invisible, completely stationary server spectator',()=>{
 const npc=read('ops/gfc-npc.ts'),host=read('ops/opuscraft-host.cjs'),
  patch=read('ops/patch-opuscraft.mjs');
 assert.match(npc,/resident\.setGameMode\('spectator'\)/);
 assert.match(npc,/resident\.dx=resident\.dy=resident\.dz=0/);
 assert.match(npc,/inp\.forward=inp\.back=inp\.left=inp\.right=inp\.jump=inp\.sprint=inp\.sneak=false/);
 assert.match(npc,/role:'invisible_host'/);
 assert.match(npc,/brain:'disabled',configured:false/);
 assert.doesNotMatch(npc,/GROQ_|GEMINI_|fetch\(|setInterval\(|buildOne\(|NPC_SYSTEM_PROMPT|survivalTick|roam\(/);
 assert.doesNotMatch(host,/GROQ_|GEMINI_|generativelanguage\.googleapis|api\.groq\.com|decide\(|NPC_QUESTION|NPC_DECISION|NPC_STEP|tickNpc\(/);
 assert.match(host,/g\.saveWorld\(\)/);
 assert.match(patch,/installGfcNpc\(game\)/);
 assert.match(patch,/openToLanOnceSpawned\(game, 'creative'\)/);
 assert.match(patch,/getWorldMeta\(id\)/);
});
test('The family world attractions are additive, idempotent and preserve existing constructions',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 const build=read('ops/build-opuscraft.sh');
 assert.match(build,/gfc-world-attractions\.ts/);
 assert.match(a,/const OPEN=new Set/);
 assert.match(a,/if\(!OPEN\.has\(current\)\)/);
 assert.match(a,/if\(!OPEN\.has\(nameAt\(xx,yy,zz\)\)\)return false/);
 assert.match(a,/state\.work=\{site:\{kind,x,y,z\},cursor:0\}/);
 assert.match(a,/game\.level\.setBlock\(x,y,z,S\(b\.name\)\)/);
 assert.match(a,/await|\.then\(\(\)=>/);
 assert.match(a,/game\.saveWorld\(\)/);
 assert.match(a,/localStorage\.setItem\(key,JSON\.stringify\(state\)\)/);
 assert.doesNotMatch(a,/rmSync|removeChunk|deleteWorld|resetWorld|seed=/);
});
test('Exploration landmarks include Cauã tilde, Caique, real villages, castle and animated windmills',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 for(const kind of ['names','windmill','pinwheels','castle','village','garden','watchtower'])
  assert.ok(a.includes("'"+kind+"'"),kind);
 assert.match(a,/write\('CAIQUE',10/);
 assert.match(a,/write\('CAUA',3/);
 assert.match(a,/put\(4,9,-1,'lime_concrete'\)/);
 assert.match(a,/const arms=\(frame:number\)=>/);
 assert.match(a,/spinnerFrame=1-spinnerFrame/);
 assert.match(a,/if\(!matches\(spinnerFrame\)\)/);
 assert.match(a,/game\.chunks\.setTicket\('gfc-landmarks'/);
 assert.match(a,/game\.chunks\.setTicket\('gfc-windmill'/);
});
test('Only a signed-in administrator can teleport to the landmark',()=>{
 const server=read('server.cjs'),npc=read('ops/gfc-npc.ts'),ui=read('public/app.js');
 assert.match(server,/pathname==='\/api\/admin\/opuscraft\/npc\/visit'/);
 assert.match(server,/u\.role!=='admin'/);
 assert.match(npc,/\^ADM_/);
 assert.match(npc,/s\.teleportTo\(p\.x,p\.y\+1\.2,p\.z-2/);
 assert.match(ui,/Ir ao letreiro/);
 assert.match(ui,/api\('admin\/opuscraft\/npc\/visit','POST'/);
});
test('Headless VPS persists exactly the same original IndexedDB family world',()=>{
 const host=read('ops/opuscraft-host.cjs'),build=read('ops/build-opuscraft.sh');
 assert.match(host,/userDataDir:PROFILE/);
 assert.match(host,/gfcHost=1&build=/);
 assert.match(host,/readFileSync\(path\.join\(SITE,'GFC-BUILD-ID\.txt'\)/);
 assert.ok(build.includes('GFC-BUILD-ID.txt'));
 assert.doesNotMatch(host,/rmSync\(PROFILE/);
 assert.match(host,/attachRelay/);
});
