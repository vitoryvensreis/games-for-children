const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const {
 NAME,WIDTH,HEIGHT,LENGTH,B,createFamilyVillage,inspectFamilyVillage,installFamilyVillage
}=require('../database/family-village.cjs');

test('New village uses valid MCGalaxy .lvl format and safe family spawn',()=>{
 const zipped=createFamilyVillage();
 assert.equal(zipped[0],0x1f);assert.equal(zipped[1],0x8b);
 const world=inspectFamilyVillage(zipped);
 assert.deepEqual([world.width,world.height,world.length],[192,96,192]);
 assert.ok(world.rawLength>3_000_000);
 assert.deepEqual(world.spawn,{x:96,y:45,z:91});
 const {x,y,z}=world.spawn;
 assert.equal(world.get(x,y-2,z),B.COBBLE);
 assert.equal(world.get(x,y,z),B.AIR,'Players cannot spawn inside blocks');
 assert.equal(world.get(x,y+1,z),B.AIR);
 assert.equal(world.get(96,0,91),B.BEDROCK);
});

test('New map contains four homes, village square and fountain, water and natural relief',()=>{
 const world=inspectFamilyVillage(createFamilyVillage());
 // Four colored roofs and their wooden floors.
 assert.equal(world.get(70,51,88),B.BLUE);
 assert.equal(world.get(125,51,88),B.RED);
 assert.equal(world.get(76,51,129),B.YELLOW);
 assert.equal(world.get(118,51,128),B.PINK);
 assert.equal(world.get(72,43,90),B.WOOD);
 assert.equal(world.get(103,45,106),B.WATER,'Fountain in square');
 let trees=0,flowers=0,water=0,stone=0;
 let lowest=HEIGHT,highest=0;
 const raw=zlib.gunzipSync(createFamilyVillage());
 const view=raw.subarray(18);
 for(const value of view){if(value===B.LEAVES)trees++;if(value===B.ROSE||value===B.FLOWER)flowers++;if(value===B.WATER)water++;if(value===B.STONE)stone++}
 for(let z=4;z<LENGTH;z+=6)for(let x=4;x<WIDTH;x+=6){
  let surface=0;
  for(let y=HEIGHT-1;y>=0;y--)if(world.get(x,y,z)!==B.AIR){surface=y;break}
  lowest=Math.min(lowest,surface);highest=Math.max(highest,surface);
 }
 assert.ok(trees>900,'Woody forest should cover many blocks');
 assert.ok(flowers>100,'Flowers should decorate fields');
 assert.ok(water>120,'Rivers and lakes should have water');
 assert.ok(stone>150000,'Mountains should have stone');
 assert.ok(highest-lowest>=15,'Terrain should be varied, not flat');
});

test('First installation is atomic and never overwrites a saved family world or aventura',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-family-village-'));
 try{
  const old=path.join(folder,'aventura.lvl');
  fs.writeFileSync(old,'ORIGINAL_PLAYER_BUILDS');
  const first=installFamilyVillage(folder);
  assert.equal(first.created,true);assert.ok(first.bytes>1000);
  assert.equal(path.basename(first.path),NAME+'.lvl');
  const initial=fs.readFileSync(first.path);
  assert.equal(inspectFamilyVillage(initial).width,WIDTH);
  // Existing family world is user data and must be left byte-for-byte unchanged.
  fs.writeFileSync(first.path,'FAMILY_BUILDS_MUST_STAY');
  const second=installFamilyVillage(folder);
  assert.equal(second.created,false);
  assert.equal(fs.readFileSync(first.path,'utf8'),'FAMILY_BUILDS_MUST_STAY');
  assert.equal(fs.readFileSync(old,'utf8'),'ORIGINAL_PLAYER_BUILDS');
  assert.deepEqual(fs.readdirSync(folder).sort(),['aventura.lvl',NAME+'.lvl']);
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
});

test('World is installed before MCGalaxy starts and old world is not deleted',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
 const deploy=fs.readFileSync(path.join(__dirname,'../.github/workflows/deploy.yml'),'utf8');
 assert.match(server,/installFamilyVillage\(path\.join\(MCGALAXY_DIR,'levels'\)\)/);
 assert.match(server,/writeCommand\('\/main '\+destination\)/);
 assert.match(server,/if\(!fs\.existsSync\(world\)\)/);
 assert.doesNotMatch(server,/unlinkSync\(world\)|rmSync\(levels\)/);
 assert.match(deploy,/backup\/mcgalaxy-levels-latest\.tar\.gz/);
});
