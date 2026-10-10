'use strict';
/**
 * Bloco A — Vila da Família
 *
 * Original block world generated for GamesForChildren.
 * Layout and .lvl format verified against MCGalaxy's LvlExporter/LvlImporter:
 * 18-byte header LE, x + width*(z + length*y), optional 0xBD chunk marker.
 *
 * Safe by construction: installFamilyVillage never overwrites a .lvl file.
 */
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');

const NAME='vila_familia',WIDTH=192,HEIGHT=96,LENGTH=192;
const SURFACE=42,SEA_LEVEL=39;
const B=Object.freeze({
 AIR:0,STONE:1,GRASS:2,DIRT:3,COBBLE:4,WOOD:5,BEDROCK:7,
 WATER:9,SAND:12,GRAVEL:13,LOG:17,LEAVES:18,GLASS:20,
 RED:21,ORANGE:22,YELLOW:23,GREEN:25,BLUE:29,PINK:33,
 WHITE:36,FLOWER:37,ROSE:38,GOLD:41,DOUBLE_SLAB:43,SLAB:44,
 BRICK:45,BOOKS:47,MOSSY:48
});
const CLAMP=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const sq=n=>n*n;
const hash=(x,z,salt=0)=>{
 let n=Math.imul(x+101,374761393)+Math.imul(z+113,668265263)+Math.imul(salt+7,1442695041);
 n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
};

