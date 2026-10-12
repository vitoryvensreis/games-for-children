'use strict';
// Experimental checkpoint manifest: atomic single-file snapshot of native Chunk
// sections. NOT a complete OpusCraft world save (entities, scheduled ticks,
// inventories, structures, player profiles and cross-chunk writes excluded).
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {columnSnapshot,restoreColumn}=require('./native-column-store.cjs');
const VERSION=1;
function safeSeed(seed){if(typeof seed!=='string'||!seed||seed.length>256)throw Error('Invalid world seed');return seed}
function writeCheckpoint(file,{seed,gameTime,dayTime,chunks}){
 safeSeed(seed);
 for(const [key,val] of Object.entries({gameTime,dayTime}))
  if(!Number.isSafeInteger(val)||val<0)throw Error('Invalid '+key);
 if(!Array.isArray(chunks)||chunks.length>16384)throw Error('Invalid checkpoint chunks');
 const seen=new Set();
 const columns=chunks.map(c=>{
  const key=c.cx+','+c.cz;
  if(seen.has(key))throw Error('Duplicate chunk in checkpoint');
  seen.add(key);
  return columnSnapshot(c);
 });
 const manifest={version:VERSION,seed,gameTime,dayTime,columns};
 const dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const tmp=file+'.'+process.pid+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(manifest),{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);
 }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
 return {chunks:columns.length,gameTime};
}
function readCheckpoint(file,{expectedSeed,Chunk}){
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!data||data.version!==VERSION||safeSeed(data.seed)!==expectedSeed||
  !Number.isSafeInteger(data.gameTime)||data.gameTime<0||
  !Number.isSafeInteger(data.dayTime)||data.dayTime<0||
  !Array.isArray(data.columns)||data.columns.length>16384)
  throw Error('Incompatible or corrupt checkpoint; recovery refused');
 const seen=new Set();
 const chunks=data.columns.map(column=>{
  const chunk=restoreColumn(column,Chunk);
  const key=chunk.cx+','+chunk.cz;
  if(seen.has(key))throw Error('Duplicate chunk in checkpoint');
  seen.add(key);
  return chunk;
 });
 return {seed:data.seed,gameTime:data.gameTime,dayTime:data.dayTime,chunks};
}
module.exports={writeCheckpoint,readCheckpoint};
