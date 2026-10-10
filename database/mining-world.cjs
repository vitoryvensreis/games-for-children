'use strict';
/**
 * A dedicated, finite, multiplayer-safe mining world.
 * ClassiCube Classic protocol loads a bounded map, not infinite chunks.
 * Seeding is atomic and never overwrites worlds after children have built.
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {generate:generateExploration,WIDTH,HEIGHT,LENGTH}=require('./exploration-world.cjs');
const NAME='mineracao';
const idx=(x,y,z)=>18+x+WIDTH*(z+LENGTH*y);
const hash=(x,y,z)=>{
 let n=Math.imul(x+53,374761393)^Math.imul(y+71,1442695041)^Math.imul(z+103,668265263);
 n=Math.imul(n^(n>>>13),1274126177);
 return ((n^(n>>>16))>>>0)/4294967296;
};
function generate(){
 const raw=zlib.gunzipSync(generateExploration());
 // Keep original header and safe spawn. Place ore only inside genuine stone,
 // so the hills, houses, forests and rivers stay unchanged.
 let veins={coal:0,iron:0,gold:0},caves=0;
 for(let y=8;y<55;y++)for(let z=9;z<LENGTH-9;z++)for(let x=9;x<WIDTH-9;x++){
  const offset=idx(x,y,z);
  if(raw[offset]!==1)continue;
  const v=hash(x>>1,y>>1,z>>1);
  const band=y<23?0.008:y<36?0.004:0.001;
  let ore=0;
  if(v<band*.22){ore=14;veins.gold++}
  else if(v<band*.63){ore=15;veins.iron++}
  else if(v<band*4.5){ore=16;veins.coal++}
  if(ore)raw[offset]=ore;
 }
 // Carve several underground caves at varying depths. Avoid bedrock and
 // surface water, and preserve a ring around the plaza spawn for safety.
 for(let n=0;n<18;n++){
  const x=25+(n*71)%326,z=25+(n*97)%326,y=14+(n*11)%17;
  if(Math.hypot(x-191,z-190)<48)continue;
  const rx=5+(n%4),ry=3+(n%3),rz=5+((n*3)%5);
  for(let dy=-ry;dy<=ry;dy++)for(let dz=-rz;dz<=rz;dz++)for(let dx=-rx;dx<=rx;dx++){
   if(dx*dx/(rx*rx)+dy*dy/(ry*ry)+dz*dz/(rz*rz)>1)continue;
   const xx=x+dx,yy=y+dy,zz=z+dz,position=idx(xx,yy,zz);
   if(raw[position]===1||[14,15,16].includes(raw[position])){raw[position]=0;caves++}
  }
 }
 // Mark a family mining entrance at the main village outskirts, without
 // disturbing the 384x112 surface map's existing buildings and spawn.
 const sx=205,sz=199;
 for(let z=sz-3;z<=sz+3;z++)for(let x=sx-3;x<=sx+3;x++){
  for(let y=47;y<=51;y++)if(x===sx-3||x===sx+3||z===sz-3||z===sz+3)raw[idx(x,y,z)]=5;
 }
 for(let x=sx-4;x<=sx+4;x++)for(let z=sz-4;z<=sz+4;z++){
  if(x===sx-4||x===sx+4||z===sz-4||z===sz+4)raw[idx(x,52,z)]=17;
 }
 // Mineral showcase lets children see visually what can be mined underground.
 for(let i=0;i<3;i++)raw[idx(sx-2+i*2,48,sz)]=[16,15,14][i];
 return {file:zlib.gzipSync(raw,{level:6}),veins,caves};
}
function install(folder){
 fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,NAME+'.lvl');
 if(fs.existsSync(file))return {created:false,path:file};
 const {file:bytes,veins,caves}=generate(),tmp=file+'.'+process.pid+'.tmp';
 try{
  fs.writeFileSync(tmp,bytes,{flag:'wx',mode:0o600});
  if(fs.existsSync(file)){fs.unlinkSync(tmp);return {created:false,path:file}}
  fs.renameSync(tmp,file);
 }catch(e){try{fs.unlinkSync(tmp)}catch{};throw e}
 return {created:true,path:file,bytes:bytes.length,veins,caves};
}
module.exports={NAME,WIDTH,HEIGHT,LENGTH,generate,install};
