'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('V2 construction floors are always above sea level without changing the saved world identity',()=>{
 const town=read('ops/gfc-family-town.ts'),patch=read('ops/patch-opuscraft.mjs');
 assert.match(town,/job\.y=Math\.max\(72,Math\.min\(160,/);
 assert.match(patch,/gamesnavagador-family-world-v2/);
 assert.match(patch,/gamesnavagador-family-planned-2026-v2/);
 assert.match(town,/drySiteRepair:dryRepair\?\.status\(\)/);
});
test('Existing underwater attractions recover at original X and Z with durable copy before source removal',()=>{
 const repair=read('ops/gfc-v2-dry-site-repair.ts'),
  build=read('ops/build-opuscraft.sh');
 assert.match(build,/gfc-v2-dry-site-repair\.ts/);
 assert.match(repair,/const SEA=63, SAFE_Y=SEA\+9, PAD=8/);
 assert.match(repair,/const target=Math\.max\(SAFE_Y,site\.y\)/);
 assert.match(repair,/gfc-v2-dry-site-recovery-v1:/);
 assert.match(repair,/if\(j\.phase==='saveCopy'\)/);
 assert.match(repair,/saveThen\(j,'eraseOld'\)/);
 assert.match(repair,/if\(missing\)/);
 assert.match(repair,/game\.saveWorld\(\)\.then/);
 assert.match(repair,/j\.phase='saveFinal'/);
 assert.match(repair,/site\.y=j\.y/);
});
test('Submerged damaged originals are recoverable, but changed blocks above sea or player edits are protected',()=>{
 const repair=read('ops/gfc-v2-dry-site-repair.ts');
 assert.match(repair,/actual!==name && !\(y<=SEA&&\(actual==='water'\|\|actual==='air'\)\)/);
 assert.match(repair,/blockSite\(j,'construção modificada'\)/);
 assert.match(repair,/game\.level\.world\.heightAt\(x,z\)\+4/);
 assert.match(repair,/if\(highest>230\)/);
 const rotors=read('ops/gfc-rotors.ts');
 assert.match(rotors,/if\(!game\.level\.world\.isLoaded\(xx,legacyZ\)\|\|/);
 assert.match(rotors,/if\(legacyPresent\)continue/);
});

test('Repair avoids changing non-original player blocks and pauses when children are online',()=>{
 const repair=read('ops/gfc-v2-dry-site-repair.ts');
 assert.match(repair,/!game\.inWorld\|\|!game\.spawned\|\|!game\.server\|\|!empty\(\)/);
 assert.match(repair,/construção modificada/);
 assert.match(repair,/blocos protegidos no novo lote/);
 assert.match(repair,/if\(!destination\.has\(p\)&&old\(x,y,z\)===b\.name\)/);
 assert.match(repair,/if\(!SAFE\.has\(existing\)\)/);
 assert.doesNotMatch(repair,/deleteWorld\(|localStorage\.clear\(|regenerateWorld\(|setSeed\(|resetWorld\(/);
});
