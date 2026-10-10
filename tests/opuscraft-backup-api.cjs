'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('OpusCraft backups stay private to each family member, persist and restore',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-opus-world-')),port=31948;
 let proc;
 const base='http://127.0.0.1:'+port;
 const api=async(url,{cookie,method='GET',body,contentType='application/json'}={})=>fetch(base+'/api/'+url,{
  method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':contentType}:{})},
  ...(body?{body:contentType==='application/json'?JSON.stringify(body):body}:{})
 });
 try{
  proc=spawn(process.execPath,[path.resolve(__dirname,'..','server.cjs')],{env:{
   ...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:'test-opus-admin-secret-123',MCGALAXY_ENABLED:'false'
  },stdio:'ignore'});
  let ready=false;
  for(let i=0;i<100;i++){try{if((await api('health')).ok){ready=true;break}}catch{}await sleep(90)}
  assert.ok(ready,'Backend unavailable');
  const login=async(name,password)=>{
   const result=await api('login',{method:'POST',body:{name,password}});
   assert.equal(result.status,200);
   return result.headers.get('set-cookie').split(';')[0];
  };
  const adm=await login('Administrador','test-opus-admin-secret-123');
  for(const name of ['Filho1','Filho2']){
   assert.equal((await api('admin/users',{cookie:adm,method:'POST',body:{name,password:'123456'}})).status,201);
  }
  const one=await login('Filho1','123456'),two=await login('Filho2','123456');
  const bytes=Buffer.from('OPUSCRAFT-WORLD-FILE-TEST-CONTENT'.repeat(4));
  const send=await api('opuscraft/world-backups/Minha%20Casa',{
   cookie:one,method:'POST',body:bytes,contentType:'application/octet-stream'
  });
  assert.equal(send.status,200,await send.text());
  const listed=await api('opuscraft/world-backups',{cookie:one});
  const data=await listed.json();
  assert.equal(data.backups.length,1);
  assert.equal(data.backups[0].id,'Minha Casa');
  const privateList=await (await api('opuscraft/world-backups',{cookie:two})).json();
  assert.equal(privateList.backups.length,0,'A second child cannot see the first child’s world');
  const {version}=data.backups[0];
  assert.equal((await api('opuscraft/world-backups/Minha%20Casa/'+version,{cookie:two})).status,404);
  const restored=await api('opuscraft/world-backups/Minha%20Casa/'+version,{cookie:one});
  assert.equal(restored.status,200);
  assert.deepEqual(Buffer.from(await restored.arrayBuffer()),bytes);
  assert.equal((await api('opuscraft/world-backups/Minha%20Casa',{method:'POST',body:bytes,contentType:'application/octet-stream'})).status,401);
  const bad=await api('opuscraft/world-backups/%2E%2E%2Fsecret',{cookie:one,method:'POST',body:bytes,contentType:'application/octet-stream'});
  assert.notEqual(bad.status,200,'Path traversal should be rejected');
  const offline=await api('opuscraft/teleport',{cookie:one,method:'POST',body:{to:'ADM_abcdefabcdef'}});
  assert.notEqual(offline.status,200,'Cannot teleport to a player who is not online');
 }finally{
  if(proc){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(1600)])}
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:120});
 }
});
