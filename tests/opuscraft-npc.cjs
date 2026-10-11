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
 assert.match(a,/if\(!OPEN\.has\(nameAt\(xx,yy,zz\)\)\)return null/);
 assert.match(a,/state\.work=\{site:\{kind,x,y:platformY,z,elevated:normal===null\},cursor:0\}/);
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
 assert.match(npc,/s\.teleportTo\(p\.x,p\.y\+7,p\.z-12,0,0\)/);
 assert.match(npc,/attractions\?\.destination\(attraction\)/);
 assert.match(server,/const attraction=body\.attraction/);
 assert.match(ui,/opusLandmarksList/);
 assert.match(ui,/function familyLandmarkButtons\(state\)/);
 assert.match(ui,/visitFamilyLandmark\(name,button\)/);
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

test('World attractions search holds one chunk ticket, caches plans and pauses for player joins',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 assert.match(a,/const plans=new Map<Kind,Block\[\]>/);
 assert.match(a,/const planFor=\(kind:Kind\)=>plans\.get\(kind\)!/);
 assert.match(a,/game\.level\.world\.heightAt\(x,z\)/);
 assert.doesNotMatch(a,/motionBlockingHeight\(x,z\);/);
 assert.match(a,/pending=\{kind,\.\.\.site\}/);
 assert.match(a,/firstCandidateAt=Date\.now\(\)/);
 assert.match(a,/Date\.now\(\)-firstCandidateAt>45000/);
 assert.match(a,/if\(!parked\(\)\)\{/);
 assert.match(a,/if\(ticks%4===0&&state\.work&&parked\(\)\)buildBatch\(\)/);
 assert.match(a,/for\(let yy=Math\.max\(fy,maxY\);yy<=maxY\+h;yy\+\+\)/);
 assert.match(a,/if\(!OPEN\.has\(current\)\)/);
 assert.match(a,/surveyed,rejected,waiting/);
});
test('Only family multiplayer receives lower graphics defaults on weak devices',()=>{
 const patch=read('ops/patch-opuscraft.mjs');
 const p=patch.slice(patch.indexOf("} else if (params.has('gfcJoin'))"),
  patch.indexOf("} else if (params.has('seed')"));
 assert.match(p,/game\.opts\.renderDistance = familyOnPhone \? 3 : 5/);
 assert.match(p,/game\.opts\.simulationDistance = Math\.min\(game\.opts\.simulationDistance, 3\)/);
 assert.match(p,/game\.opts\.graphics = 0/);
 assert.match(p,/game\.opts\.maxFps = Math\.min\(game\.opts\.maxFps, 60\)/);
 assert.match(patch,/location\.search\.includes\('gfcJoin'\)/);
 assert.match(patch,/export const CHUNKS_PER_TICK = 5/);
 assert.match(p,/game\.opts\.particles = 2/);
 assert.match(p,/game\.opts\.entityShadows = false/);
 assert.doesNotMatch(p,/game\.saveOptions\(\)/);
});

test('Dense forest fallback adds buildings above treetops without removing trees or overwriting existing blocks',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 assert.match(a,/const SEARCH_REVISION=3/);
 assert.match(a,/const dir:\[number,number\]\[\]=\[\[1,0\],\[0,1\],\[-1,0\],\[0,-1\]/);
 assert.match(a,/function skySiteAllowed\(kind:Kind,x:number,z:number\):number\|null/);
 assert.match(a,/normal===null&&state\.attempts>=15\?skySiteAllowed/);
 assert.match(a,/for\(const block of planFor\(kind\)\)/);
 assert.match(a,/if\(!OPEN\.has\(nameAt\(x\+block\.x,platform\+block\.y,z\+block\.z\)\)\)return null/);
 assert.match(a,/elevated:normal===null/);
 assert.match(a,/if\(!OPEN\.has\(current\)\)\{/);
 assert.doesNotMatch(a,/deleteWorld|removeChunk|resetWorld/);
});

test('Existing mirrored marquee is repaired only from verified old glyph pixels',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 assert.match(a,/function shape\(kind:Kind,legacyMirrored=false\)/);
 assert.match(a,/legacyMirrored\?col\+x:-\(col\+x\)/);
 assert.match(a,/const oldSign=shape\('names',true\)/);
 assert.match(a,/function repairOriginalMarquee\(\)/);
 assert.match(a,/if\(actual!==b\.was&&actual!==b\.now/);
 assert.match(a,/game\.saveWorld\(\)\.then\(\(\)=>\{/);
 assert.match(a,/marquee-direction-v2/);
 assert.match(a,/signRepairSaving=true/);
});
test('Admin can choose only recorded landmarks, including the current build',()=>{
 const npc=read('ops/gfc-npc.ts'),host=read('ops/opuscraft-host.cjs'),
   server=read('server.cjs'),ui=read('public/app.js'),
   attractions=read('ops/gfc-world-attractions.ts');
 assert.match(attractions,/function destination\(requested\?:string\)/);
 assert.match(attractions,/state\.completed\.find\(s=>s\.kind===requested\)/);
 assert.match(attractions,/state\.work\?\.site\.kind===requested/);
 assert.match(npc,/function visit\(name:string,attraction\?:string\)/);
 assert.match(host,/allowed=\['names','windmill','pinwheels','castle','village','garden','watchtower'\]/);
 assert.match(server,/u\.role!=='admin'/);
 assert.match(server,/JSON\.stringify\(\{from:opusName\(u\),attraction\}\)/);
 assert.match(ui,/data-landmark/);
 assert.match(ui,/admin\/opuscraft\/npc\/visit','POST',\{attraction:name\}/);
});
test('Family chunk radius improves desktop horizon without changing solo worlds',()=>{
 const patch=read('ops/patch-opuscraft.mjs');
 const part=patch.slice(patch.indexOf("} else if (params.has('gfcJoin'))"),
   patch.indexOf("} else if (params.has('seed')"));
 assert.match(part,/renderDistance = familyOnPhone \? 3 : 5/);
 assert.match(patch,/renderDistance = onPhone \? 3 : 5/);
 assert.match(patch,/this\.mode === 'client' \? 1 : LOADING_RADIUS/);
 assert.match(patch,/CHUNKS_PER_TICK = 5/);
});
