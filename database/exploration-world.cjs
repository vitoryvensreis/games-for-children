'use strict';
/**
 * A larger, separately saved exploration world. 384x112x384 (~4x the surface
 * area of the original family village). Not infinite: ClassiCube loads whole maps.
 * Initial generation happens ONLY if levels/exploracao.lvl does not exist.
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const NAME='exploracao',WIDTH=384,HEIGHT=112,LENGTH=384;
const B={AIR:0,STONE:1,GRASS:2,DIRT:3,COBBLE:4,WOOD:5,BEDROCK:7,WATER:9,SAND:12,LOG:17,LEAVES:18,GLASS:20,WHITE:36,ROSE:38,FLOWER:37,BRICK:45};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function noise(x,z,seed=1){let n=Math.imul(x+543,374761393)^Math.imul(z+1007,668265263)^Math.imul(seed+17,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296}
function generate(){
 const blocks=Buffer.alloc(WIDTH*HEIGHT*LENGTH,0),top=new Uint8Array(WIDTH*LENGTH),sea=39;
 const idx=(x,y,z)=>x+WIDTH*(z+LENGTH*y);
 const put=(x,y,z,b)=>{if(x>=0&&x<WIDTH&&z>=0&&z<LENGTH&&y>=0&&y<HEIGHT)blocks[idx(x,y,z)]=b};
 const get=(x,y,z)=>(x>=0&&x<WIDTH&&z>=0&&z<LENGTH&&y>=0&&y<HEIGHT)?blocks[idx(x,y,z)]:0;
 const height=(x,z)=>{
  const hills=5*Math.sin(x/23)*Math.cos(z/30)+4*Math.sin((x-z)/37)+4*Math.cos(z/17);
  const alpine=34*Math.max(0,1-Math.hypot((x-290)/65,(z-280)/73))**1.5;
  const ridge=19*Math.max(0,1-Math.abs(x-91)/55)*Math.max(0,1-Math.abs(z-312)/92);
  const dune=3*Math.sin(x/13)*Math.sin(z/12);
  const r=Math.abs(z-(87+19*Math.sin(x/45)+7*Math.sin(x/16)));
  const natural=46+hills+alpine+ridge+dune;
  const river=clamp((r-5)/10,0,1);
  const waterBasin=Math.hypot((x-282)/1.0,(z-112)/1.2);
  const lake=clamp((waterBasin-24)/14,0,1);
  const raw=natural*river+(32+river*5)*(1-river);
  const lowered=raw*lake+(34+lake*4)*(1-lake);
  const spawn=Math.max(Math.abs(x-191),Math.abs(z-190));
  return clamp(Math.round(lowered*(clamp((spawn-18)/13,0,1))+45*(1-clamp((spawn-18)/13,0,1))),25,94);
 };
 for(let z=0;z<LENGTH;z++)for(let x=0;x<WIDTH;x++){
  const h=height(x,z),shore=h<41;top[z*WIDTH+x]=h;
  put(x,0,z,B.BEDROCK);
  for(let y=1;y<=h;y++)put(x,y,z,y===h?(h>67?B.WHITE:shore?B.SAND:B.GRASS):y>h-4?B.DIRT:B.STONE);
  if(h<sea)for(let y=h+1;y<=sea;y++)put(x,y,z,B.WATER);
 }
 const shrub=(x,z)=>{
  const y=top[z*WIDTH+x];if(y<41||y>80||Math.hypot(x-191,z-190)<32)return;
  const trunk=3+Math.floor(noise(x,z,6)*3);
  for(let d=1;d<=trunk;d++)put(x,y+d,z,B.LOG);
  for(let d=-2;d<=2;d++)for(let zz=-2;zz<=2;zz++)for(let xx=-2;xx<=2;xx++){
   if(xx*xx+zz*zz+d*d*.85>7.7||noise(x+xx,z+zz,d)<.08)continue;
   if(get(x+xx,y+trunk+d,z+zz)===0)put(x+xx,y+trunk+d,z+zz,B.LEAVES);
  }
 };
 for(let z=12;z<LENGTH-12;z+=6)for(let x=12;x<WIDTH-12;x+=6){
  const rx=x+Math.floor(noise(x,z)*5),rz=z+Math.floor(noise(x,z,2)*5);
  const y=top[rz*WIDTH+rx];
  if(noise(x,z,15)>.49&&Math.abs(y-top[rz*WIDTH+rx+2])<4)shrub(rx,rz);
  else if(y>41&&y<66&&noise(x,z,8)>.45)put(rx,y+1,rz,noise(x,z,9)>.5?B.ROSE:B.FLOWER);
 }
 // Safe spawn, roads, lanterns, outlook tower and four exploration huts.
 const spawn={x:191,z:190,y:48};
 const cuboid=(x0,y0,z0,x1,y1,z1,b)=>{for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)put(x,y,z,b)};
 cuboid(183,46,182,199,46,199,B.COBBLE);
 const pathTo=(x0,z0,x1,z1)=>{const n=Math.max(Math.abs(x1-x0),Math.abs(z1-z0));for(let i=0;i<=n;i++){const x=Math.round(x0+(x1-x0)*i/n),z=Math.round(z0+(z1-z0)*i/n);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)put(x+dx,46,z+dz,B.COBBLE)}};
 pathTo(191,191,191,169);pathTo(191,191,216,191);
 const hut=(x,z,c)=>{
  const y=top[z*WIDTH+x]+1;
  cuboid(x,y,z,x+8,y,z+8,B.WOOD);
  for(let k=y+1;k<=y+4;k++){for(let a=x;a<=x+8;a++){put(a,k,z,B.WOOD);put(a,k,z+8,B.WOOD)}for(let a=z;a<=z+8;a++){put(x,k,a,B.WOOD);put(x+8,k,a,B.WOOD)}}
  cuboid(x-1,y+5,z-1,x+9,y+5,z+9,c);
  put(x+4,y+1,z,0);put(x+4,y+2,z,0);
  for(const zz of [z+2,z+6]){put(x,y+3,zz,B.GLASS);put(x+8,y+3,zz,B.GLASS)}
 };
 hut(150,148,B.BRICK);hut(237,175,B.COBBLE);hut(303,216,B.WOOD);hut(73,237,B.BRICK);
 cuboid(215,47,183,219,57,187,B.LOG);cuboid(213,58,181,221,58,189,B.WOOD);
 const header=Buffer.alloc(18);header.writeUInt16LE(1874,0);
 header.writeUInt16LE(WIDTH,2);header.writeUInt16LE(LENGTH,4);header.writeUInt16LE(HEIGHT,6);
 header.writeUInt16LE(spawn.x,8);header.writeUInt16LE(spawn.z,10);header.writeUInt16LE(spawn.y,12);
 return zlib.gzipSync(Buffer.concat([header,blocks]),{level:6});
}
function install(folder){
 fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,NAME+'.lvl');
 if(fs.existsSync(file))return {created:false,path:file};
 const bytes=generate(),temporary=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temporary,bytes,{flag:'wx',mode:0o600});if(fs.existsSync(file)){fs.unlinkSync(temporary);return {created:false,path:file}}fs.renameSync(temporary,file)}catch(e){try{fs.unlinkSync(temporary)}catch{};throw e}
 return {created:true,path:file,bytes:bytes.length};
}
module.exports={NAME,WIDTH,HEIGHT,LENGTH,generate,install};
