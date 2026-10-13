'use strict';
// Experimental native OpusCraft Chunk snapshot. Not a complete world save.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const FORMAT=1;
function columnSnapshot(chunk){
 if(!Number.isInteger(chunk.cx)||!Number.isInteger(chunk.cz)||!Array.isArray(chunk.blocks)||!Array.isArray(chunk.light)||chunk.blocks.length!==chunk.light.length)
  throw Error('Invalid upstream Chunk');
 const sections=chunk.blocks.length;
 const arrays=(parts,type)=>parts.map(p=>{
  if(p===null)return null;
  if(!(p instanceof type)||p.length!==4096)throw Error('Invalid chunk section');
  return Buffer.from(p.buffer,p.byteOffset,p.byteLength).toString('base64');
 });
 return {format:FORMAT,cx:chunk.cx,cz:chunk.cz,sections,lightDefault:chunk.lightDefault,
  blocks:arrays(chunk.blocks,Uint16Array),light:arrays(chunk.light,Uint8Array),
  biomes:Buffer.from(chunk.biomes).toString('base64'),
  caveBiomes:chunk.caveBiomes?Buffer.from(chunk.caveBiomes).toString('base64'):null,
  inhabitedTime:chunk.inhabitedTime};
}
function restoreColumn(data,Chunk){
 if(!data||data.format!==FORMAT||!Number.isInteger(data.cx)||!Number.isInteger(data.cz)||
  !Number.isInteger(data.sections)||data.sections<1||data.sections>64||
  !Array.isArray(data.blocks)||!Array.isArray(data.light)||
  data.blocks.length!==data.sections||data.light.length!==data.sections)
  throw Error('Invalid chunk snapshot');
 const chunk=new Chunk(data.cx,data.cz,data.lightDefault);
 if(chunk.blocks.length!==data.sections)throw Error('Incompatible upstream chunk height');
 const unpack=(encoded,bytes)=>{
  if(encoded===null)return null;
  if(typeof encoded!=='string'||encoded.length>22000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
   throw Error('Invalid section encoding');
  const raw=Buffer.from(encoded,'base64');
  if(raw.length!==bytes)throw Error('Unexpected section length');
  return raw;
 };
 for(let i=0;i<data.sections;i++){
  const blocks=unpack(data.blocks[i],8192),light=unpack(data.light[i],4096);
  if(blocks){
   const arr=new Uint16Array(4096);
   for(let j=0;j<4096;j++)arr[j]=blocks.readUInt16LE(j*2);
   chunk.blocks[i]=arr;
   let count=0;for(const v of arr)if(v)count++;
   chunk.nonAir[i]=count;
  }
  if(light)chunk.light[i]=new Uint8Array(light);
 }
 const biomes=unpack(data.biomes,256);
 if(!biomes)throw Error('Missing biome data');
 chunk.biomes=new Uint8Array(biomes);
 chunk.caveBiomes=data.caveBiomes===null?null:new Uint8Array(Buffer.from(data.caveBiomes,'base64'));
 if(!Number.isSafeInteger(data.inhabitedTime)||data.inhabitedTime<0)throw Error('Invalid inhabited time');
 chunk.inhabitedTime=data.inhabitedTime;
 chunk.recomputeHeightmap();
 chunk.modified=false;
 return chunk;
}
function saveColumn(filename,chunk){
 const data=columnSnapshot(chunk);
 fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
 const tmp=filename+'.'+process.pid+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(data),{encoding:'utf8',mode:0o600,flag:'wx'});
  fs.renameSync(tmp,filename);
 }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
 return data;
}
function loadColumn(filename,Chunk){
 return restoreColumn(JSON.parse(fs.readFileSync(filename,'utf8')),Chunk);
}
module.exports={columnSnapshot,restoreColumn,saveColumn,loadColumn};
