'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {NAME,WIDTH,HEIGHT,LENGTH,generate,install}=require('../database/mining-world.cjs');
const {verifyLevel,WORLDS}=require('../database/minecraft-control.cjs');
test('Dedicated mining world has valid Classic map, caves and actual coal/iron/gold',()=>{
 const result=generate(),info=verifyLevel(result.file);
 assert.equal(NAME,'mineracao');
 assert.deepEqual([info.width,info.height,info.length],[384,112,384]);
 assert.ok(result.veins.coal>100,'coal available');
 assert.ok(result.veins.iron>80,'iron available');
 assert.ok(result.veins.gold>20,'gold available');
 assert.ok(result.caves>1000,'underground caves');
 const raw=zlib.gunzipSync(result.file);
 const ore={14:0,15:0,16:0};
 for(const b of raw.subarray(18)){if(b===14||b===15||b===16)ore[b]++}
 assert.ok(ore[14]>0&&ore[15]>0&&ore[16]>0);
 assert.equal(raw[18+191+WIDTH*(190+LENGTH*48)],0,'safe open spawn');
});
test('Mining map is generated only once, never overwriting a saved build',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-mining-'));
 try{
  assert.equal(install(dir).created,true);
  fs.writeFileSync(path.join(dir,'mineracao.lvl'),'BUILDS_STAY');
  assert.equal(install(dir).created,false);
  assert.equal(fs.readFileSync(path.join(dir,'mineracao.lvl'),'utf8'),'BUILDS_STAY');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('MCGalaxy mining is server-authoritative and villagers actively wander',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../plugins/family-play/FamilyPlay.cs'),'utf8');
 const menu=fs.readFileSync(path.join(__dirname,'../public/classicube/family-menu.js'),'utf8');
 const backend=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
 assert.match(s,/OnBlockChangingEvent\.Register\(MiningChange, Priority\.Low\)/);
 assert.match(s,/p\.level\.GetBlock\(x,y,z\)/,'Resource determined from block actually present on server');
 assert.match(s,/required>b\.Tool/,'Ore mining requires better pickaxe');
 assert.match(s,/b\.Iron<2/,'Portals require genuinely mined resources');
 assert.match(s,/gfc-mining-inventory\.tsv/);
 assert.match(s,/WanderBots\(\)/);
 assert.match(s,/bot\.movement=true/);
 assert.match(s,/bot\.TargetPos=new Position/);
 assert.match(s,/gfc-family-bot-movement\.status/);
 assert.match(menu,/data-action="mining"/);
 assert.match(menu,/data-action="craft"/);
 assert.match(backend,/installMiningWorld/);
 assert.ok(WORLDS.mineracao);
});
