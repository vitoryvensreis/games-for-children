'use strict';
/**
 * Engine-independent authoritative world state foundation.
 * No DOM, Canvas, WebGL or browser process. NOT YET the upstream OpusCraft
 * simulation: terrain generation, inventories, collisions, mobs and native
 * multiplayer packet compatibility require an upstream adapter.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const DEFAULT_WORLD=Object.freeze({version:1,seed:104729,revision:0,blocks:{}});
const CHUNK_SIZE=16;
function assertInteger(value,name,min,max){
 if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid '+name);
 return value;
}
function validateChange({x,y,z,block}){
 for(const [name,v] of Object.entries({x,y,z}))assertInteger(v,name,-30000000,30000000);
 assertInteger(block,'block',0,65535);
 return {x,y,z,block};
}
function chunkKey(x,z){return Math.floor(x/CHUNK_SIZE)+','+Math.floor(z/CHUNK_SIZE)}
class HeadlessWorld{
 constructor({directory,seed=104729}={}){
  if(!directory||typeof directory!=='string')throw Error('World directory required');
  this.directory=directory;this.filename=path.join(directory,'world.json');
  this.seed=assertInteger(seed,'seed',0,2147483647);
  this.data={...DEFAULT_WORLD,seed:this.seed,blocks:{}};
  this.players=new Map();
  this.dirty=false;
 }
 load(){
  fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
  if(fs.existsSync(this.filename)){
   const saved=JSON.parse(fs.readFileSync(this.filename,'utf8'));
   if(saved.version!==1||!Number.isInteger(saved.seed)||!Number.isSafeInteger(saved.revision)||
    saved.revision<0||!saved.blocks||typeof saved.blocks!=='object'||Array.isArray(saved.blocks))
     throw Error('Incompatible or corrupt world snapshot (refusing reset)');
   this.data=saved;
  }else this.flush(true);
  return this;
 }
 applyBlock(playerId,change){
  if(typeof playerId!=='string'||!playerId||playerId.length>128)throw Error('Invalid player');
  const {x,y,z,block}=validateChange(change);
  const key=x+','+y+','+z;
  // 0 denotes a player-placed air modification, distinct from no modification.
  this.data.blocks[key]=block;
  this.data.revision++;
  if(!Number.isSafeInteger(this.data.revision))throw Error('Revision overflow');
  this.dirty=true;
  return {type:'blockChange',x,y,z,block,revision:this.data.revision,by:playerId};
 }
 setPlayer(id,position){
  if(typeof id!=='string'||!id||id.length>128)throw Error('Invalid player');
  const {x,y,z}=position;
  if(![x,y,z].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=30000000))
   throw Error('Invalid position');
  const info={x,y,z,at:Date.now()};this.players.set(id,info);return info;
 }
 removePlayer(id){this.players.delete(id)}
 getChunk(cx,cz){
  assertInteger(cx,'cx',-1875000,1875000);assertInteger(cz,'cz',-1875000,1875000);
  const blocks=[];
  for(const [key,block] of Object.entries(this.data.blocks)){
   const [x,y,z]=key.split(',').map(Number);
   if(chunkKey(x,z)===cx+','+cz)blocks.push({x,y,z,block});
  }
  return {type:'chunk',cx,cz,seed:this.data.seed,revision:this.data.revision,blocks};
 }
 flush(force=false){
  if(!this.dirty&&!force)return false;
  fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
  const tmp=this.filename+'.'+process.pid+'.'+crypto.randomBytes(4).toString('hex')+'.tmp';
  const bytes=JSON.stringify(this.data);
  try{
   fs.writeFileSync(tmp,bytes,{mode:0o600,flag:'wx'});
   fs.renameSync(tmp,this.filename);
   this.dirty=false;
  }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
  return true;
 }
 status(){return {mode:'headless-foundation',ready:true,seed:this.data.seed,revision:this.data.revision,players:this.players.size,dirty:this.dirty}}
}
module.exports={HeadlessWorld,CHUNK_SIZE,chunkKey,validateChange};