function geometry(){
 const voxels=Buffer.alloc(WIDTH*HEIGHT*LENGTH,B.AIR);
 const alt=new Uint8Array(WIDTH*LENGTH);
 const put=(x,y,z,id)=>{
  if(x<0||x>=WIDTH||z<0||z>=LENGTH||y<0||y>=HEIGHT)return;
  voxels[x+WIDTH*(z+LENGTH*y)]=id;
 };
 const get=(x,y,z)=>(x<0||x>=WIDTH||z<0||z>=LENGTH||y<0||y>=HEIGHT)?B.AIR:voxels[x+WIDTH*(z+LENGTH*y)];
 const cuboid=(x0,y0,z0,x1,y1,z1,id)=>{
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)put(x,y,z,id);
 };
 const valleyAt=(x,z)=>{
  const n=5*Math.sin(x/15)*Math.cos(z/19)+3*Math.sin((x+z)/27)+2.5*Math.cos(z/12);
  const mountain1=29*Math.max(0,1-Math.hypot(x-28,z-145)/40)**1.6;
  const mountain2=24*Math.max(0,1-Math.hypot(x-161,z-163)/34)**1.7;
  const ridge=9*Math.max(0,(Math.abs(x-96)-64)/32);
  const raw=41+n+mountain1+mountain2+ridge;
  const plazaDistance=Math.hypot(x-97,z-106);
  const plazaBlend=CLAMP((plazaDistance-37)/9,0,1);
  let h=SURFACE*(1-plazaBlend)+raw*plazaBlend;

  // Continuous river north of the village, with sandy banks.
  const river=Math.abs(z-(45+9*Math.sin(x/23)+3*Math.sin(x/7)));
  const bank=CLAMP((river-4)/9,0,1);
  if(bank<1)h=h*bank+(33+bank*5)*(1-bank);

  // Pond beyond the village, nested in a gentle sandy beach.
  const lake=Math.hypot((x-150)*1.0,(z-128)*1.15);
  const pondBlend=CLAMP((lake-14)/8,0,1);
  if(pondBlend<1)h=h*pondBlend+(35+pondBlend*4)*(1-pondBlend);
  const shore=(river<13||lake<23);
  return {h:CLAMP(Math.round(h),23,76),shore,underwater:(river<8||lake<18)};
 };

 // Terrain, stone strata, shallow lakes and coastlines.
 for(let z=0;z<LENGTH;z++)for(let x=0;x<WIDTH;x++){
  const t=valleyAt(x,z),h=t.h;
  alt[z*WIDTH+x]=h;
  put(x,0,z,B.BEDROCK);
  for(let y=1;y<=h;y++){
   const top=y===h;
   put(x,y,z,top?(t.shore?B.SAND:h>63?B.WHITE:B.GRASS):y>=h-3?B.DIRT:B.STONE);
  }
  if(t.underwater&&h<SEA_LEVEL)for(let y=h+1;y<=SEA_LEVEL;y++)put(x,y,z,B.WATER);
  if(h>65&&hash(x,z)>0.6)put(x,h,z,B.WHITE);
 }
 const terrainHeight=(x,z)=>alt[z*WIDTH+x];
 const Y=SURFACE+1;
 const footprint=(x0,z0,x1,z1)=>{
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)put(x,Y,z,B.COBBLE);
 };
 const line=(x0,z0,x1,z1,width=2)=>{
  const steps=Math.max(Math.abs(x1-x0),Math.abs(z1-z0));
  for(let i=0;i<=steps;i++){
   const x=Math.round(x0+(x1-x0)*i/steps),z=Math.round(z0+(z1-z0)*i/steps);
   for(let dz=-width;dz<=width;dz++)for(let dx=-width;dx<=width;dx++)if(Math.abs(dx)+Math.abs(dz)<=width+1)put(x+dx,Y,z+dz,B.COBBLE);
  }
 };
 const oak=(x,z,h)=>{
  const y=terrainHeight(x,z);
  if(y<SEA_LEVEL||y>=71)return;
  for(let t=1;t<=h;t++)put(x,y+t,z,B.LOG);
  for(let dy=-2;dy<=2;dy++){
   const radius=dy===2?1:dy===-2?2:3;
   for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    if(dx*dx+dz*dz>radius*radius+hash(x+dx,z+dz,dy)*2)continue;
    if(dx===0&&dz===0&&dy<1)continue;
    const xx=x+dx,zz=z+dz,yy=y+h-1+dy;
    if(get(xx,yy,zz)===B.AIR)put(xx,yy,zz,B.LEAVES);
   }
  }
 };

 // Natural woodland and flowering plains.
 for(let z=9;z<LENGTH-9;z+=6)for(let x=9;x<WIDTH-9;x+=6){
  const rx=x+Math.floor(hash(x,z,3)*5),rz=z+Math.floor(hash(x,z,4)*5);
  const y=terrainHeight(rx,rz);
  const aroundVillage=Math.hypot(rx-97,rz-106);
  if(aroundVillage<47||aroundVillage>175||y<40||y>=66)continue;
  const slope=Math.max(Math.abs(y-terrainHeight(rx-2,rz)),Math.abs(y-terrainHeight(rx,rz-2)));
  if(slope<=3&&hash(x,z,8)>.49)oak(rx,rz,3+Math.floor(hash(x,z,5)*4));
 }
 for(let z=8;z<LENGTH-8;z+=3)for(let x=8;x<WIDTH-8;x+=3){
  if(Math.hypot(x-97,z-106)<35)continue;
  const y=terrainHeight(x,z);
  if(y>SEA_LEVEL+1&&y<56&&hash(x,z,12)>.69&&get(x,y+1,z)===B.AIR)put(x,y+1,z,hash(x,z,13)>.5?B.FLOWER:B.ROSE);
 }

 // The village hub occupies a level plateau and is already safe for new players.
 footprint(87,94,109,114);
 line(97,94,97,78,2);line(87,103,78,103,2);
 line(109,103,120,103,2);line(97,114,97,133,2);
 line(78,102,76,89,2);line(120,102,124,89,2);
 line(97,131,85,131,2);line(98,132,117,132,2);

 // Decorative central fountain. Spawn is safely outside the fountain.
 cuboid(99,Y+1,103,105,Y+1,109,B.COBBLE);
 cuboid(100,Y+2,104,104,Y+2,108,B.SLAB);
 cuboid(101,Y+2,105,103,Y+2,107,B.WATER);
 cuboid(102,Y+2,106,102,Y+5,106,B.STONE);
 put(102,Y+6,106,B.GOLD);
 // Gardens on the plaza sides.
 for(const [x,z] of [[90,97],[92,113],[108,97],[108,113],[87,109],[110,108]]){
  put(x,Y+1,z,B.GRASS);put(x,Y+2,z,(x+z)%2?B.FLOWER:B.ROSE);
 }
 // Lamp posts, with bright blocks and glass details.
 for(const [x,z] of [[87,94],[109,94],[87,114],[109,114]]){
  for(let y=Y+1;y<=Y+4;y++)put(x,y,z,B.LOG);
  put(x,Y+5,z,B.GOLD);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])put(x+dx,Y+5,z+dz,B.GLASS);
 }

 function house(x,z,w,d,color,doorSide){
  const x1=x+w-1,z1=z+d-1,roofY=Y+7;
  cuboid(x,Y,z,x1,Y,z1,B.WOOD);
  for(let y=Y+1;y<=Y+5;y++){
   for(let xx=x;xx<=x1;xx++){put(xx,y,z,B.WOOD);put(xx,y,z1,B.WOOD)}
   for(let zz=z;zz<=z1;zz++){put(x,y,zz,B.WOOD);put(x1,y,zz,B.WOOD)}
  }
  for(const xx of [x,x1])for(const zz of [z,z1])cuboid(xx,Y+1,zz,xx,Y+6,zz,B.LOG);
  for(let xx=x-1;xx<=x1+1;xx++)for(let zz=z-1;zz<=z1+1;zz++){
   put(xx,roofY,zz,color);
   if(xx>=x+1&&xx<=x1-1&&zz>=z+1&&zz<=z1-1)put(xx,roofY+1,zz,color);
  }
  const doorX=doorSide==='east'?x1:doorSide==='west'?x:Math.floor((x+x1)/2);
  const doorZ=doorSide==='north'?z:doorSide==='south'?z1:Math.floor((z+z1)/2);
  put(doorX,Y+1,doorZ,B.AIR);put(doorX,Y+2,doorZ,B.AIR);
  for(const yy of [Y+2,Y+3]) {
   if(doorSide==='east'||doorSide==='west'){
    put(doorX,Y+2,z+2,B.GLASS);put(doorX,Y+2,z1-2,B.GLASS);
   } else {
    put(x+2,Y+2,doorZ,B.GLASS);put(x1-2,Y+2,doorZ,B.GLASS);
   }
  }
  // Interior table, shelving, hearth and furniture without gameplay obstacles at the door.
  cuboid(x+2,Y+1,z+2,x+3,Y+2,z+2,B.BOOKS);
  cuboid(x1-3,Y+1,z1-2,x1-2,Y+1,z1-2,B.WOOD);
  put(x1-3,Y+2,z1-2,B.SLAB);
  return {doorX,doorZ};
 }
 house(66,84,14,13,B.BLUE,'east');
 house(121,84,14,13,B.RED,'west');
 house(71,125,15,13,B.YELLOW,'east');
 house(111,124,17,13,B.PINK,'north');
 // Colorful flagpole by the village gate.
 cuboid(96,Y+1,76,96,Y+10,76,B.LOG);
 for(let yy=Y+7;yy<=Y+10;yy++)for(let xx=97;xx<=102;xx++)put(xx,yy,76,(xx+yy)%2?B.YELLOW:B.BLUE);

 // A small wooden bridge over the northern river, useful for exploration.
 for(let x=91;x<=102;x++){
  const rz=Math.round(45+9*Math.sin(x/23)+3*Math.sin(x/7));
  for(let z=rz-9;z<=rz+9;z++){
   put(x,SEA_LEVEL+2,z,B.WOOD);
   if(x===91||x===102)put(x,SEA_LEVEL+3,z,B.LOG);
  }
 }
 // Rustic watchtower east of the village, overlooking the lake.
 const tx=143,tz=89,ty=terrainHeight(tx,tz)+1;
 for(const xx of [tx-4,tx+4])for(const zz of [tz-4,tz+4])cuboid(xx,ty,zz,xx,ty+9,zz,B.LOG);
 cuboid(tx-5,ty+8,tz-5,tx+5,ty+8,tz+5,B.WOOD);
 cuboid(tx-6,ty+11,tz-6,tx+6,ty+11,tz+6,B.BRICK);
 for(const xx of [tx-5,tx+5])for(let zz=tz-5;zz<=tz+5;zz++)put(xx,ty+9,zz,B.LOG);
 for(const zz of [tz-5,tz+5])for(let xx=tx-5;xx<=tx+5;xx++)put(xx,ty+9,zz,B.LOG);
 for(let yy=ty;yy<ty+9;yy++)put(tx-3,yy,tz-3,B.WOOD);

 // Give children a stable, open, paved spawn near the fountain.
 const spawn={x:96,y:Y+2,z:91};
 for(let xx=spawn.x-2;xx<=spawn.x+2;xx++)for(let zz=spawn.z-2;zz<=spawn.z+2;zz++){
  put(xx,Y,zz,B.COBBLE);
  for(let yy=Y+1;yy<=Y+3;yy++)put(xx,yy,zz,B.AIR);
 }
 return {voxels,spawn,blocks:B,width:WIDTH,height:HEIGHT,length:LENGTH};
}

