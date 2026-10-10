'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {NAME,WIDTH,HEIGHT,LENGTH,generate,install}=require('../database/exploration-world.cjs');
const {verifyLevel}=require('../database/minecraft-control.cjs');
test('Exploration world is around 4x larger with terrain variation and valid MCGalaxy map headers',()=>{
 const bytes=generate(),stats=verifyLevel(bytes);
 assert.equal(NAME,'exploracao');
 assert.deepEqual([stats.width,stats.height,stats.length],[384,112,384]);
 assert.ok(WIDTH*LENGTH>=4*(192*192));
 const raw=zlib.gunzipSync(bytes);
 assert.equal(raw.length,18+WIDTH*HEIGHT*LENGTH);
 const offset=(x,y,z)=>18+x+WIDTH*(z+LENGTH*y);
 assert.equal(raw[offset(191,46,190)],4,'Spawn base has cobble flooring');
 assert.equal(raw[offset(191,48,190)],0,'Spawn is clear of blocks');
 let water=0,trees=0,white=0;
 for(const v of raw.subarray(18)){if(v===9)water++;if(v===18)trees++;if(v===36)white++}
 assert.ok(water>200&&trees>200&&white>50,'Mountains, snow, woods and water exist');
});
test('Exploration creates its .lvl once, leaving user constructions untouched',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-explore-'));
 try{
  const first=install(root);assert.equal(first.created,true);
  assert.equal(first.path,path.join(root,'exploracao.lvl'));
  fs.writeFileSync(first.path,'KEPT_CUSTOM_BLOCKS');
  const second=install(root);assert.equal(second.created,false);
  assert.equal(fs.readFileSync(first.path,'utf8'),'KEPT_CUSTOM_BLOCKS');
 }finally{fs.rmSync(root,{force:true,recursive:true})}
});
test('New Minecraft features use server-authoritative bot/weather/survival APIs',()=>{
 const plugin=fs.readFileSync(path.join(__dirname,'../plugins/family-play/FamilyPlay.cs'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
 const menu=fs.readFileSync(path.join(__dirname,'../public/classicube/family-menu.js'),'utf8');
 const hud=fs.readFileSync(path.join(__dirname,'../public/classicube/survival-hud.js'),'utf8');
 assert.match(plugin,/WalkInstruction\(\)\.Parse/);
 assert.match(plugin,/SetModel\(models\[a\]\)/);
 assert.match(plugin,/PlayerBot\.Add\(animal\)/);
 assert.match(plugin,/level\.Config\.Weather=raining\?1:0/);
 assert.match(plugin,/level\.Config\.SkyColor=sky\[phase\]/);
 assert.match(plugin,/player\.SendCurrentEnv\(\)/);
 assert.match(plugin,/gfc-survival\.tsv/);
 assert.match(plugin,/if\(cmd=="comer"\)/);
 assert.match(server,/installExplorationWorld/);
 assert.match(server,/api\/minecraft\/survival/);
 assert.match(menu,/data-action="exploracao"/);
 assert.match(menu,/\/familia comer/);
 assert.match(hud,/mc-vitals-icons/);
});
