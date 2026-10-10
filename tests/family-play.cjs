const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const zlib=require('node:zlib');
const {ROOMS,playerName,initHomes,familyInfo,writePolicy,makeSkin}=require('../database/family-play.cjs');
test('House ownership is stable and account-derived',()=>{
 const a={name:'Caíque',id:'aaaaaaaa-aaaa',role:'child',enabled:true};
 const b={name:'Cauã',id:'bbbbbbbb-bbbb',role:'child',enabled:true};
 const state={users:[a,b]};
 assert.equal(initHomes(state),true);assert.equal(initHomes(state),false);
 assert.equal(state.minecraftHouses[1],a.id);assert.equal(state.minecraftHouses[2],b.id);
 assert.equal(playerName(a),'Caique_aaaa');
 assert.equal(familyInfo(state,a,new Set([a.id])).homes[0].mine,true);
 assert.equal(ROOMS.length,4);
});
test('Trusted policy writes and preserves owner assignments',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-family-'));
 try{
  const state={users:[{name:'Amigo',id:'aaaaaaaa-aaa',role:'child',enabled:true}],minecraftHouses:{1:'aaaaaaaa-aaa'}};
  assert.equal(writePolicy(state,folder),true);
  assert.match(fs.readFileSync(path.join(folder,'properties','gfc-family-policy.txt'),'utf8'),/H\|1\|Amigo_aaaa/);
  assert.equal(writePolicy(state,folder),false);
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
});
test('Built-in skins are self-hosted PNG files',()=>{
 for(const skin of ['azul','verde','rosa','roxo']){
  const png=makeSkin(skin);
  assert.equal(png.readUInt32BE(16),64);
  assert.equal(png.readUInt32BE(20),32);
  const size=png.readUInt32BE(33);
  assert.equal(zlib.inflateSync(png.subarray(41,41+size)).length,32*(1+64*4));
 }
});
test('Plugin protects houses on the server and interface offers controls',()=>{
 const p=fs.readFileSync(path.resolve(__dirname,'../plugins/family-play/FamilyPlay.cs'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../public/classicube/index.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../public/classicube/family-menu.js'),'utf8');
 assert.match(p,/OnBlockChangingEvent.Register/);
 assert.match(p,/p.RevertBlock\(x,y,z\)/);
 assert.match(p,/IsParent\(p\)/);
 assert.match(p,/PlayerOperations.TeleportToEntity/);
 assert.match(html,/window.familyGameSocket=socket/);
 assert.match(ui,/new Uint8Array\(66\)/);
 assert.match(ui,/packet\[0\]=0x0d/);
});

const {spawn}=require('node:child_process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('Family endpoints enforce parent-only plot assignment and child-safe skin presets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-family-api-'));
 const port=31943;
 const base='http://127.0.0.1:'+port+'/api/';
 const request=(url,cookie,method='GET',data)=>fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 let childProcess;
 try{
  childProcess=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:'safe-test-admin-password-12345',MCGALAXY_ENABLED:'false'},stdio:'pipe'});
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base+'health')).ok){ready=true;break}}catch{}await pause(80)}
  assert.ok(ready,'Backend did not start');
  const admin=await request('login',null,'POST',{name:'Administrador',password:'safe-test-admin-password-12345'});
  assert.equal(admin.status,200);
  const parent=admin.headers.get('set-cookie').split(';')[0];
  const create=await request('admin/users',parent,'POST',{name:'Amigo',password:'2345'});
  assert.equal(create.status,201);
  const childId=(await create.json()).user.id;
  const logged=await request('login',null,'POST',{name:'Amigo',password:'2345'});
  assert.equal(logged.status,200);
  const child=logged.headers.get('set-cookie').split(';')[0];
  const family=await request('minecraft/family',child);
  assert.equal(family.status,200);
  assert.equal((await family.json()).homes.length,4);
  assert.equal((await request('admin/minecraft/houses/1',child,'POST',{userId:childId})).status,403);
  assert.equal((await request('admin/minecraft/houses/1',parent,'POST',{userId:childId})).status,200);
  const joined=await (await request('minecraft/family',child)).json();
  assert.equal(joined.homes[0].mine,true);
  assert.equal((await request('minecraft/skin',child,'POST',{skin:'roxo'})).status,200);
  assert.equal((await request('minecraft/skin',child,'POST',{skin:'https://bad.test/skin'})).status,400);
  const skin=await request('minecraft/skins/roxo.png',child);
  assert.equal(skin.status,200);
  assert.equal(skin.headers.get('content-type'),'image/png');
  assert.ok((await skin.arrayBuffer()).byteLength>200);
  assert.equal((await request('minecraft/family')).status,401);
 }finally{
  if(childProcess){childProcess.kill('SIGTERM');await Promise.race([new Promise(done=>childProcess.once('exit',done)),pause(1500)])}
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:150});
 }
});