function createFamilyVillage(){
 const {voxels,spawn}=geometry();
 const header=Buffer.alloc(18,0);
 header.writeUInt16LE(1874,0);
 header.writeUInt16LE(WIDTH,2);header.writeUInt16LE(LENGTH,4);header.writeUInt16LE(HEIGHT,6);
 header.writeUInt16LE(spawn.x,8);header.writeUInt16LE(spawn.z,10);header.writeUInt16LE(spawn.y,12);
 header[14]=0;header[15]=0;header[16]=0;header[17]=0;
 // The 0xBD optional-block section is intentionally absent: all blocks are vanilla
 // Classic IDs (< 50), compatible with the browser client and MCGalaxy importer.
 return zlib.gzipSync(Buffer.concat([header,voxels]),{level:7});
}
function inspectFamilyVillage(buffer){
 const bytes=zlib.gunzipSync(buffer);
 const magic=bytes.readUInt16LE(0);
 const w=bytes.readUInt16LE(2),length=bytes.readUInt16LE(4),height=bytes.readUInt16LE(6);
 if(magic!==1874||bytes.length!==18+w*length*height)throw Error('Invalid MCGalaxy .lvl map');
 const spawn={x:bytes.readUInt16LE(8),z:bytes.readUInt16LE(10),y:bytes.readUInt16LE(12)};
 const get=(x,y,z)=>bytes[18+x+w*(z+length*y)];
 return {width:w,height,length,spawn,get,rawLength:bytes.length};
}
function installFamilyVillage(folder){
 fs.mkdirSync(folder,{recursive:true});
 const target=path.join(folder,NAME+'.lvl');
 if(fs.existsSync(target))return {path:target,created:false};
 const file=createFamilyVillage();
 const tmp=target+'.'+process.pid+'.tmp';
 try{
  fs.writeFileSync(tmp,file,{flag:'wx',mode:0o600});
  // Single writer expected: .lvl is only seeded before MCGalaxy process starts.
  // Recheck target so existing family creations are never overwritten.
  if(fs.existsSync(target)){fs.unlinkSync(tmp);return {path:target,created:false}}
  fs.renameSync(tmp,target);
 }catch(err){try{fs.unlinkSync(tmp)}catch{};throw err}
 return {path:target,created:true,bytes:file.length};
}
module.exports={NAME,WIDTH,HEIGHT,LENGTH,B,geometry,createFamilyVillage,inspectFamilyVillage,installFamilyVillage};
