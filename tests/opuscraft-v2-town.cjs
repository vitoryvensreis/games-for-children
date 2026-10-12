'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('V2 resets only the family world identity and leaves V1 stored and backed up',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),deploy=read('ops/deploy-opuscraft-vps.sh');
 assert.match(patch,/gamesnavagador-family-world-v2/);
 assert.match(patch,/gamesnavagador-family-planned-2026-v2/);
 assert.match(deploy,/opuscraft-family-v1-pre-v2\.tar\.gz/);
 assert.match(deploy,/test -s backup\/opuscraft-family-v1-pre-v2\.tar\.gz/);
});
test('Permanent seven-landmark town is created by clearing and leveling fixed plots',()=>{
 const build=read('ops/build-opuscraft.sh'),town=read('ops/gfc-family-town.ts'),
  attractions=read('ops/gfc-world-attractions.ts');
 assert.match(build,/gfc-family-town\.ts/);
 assert.match(attractions,/installGfcFamilyTown\(game,planFor\)/);
 for(const kind of ['names','castle','village','windmill','pinwheels','garden','watchtower'])
  assert.ok(town.includes("kind:'"+kind+"'"),kind);
 assert.match(town,/const PAD=5/);
 assert.match(town,/job\.phase==='clear'/);
 assert.match(town,/job\.phase==='foundation'/);
 assert.match(town,/job\.phase==='survey'/);
 assert.match(town,/setBlock\(x,y,z,S\('air'\)\)/);
 assert.match(town,/setBlock\(x,y,z,S\('grass_block'\)\)/);
 assert.match(town,/setBlock\(x,y,z,S\('stone'\)\)/);
 assert.match(town,/game\.saveWorld\(\)\.then/);
 assert.match(town,/const origin=state\.anchor/);
 assert.match(town,/const KEY='gfc-planned-family-v2'/);
 assert.match(town,/placedAttractions:state\.completed\.length/);
 assert.doesNotMatch(town,/function siteAllowed|skySiteAllowed|Math\.random/);
});
