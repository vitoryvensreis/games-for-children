'use strict';
// Persist the exact JSON-compatible upstream SavedPlayer record, not an
// invented subset. Test with upstream savePlayer/loadPlayer before production.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(uuid,data){
 if(!UUID.test(uuid)||!data||typeof data!=='object'||Array.isArray(data))
  throw Error('Invalid player record');
 if(data.uuid?.toLowerCase()!==uuid.toLowerCase())throw Error('Player UUID mismatch');
 for(const k of ['x','y','z','health','food','xpLevel'])
  if(!Number.isFinite(data[k]))throw Error('Invalid player '+k);
 for(const k of ['inventory','armor'])
  if(!Array.isArray(data[k]))throw Error('Invalid player '+k);
 if(typeof data.dimension!=='string'||!data.dimension)throw Error('Invalid player dimension');
 return data;
}
function playerFilename(directory,uuid){
 if(!UUID.test(uuid))throw Error('Invalid UUID');
 return path.join(directory,uuid.toLowerCase()+'.json');
}
function writePlayer(directory,uuid,data){
 validate(uuid,data);
 const file=playerFilename(directory,uuid);
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const tmp=file+'.'+process.pid+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify({version:1,uuid:uuid.toLowerCase(),data}),{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);
 }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
 return file;
}
function readPlayer(directory,uuid){
 const record=JSON.parse(fs.readFileSync(playerFilename(directory,uuid),'utf8'));
 if(!record||record.version!==1||record.uuid!==uuid.toLowerCase())
  throw Error('Incompatible player record');
 return validate(uuid,record.data);
}
module.exports={writePlayer,readPlayer,validate};
