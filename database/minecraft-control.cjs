'use strict';
/** Safe administration of local MCGalaxy save files. Never accepts arbitrary paths. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const WORLDS=Object.freeze({vila_familia:'Vila da Família',aventura:'Mundo Aventura',exploracao:'Mundo Exploração',mineracao:'Mundo Mineração'});
const BACKUP_PATTERN=/^(vila_familia|aventura|exploracao|mineracao)-(\d{8}T\d{6}Z)-([a-f0-9]{8})\.lvl$/;
function checkWorld(world){if(!Object.hasOwn(WORLDS,world))throw Error('Mundo não permitido');return world}
function worldFile(dir,world){return path.join(dir,'levels',checkWorld(world)+'.lvl')}
function verifyLevel(content){
 if(content.length<30||content.length>30*1024*1024)throw Error('Arquivo do mundo inválido');
 let raw;try{raw=zlib.gunzipSync(content,{maxOutputLength:40*1024*1024})}catch{throw Error('Backup do mundo corrompido')}
 if(raw.length<18||raw.readUInt16LE(0)!==1874)throw Error('Formato de mundo inválido');
 const w=raw.readUInt16LE(2),d=raw.readUInt16LE(4),h=raw.readUInt16LE(6);
 if(w<16||d<16||h<16||w>1024||d>1024||h>1024||raw.length<18+w*d*h)throw Error('Dimensões de mundo inválidas');
 return {width:w,length:d,height:h,bytes:content.length};
}
function makeBackup(dir,backupDir,world){
 const target=worldFile(dir,world);
 const data=fs.readFileSync(target);const info=verifyLevel(data);
 fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z');
 const id=world+'-'+stamp+'-'+crypto.randomBytes(4).toString('hex')+'.lvl';
 const temp=path.join(backupDir,id+'.tmp'),dest=path.join(backupDir,id);
 try{fs.writeFileSync(temp,data,{flag:'wx',mode:0o600});fs.renameSync(temp,dest)}catch(err){try{fs.unlinkSync(temp)}catch{};throw err}
 return {id,world,createdAt:new Date().toISOString(),...info};
}
function listBackups(backupDir){
 if(!fs.existsSync(backupDir))return [];
 return fs.readdirSync(backupDir).filter(x=>BACKUP_PATTERN.test(x)).map(id=>{
  const st=fs.statSync(path.join(backupDir,id));const m=BACKUP_PATTERN.exec(id);
  return {id,world:m[1],size:st.size,createdAt:st.mtime.toISOString()}
 }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,80);
}
function restoreOffline(dir,backupDir,id){
 const match=BACKUP_PATTERN.exec(String(id||''));
 if(!match)throw Error('Backup inválido');
 const world=checkWorld(match[1]),source=path.join(backupDir,id);
 const copy=fs.readFileSync(source);verifyLevel(copy);
 const target=worldFile(dir,world),temp=target+'.restore-'+crypto.randomBytes(4).toString('hex');
 try{fs.writeFileSync(temp,copy,{mode:0o600});fs.renameSync(temp,target)}catch(e){try{fs.unlinkSync(temp)}catch{};throw e}
 return {world,id};
}
function safeSettings(input,current={}){
 const number=(key,min,max,fall)=>{const v=input?.[key]??current[key]??fall;if(!Number.isFinite(Number(v)))throw Error('Valor inválido para '+key);return Math.round(Math.min(max,Math.max(min,Number(v))))};
 return {
  padSize:number('padSize',100,220,152),
  padOpacity:number('padOpacity',45,100,85),
  lookSensitivity:number('lookSensitivity',60,180,100),
  buildingEnabled:input?.buildingEnabled===undefined?(current.buildingEnabled!==false):input.buildingEnabled===true
 };
}
module.exports={WORLDS,BACKUP_PATTERN,checkWorld,verifyLevel,makeBackup,listBackups,restoreOffline,safeSettings};
