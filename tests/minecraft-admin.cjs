'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {spawn}=require('node:child_process');
const {makeBackup,listBackups,restoreOffline,verifyLevel,safeSettings}=require('../database/minecraft-control.cjs');
const {createFamilyVillage}=require('../database/family-village.cjs');
const pause=t=>new Promise(done=>setTimeout(done,t));

test('Bloco D: verified backups are separate from live maps and restoration preserves an emergency copy',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-worlds-')),worldDir=path.join(dir,'server'),backups=path.join(dir,'backups');
 const levels=path.join(worldDir,'levels');fs.mkdirSync(levels,{recursive:true});
 try{
  const world=createFamilyVillage();fs.writeFileSync(path.join(levels,'vila_familia.lvl'),world);
  const backup=makeBackup(worldDir,backups,'vila_familia');
  assert.match(backup.id,/^vila_familia-\d{8}T\d{6}Z-[a-f0-9]{8}\.lvl$/);
  assert.equal(verifyLevel(fs.readFileSync(path.join(backups,backup.id))).width,192);
  assert.equal(listBackups(backups).length,1);
  // Simulate new construction by changing the world before restoring.
  fs.writeFileSync(path.join(levels,'vila_familia.lvl'),Buffer.from('changed by players'));
  assert.deepEqual(restoreOffline(worldDir,backups,backup.id),{world:'vila_familia',id:backup.id});
  assert.deepEqual(fs.readFileSync(path.join(levels,'vila_familia.lvl')),world);
  assert.throws(()=>restoreOffline(worldDir,backups,'../../secrets.txt'),/Backup inválido/);
  assert.throws(()=>makeBackup(worldDir,backups,'../../../etc'),/Mundo não permitido/);
  assert.throws(()=>verifyLevel(Buffer.from('not a world')),/Arquivo do mundo inválido/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Bloco D: configuration clamps touch controls and rejects invalid values',()=>{
 assert.deepEqual(safeSettings({padSize:400,padOpacity:1,buildingEnabled:false}),{padSize:220,padOpacity:45,lookSensitivity:100,buildingEnabled:false});
 assert.equal(safeSettings({},{padSize:166,padOpacity:79,buildingEnabled:false}).buildingEnabled,false);
 assert.throws(()=>safeSettings({padSize:'invalid'}),/Valor inválido/);
});

test('Bloco D and Block C: plugin must check existing maps, persist position and expose guide status',()=>{
 const plugin=fs.readFileSync(path.join(__dirname,'../plugins/family-play/FamilyPlay.cs'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
 assert.match(plugin,/foreach\(Level existing in LevelInfo\.Loaded\.Items\)InstallGuides\(existing\)/);
 assert.match(plugin,/File\.WriteAllText\(GuideStatusFile/);
 assert.match(plugin,/OnLevelLoadedEvent\.Register\(InstallGuides/);
 assert.match(plugin,/OnPlayerSpawningEvent\.Register\(RestoreSpotOnSpawn/);
 assert.match(plugin,/OnPlayerDisconnectEvent\.Register\(TrackDisconnect/);
 assert.match(plugin,/OnJoinedLevelEvent\.Register\(RestorePreviousWorld/);
 assert.match(plugin,/p\.Socket\.Disconnected/);
 assert.match(plugin,/gfc-family-positions\.tsv/);
 assert.match(plugin,/if\(cmd=="guia"\)/);
 assert.match(plugin,/Gui[a-z_ ]*da Praca|Guia encontrado/);
 const menu=fs.readFileSync(path.join(__dirname,'../public/classicube/family-menu.js'),'utf8');
 assert.match(menu,/data-place="praca"/);
 assert.match(menu,/data-place="ponte"/);
 assert.match(menu,/data-place="torre"/);

 assert.match(server,/function minecraftGuidesStatus/);
 assert.match(server,/function minecraftPlayersOverview/);
 assert.match(server,/action==='restore'/);
 const ui=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 assert.match(ui,/refreshMinecraftDashboard/);
 assert.match(ui,/data-mc-restore/);
 assert.match(ui,/padSize:Number\(size.value\)/);
});

test('Bloco D: admin-only dashboard and saved touch settings',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-admin-world-')),port=31953;let proc;
 const request=async(endpoint,{cookie='',method='GET',body}={})=>fetch('http://127.0.0.1:'+port+'/api/'+endpoint,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  proc=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:'safe-test-admin-password-12345',MCGALAXY_ENABLED:'false'},stdio:'pipe'});
  let started=false;
  for(let i=0;i<75;i++){try{if((await request('health')).ok){started=true;break}}catch{}await pause(100)}
  assert.equal(started,true);
  const login=await request('login',{method:'POST',body:{name:'Administrador',password:'safe-test-admin-password-12345'}});
  const admin=login.headers.get('set-cookie').split(';')[0];
  const added=await request('admin/users',{method:'POST',cookie:admin,body:{name:'Aluno',password:'1234'}});
  assert.equal(added.status,201);
  const logged=await request('login',{method:'POST',body:{name:'Aluno',password:'1234'}});
  const child=logged.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('admin/minecraft/dashboard',{cookie:child})).status,403);
  assert.equal((await request('admin/minecraft/controls',{method:'POST',cookie:child,body:{padSize:200}})).status,403);
  const data=await request('admin/minecraft/dashboard',{cookie:admin});
  assert.equal(data.status,200);
  const dash=await data.json();
  assert.equal(dash.worlds.length,4);
  assert.equal(dash.guides.ready,false,'Without loaded plugin NPC readiness must not be invented');
  assert.ok(dash.players.some(u=>u.name==='Aluno'));
  const changed=await request('admin/minecraft/controls',{cookie:admin,method:'POST',body:{padSize:181,padOpacity:89,buildingEnabled:false}});
  assert.equal(changed.status,200);
  const mobile=await request('minecraft/controls',{cookie:child});
  assert.equal(mobile.status,200);assert.equal((await mobile.json()).controls.padSize,181);
  const forbidden=await request('admin/minecraft/command',{cookie:child,method:'POST',body:{action:'restore',id:'test'}});
  assert.equal(forbidden.status,403);
  const noRestore=await request('admin/minecraft/command',{cookie:admin,method:'POST',body:{action:'restore',id:'vila_familia-20260505T101010Z-aaaaaaaa.lvl',confirm:'RESTAURAR vila_familia'}});
  assert.equal(noRestore.status,503,'Cannot restore unless server is online');
 }finally{if(proc){proc.kill('SIGTERM');await Promise.race([new Promise(done=>proc.once('exit',done)),pause(1800)])}fs.rmSync(dir,{recursive:true,force:true,maxRetries:6,retryDelay:150})}
});
