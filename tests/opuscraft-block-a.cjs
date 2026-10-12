'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('V2 warms fixed attractions, spawn and paths without touching private worlds',()=>{
 const warm=read('ops/gfc-chunk-warmup.ts'),town=read('ops/gfc-family-town.ts');
 assert.match(warm,/function warmupTargets|export function warmupTargets/);
 assert.match(warm,/const GROUP_RADIUS=1/);
 assert.match(warm,/const MAX_GROUPS=36/);
 assert.match(warm,/const KEY_PREFIX='gfc-v2-warm-cache:'/);
 assert.match(warm,/site\.kind==='names'/);
 assert.match(warm,/if\(players\)\{reason='Pausado enquanto a família joga';release\(\);return\}/);
 assert.match(warm,/if\(game\.meta\?\.id!=='gamesnavagador-family-world-v2'/);
 assert.match(warm,/c\.modified=true/);
 assert.match(warm,/game\.saveWorld\(\)\.then\(\(\)=>/);
 assert.match(warm,/state\.done\+\+/);
 assert.match(warm,/persist\(\);busy=false/);
 assert.match(warm,/game\.chunks\.setTicket\('gfc-v2-warm-cache'/);
 assert.match(warm,/release\(\)/);
 assert.doesNotMatch(warm,/resetWorld|deleteWorld|removeWorld|localStorage\.clear\(/);
 assert.match(town,/state\.completed\.length===TOWN\.length/);
 assert.match(town,/installGfcChunkWarmup\(game,origin,state\.completed\)/);
 assert.match(town,/prewarm:warmup\?\.status\(\)/);
});
test('ADM receives honest host FPS/chunk metrics and sees device measurements only in multiplayer',()=>{
 const npc=read('ops/gfc-npc.ts'),ui=read('public/app.js'),
  build=read('ops/build-opuscraft.sh');
 assert.match(build,/gfc-chunk-warmup\.ts/);
 for(const expression of ['frameTimeMs','pendingGen()','stats.gens','stats.meshes','world.chunks.size'])
  assert.ok(npc.includes(expression),expression);
 assert.match(ui,/opusPerfDetails/);
 assert.match(ui,/opusPerfClient/);
 assert.match(ui,/opusPerfHost/);
 assert.match(ui,/me\?\.role==='admin'/);
 assert.match(ui,/g\?\.mode==='client'/);
 assert.match(ui,/prewarm\.savedWindows/);
 assert.match(ui,/prewarm\.savedChunks/);
});
