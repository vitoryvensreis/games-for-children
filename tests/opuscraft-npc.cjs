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
 assert.match(a,/state\.work=\{site:\{kind,x,y:platformY,z,elevated:false\},cursor:0\}/);
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
 assert.match(a,/put\(tildeX\*4,9,-1,'lime_concrete'\)/);
 const rotors=read('ops/gfc-rotors.ts');
 assert.match(rotors,/pose\.rotZ\(time\+arm\*90\)/);
 assert.match(rotors,/r\.items\.renderBlockState\(b,pose,material\)/);
 assert.match(a,/function retireVoxelBlades\(\)/);
 assert.match(a,/game\.chunks\.setTicket\('gfc-landmarks'/);
 assert.match(a,/game\.chunks\.setTicket\('gfc-rotor-cleanup'/);
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
test('Only explicit family multiplayer uses lightweight graphics without changing solo settings',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),family=read('ops/gfc-family-client.ts');
 assert.match(patch,/await actions\.preflight\(\)/);
 assert.match(patch,/actions\.prepare\(\)/);
 assert.match(patch,/prepareFamilyClient\(game\)/);
 assert.match(family,/game\.opts\.renderDistance = mobile \? 2 : 3/);
 assert.match(family,/game\.opts\.simulationDistance = Math\.min\(game\.opts\.simulationDistance, 1\)/);
 assert.match(family,/game\.opts\.graphics = 0/);
 assert.match(family,/game\.opts\.maxFps = Math\.min\(game\.opts\.maxFps, mobile \? 30 : 40\)/);
 assert.match(family,/game\.opts\.particles = 0/);
 assert.match(family,/game\.opts\.entityShadows = false/);
 assert.doesNotMatch(family,/game\.saveOptions\(\)/);
});

test('Never create new floating structures after a failed terrain survey',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 assert.match(a,/const SEARCH_REVISION=3/);
 assert.match(a,/const platformY=normal;/);
 assert.match(a,/elevated:false/);
 assert.doesNotMatch(a,/skySiteAllowed/);
 assert.match(a,/if\(!OPEN\.has\(current\)\)\{/);
 assert.doesNotMatch(a,/deleteWorld|removeChunk|resetWorld/);
});

test('Existing mirrored marquee is repaired only from verified old glyph pixels',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 assert.match(a,/function shape\(kind:Kind,legacyMirrored=false\)/);
 assert.match(a,/legacyMirrored\?col\+x:-\(col\+x\)/);
 assert.match(a,/const oldSign=shape\('names',true\)/);
 assert.match(a,/function repairOriginalMarquee\(\)/);
 assert.match(a,/return actual!==b\.was&&actual!==b\.now/);
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
 const family=read('ops/gfc-family-client.ts');
 assert.match(family,/game\.opts\.renderDistance = mobile \? 2 : 3/);
 assert.match(patch,/actions\.prepare\(\)/);
 assert.match(patch,/this\.mode === 'client' \? 1 : LOADING_RADIUS/);
 assert.match(patch,/CHUNKS_PER_TICK = 4/);
 assert.match(patch,/this\.chunks\.renderDistance\+\+/);
 assert.match(patch,/this\.ticks % 100 === 0/);
});

