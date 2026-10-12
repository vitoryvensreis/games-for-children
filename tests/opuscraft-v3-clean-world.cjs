'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const noFiles=['ops/gfc-world-attractions.ts','ops/gfc-family-town.ts','ops/gfc-site-care.ts',
 'ops/gfc-ground-relocation.ts','ops/gfc-v2-dry-site-repair.ts','ops/gfc-rotors.ts','ops/gfc-chunk-warmup.ts'];
test('V3 starts completely untouched family terrain; never install automatic construction',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),npc=read('ops/gfc-npc.ts'),build=read('ops/build-opuscraft.sh');
 assert.match(patch,/gamesnavagador-family-world-v3/);
 assert.match(patch,/gamesnavagador-exploration-clean-2026-v3/);
 assert.match(npc,/worldAttractions:null/);
 assert.doesNotMatch(patch,/installGfcRotors|__gfcRotorRender|gfc-world-attractions/);
 assert.doesNotMatch(npc,/setBlock\(|installGfcWorldAttractions|installGfcFamilyTown|attractions\?\.tick/);
 for(const name of noFiles){
  assert.equal(fs.existsSync(path.join(__dirname,'..',name)),false,name+' not retired');
  assert.ok(!build.includes(path.basename(name)),name+' still bundled');
 }
});
test('Clean V3 profile is separate and previous family worlds are backed up',()=>{
 const host=read('ops/opuscraft-host.cjs'),deploy=read('ops/deploy-opuscraft-vps.sh');
 assert.match(host,/profile-v3/);
 assert.match(deploy,/opuscraft-family-v2-pre-v3\.tar\.gz/);
 assert.match(deploy,/test -s backup\/opuscraft-family-v2-pre-v3\.tar\.gz/);
 assert.match(deploy,/OPUSCRAFT_V3_CLEAN_WORLD_NO_ATTRACTIONS_OK/);
 assert.doesNotMatch(host,/__npc\/visit|__npc\/recover/);
 assert.doesNotMatch(deploy,/placedAttractions|seven landmarks|OPUSCRAFT_V2_SIGN_SAVED/);
 assert.doesNotMatch(deploy,/rm -rf data\/opuscraft/);
});
test('UI contains no attraction teleport or builder controls, retains player teleport and admin commands',()=>{
 const ui=read('public/app.js');
 for(const name of ['opusLandmarksList','familyLandmarkButtons','recoverFamilyLandmark',
   'data-landmark','opusRecoverPanel','Construções do mapa'])
  assert.equal(ui.includes(name),false,'obsolete UI: '+name);
 assert.match(ui,/opusPlayersList/);
 assert.match(ui,/opusPerfDetails/);
 assert.match(ui,/data-world-time/);
 assert.match(ui,/opusViewDistance/);
 assert.match(ui,/reset-minutes/);
});