test('Floating structures are migrated with two durable save checkpoints and natural-tree-only clearance',()=>{
 const s=read('ops/gfc-ground-relocation.ts'),host=read('ops/gfc-world-attractions.ts');
 const build=read('ops/build-opuscraft.sh');
 assert.match(build,/gfc-ground-relocation\.ts/);
 assert.match(s,/phase:'fill'\|'copy'\|'saveNew'\|'erase'\|'saveOld'/);
 assert.match(s,/const TREE=/);
 assert.match(s,/if\(!removable\(n\)\)return null/);
 assert.match(s,/job\.phase==='saveNew'\|\|job\.phase==='saveOld'/);
 assert.match(s,/void game\.saveWorld\(\)\.then/);
 assert.match(s,/if\(now===b\.name\)game\.level\.setBlock\(x,y,z,S\('air'\)\)/);
 assert.match(s,/if\(!removable\(now\)\)/);
 assert.match(s,/state\.completed\[index\]=\{\.\.\.to\}/);
 assert.match(host,/grounding\.tick\(\)/);
 assert.match(s,/setTicket\('gfc-old-attraction'/);
 assert.match(s,/Carregando construção original/);
 assert.match(s,/s\.elevated===true/);
 assert.match(s,/state\.blockedKinds=/);
 assert.match(host,/blockedKinds:Array\.isArray\(data\.blockedKinds\)/);
 assert.doesNotMatch(s,/indexedDB\.deleteDatabase|deleteWorld|resetWorld/);
});
test('Automated attractions are flattened and de-forested at their original X/Z with durable checkpoints',()=>{
 const s=read('ops/gfc-site-care.ts'),host=read('ops/gfc-world-attractions.ts'),
  build=read('ops/build-opuscraft.sh'),ui=read('public/app.js');
 assert.match(build,/gfc-site-care\.ts/);
 assert.match(host,/installGfcSiteCare/);
 assert.match(host,/if\(state\.relocation\)grounding\.tick\(\)/);
 assert.match(host,/else siteCare\.tick\(\)/);
 assert.match(host,/terrainCare:siteCare\.status\(\)/);
 assert.match(host,/caredSites:Array\.isArray\(data\.caredSites\)/);
 assert.match(host,/careBlocked:Array\.isArray\(data\.careBlocked\)/);
 assert.match(s,/const PAD=3/);
 assert.match(s,/const TREE=/);
 assert.match(s,/const targetY=moving\?top:s\.y/);
 assert.match(s,/x:s\.x\+b\.x,y:j\.targetY\+b\.y,z:s\.z\+b\.z|x:j\.site\.x\+b\.x,y:j\.targetY\+b\.y,z:j\.site\.z\+b\.z/);
 assert.match(s,/if\(p===n\)continue/);
 assert.match(s,/if\(!natural\(now\)\)/);
 assert.match(s,/if\(!parked\(\)\|\|!canStart\(\)\)/);
 assert.match(s,/game\.saveWorld\(\)\.then/);
 assert.match(s,/j\.phase==='saveNew'&&j\.moving/);
 assert.match(s,/j\.phase='eraseOld'/);
 assert.match(s,/entry\.y=j\.targetY/);
 assert.match(s,/state\.siteCare=null;persist\(\)/);
 assert.match(ui,/npc\.worldAttractions\.terrainCare/);
 assert.doesNotMatch(s,/deleteWorld|resetWorld|rmSync|unlinkSync/);
});

test('Frame budget and rotor animations avoid block-by-block updates during player visits',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),rotors=read('ops/gfc-rotors.ts'),
  host=read('ops/gfc-world-attractions.ts'),server=read('server.cjs');
 assert.match(patch,/const ratio = family \? \(mobile \? 0\.62 : 0\.60\) : 1/);
 assert.match(patch,/Math\.min\(2,this\.opts\.renderDistance\)/);
 assert.match(patch,/export const CHUNKS_PER_TICK = 4/);
 assert.match(patch,/__gfcRotorRender\?\.\(this,cam\)/);
 assert.match(rotors,/performance\.now\(\)/);
 assert.match(rotors,/pose\.rotZ\(time\+arm\*90\)/);
 assert.match(rotors,/r\.items\.renderBlockState\(b,pose,material\)/);
 assert.doesNotMatch(host,/if\(close\)animate\(\)|if\(pinClose\)animatePinwheels\(\)/);
 assert.match(host,/rotorSaving=true/);
 assert.match(host,/game\.saveWorld\(\)\.then/);
 assert.match(server,/pathname==='\/api\/opuscraft\/landmarks'/);
});
