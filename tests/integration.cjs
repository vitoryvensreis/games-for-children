const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const WebSocket=require('ws');
const PORT=31247,base='http://127.0.0.1:'+PORT;
const dir=mkdtempSync(path.join(os.tmpdir(),'gfc-test-'));
let proc;
async function request(route,method='GET',payload,cookie){
 const res=await fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:payload?JSON.stringify(payload):undefined});
 return {res,data:await res.json().catch(()=>({})),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
function wsConnect(cookie){
 return new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:'+PORT+'/ws',{headers:{Cookie:cookie,Origin:'https://gamesforchildren.escotilhaprodutora.com'}});ws.once('open',()=>resolve(ws));ws.once('error',reject)});
}
function once(ws,type,predicate=()=>true){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.off('message',on);reject(Error('timeout '+type))},4000);function on(data){const m=JSON.parse(data);if(m.type===type&&predicate(m)){clearTimeout(timeout);ws.off('message',on);resolve(m)}}ws.on('message',on)})}
test('login, perfis, WebSocket e salas',async()=>{
 proc=spawn(process.execPath,[path.resolve(__dirname,'../server.cjs')],{env:{...process.env,PORT:String(PORT),DATA_DIR:dir,ADMIN_PASSWORD:'senha-forte-teste-123456'},stdio:'pipe'});
 try{
  let ready=false;for(let i=0;i<45;i++){try{const r=await request('health');if(r.res.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.equal(ready,true,'Servidor não iniciou');
  let a=await request('login','POST',{name:'Administrador',password:'senha-forte-teste-123456'});
  assert.equal(a.res.status,200);const adminCookie=a.cookie;
  const c=await request('admin/users','POST',{name:'Piloto',password:'1234'},adminCookie);assert.equal(c.res.status,201);
  const photo='data:image/png;base64,'+Buffer.from('fake-photo').toString('base64');
  const savePhoto=await request('admin/users/'+c.data.user.id,'POST',{photo},adminCookie);
  assert.equal(savePhoto.res.status,200);
  const unauthorizedPhoto=await fetch(base+'/api/photos/'+c.data.user.id);
  assert.equal(unauthorizedPhoto.status,401);
  const child=await request('login','POST',{name:'Piloto',password:'1234'});assert.equal(child.res.status,200);
  const cubeStatus=await request('classicube/status','GET',null,child.cookie);
  assert.equal(cubeStatus.res.status,200);
  assert.equal(cubeStatus.data.mode,'family-multiplayer');
  assert.equal(cubeStatus.data.multiplayerConfigured,false,'Mundo precisa do servidor MCGalaxy em execução');
  const notLoggedIn=await fetch(base+'/classicube/index.html');
  assert.equal(notLoggedIn.status,401);
  const cubePage=await fetch(base+'/classicube/index.html',{headers:{Cookie:child.cookie}});
  assert.equal(cubePage.status,200);
  const html=await cubePage.text();
  assert.match(html,/ClassiCube.js/);
  assert.match(html,/resizeGameCanvas/,'ClassiCube must resize backing canvas when rotating');
  assert.match(html,/width:100%;height:100%/,'Canvas must occupy available frame without clipping');


  const socket=await wsConnect(child.cookie);
  const roomMessage=once(socket,'roomState');socket.send(JSON.stringify({type:'create',game:'race',solo:false}));const r=await roomMessage;assert.equal(r.game,'race');assert.equal(r.started,false);
  const progress=once(socket,'frame');
  const adminWS=await wsConnect(adminCookie);
  const online=await request('admin/overview','GET',null,adminCookie);
  assert.equal(online.data.users.find(u=>u.name==='Piloto').online,true,'Presença online não atualizou');
  const second=await request('admin/users','POST',{name:'Piloto Dois',password:'4567'},adminCookie);assert.equal(second.res.status,201);
  const loginTwo=await request('login','POST',{name:'Piloto Dois',password:'4567'});assert.equal(loginTwo.res.status,200);
  const secondWS=await wsConnect(loginTwo.cookie);
  // Global family voice works even when players are in different game rooms.
  const voiceReady=once(adminWS,'voiceReady',m=>m.name==='Piloto');
  adminWS.send(JSON.stringify({type:'voice-ready'}));
  socket.send(JSON.stringify({type:'voice-ready'}));
  const announcement=await voiceReady;assert.equal(announcement.name,'Piloto');
  const peerList=once(socket,'peers',m=>m.items.some(x=>x.name==='Administrador'));
  socket.send(JSON.stringify({type:'peers'}));
  const globalPeers=await peerList;
  const parentId=globalPeers.items.find(x=>x.name==='Administrador').id;
  const relay=once(adminWS,'signal',m=>m.kind==='ice');
  socket.send(JSON.stringify({type:'signal',to:parentId,kind:'ice',data:{candidate:'test-candidate'}}));
  const signaled=await relay;assert.equal(signaled.name,'Piloto');
  const voiceGone=once(adminWS,'peerLeft');
  socket.send(JSON.stringify({type:'voice-off'}));
  const leftVoice=await voiceGone;assert.equal(leftVoice.id,signaled.from);
  adminWS.send(JSON.stringify({type:'voice-off'}));

  const secondRoom=once(secondWS,'roomState');secondWS.send(JSON.stringify({type:'join',code:r.code}));
  const joined=await secondRoom;assert.equal(joined.players.length,2);const frame=await progress;assert.ok(frame.remaining>0);
  const watch=once(adminWS,'roomState');adminWS.send(JSON.stringify({type:'join',code:r.code,mode:'spectator'}));const spectator=await watch;assert.equal(spectator.mode,'spectator');assert.equal(spectator.players.length,2);
  const spectatorFrame=once(adminWS,'frame');const viewed=await spectatorFrame;assert.equal(viewed.players.length,2);
  const nextFrame=once(socket,'frame');socket.send(JSON.stringify({type:'lane',lane:2,seq:1}));const moved=await nextFrame;assert.equal(moved.players.find(p=>p.id===c.data.user.id).lane,2);assert.equal(moved.players.find(p=>p.id===c.data.user.id).ackSeq,1);
  const rename=await request('admin/users/'+second.data.user.id,'POST',{name:'Segundo Piloto',password:'5678'},adminCookie);assert.equal(rename.res.status,200);
  const adminSolo=once(adminWS,'roomState');adminWS.send(JSON.stringify({type:'create',game:'race',solo:true}));const soloRoom=await adminSolo;assert.equal(soloRoom.mode,'player');assert.equal(soloRoom.players[0].id,a.data.user.id);const pongState=once(adminWS,'roomState',m=>m.game==='pong');adminWS.send(JSON.stringify({type:'create',game:'pong',solo:true}));const pong=await pongState;assert.equal(pong.game,'pong');const pongServing=once(adminWS,'frame',m=>m.game==='pong'&&m.phase==='serve');const serve=await pongServing;
  assert.equal(serve.ball.x,.5,'Bola precisa partir do centro');
  assert.equal(serve.ball.y,.5);
  assert.equal(serve.round,1);
  assert.ok(serve.serveRemaining>0,'Deve existir contagem de saque');
  const pongPlaying=once(adminWS,'frame',m=>m.game==='pong'&&m.phase==='play');
  const pf=await pongPlaying;assert.ok(pf.ball.x>=0&&pf.ball.x<=1);
  await new Promise(r=>setTimeout(r,180));
  const laterFrame=once(adminWS,'frame',m=>m.game==='pong'&&m.phase==='play'&&m.round===pf.round);
  const later=await laterFrame;
  assert.ok(Math.abs(later.ball.x-pf.ball.x)>.04,'Bola do Pong deve percorrer a tela rapidamente');
  const duoStart=once(adminWS,'roomState',m=>m.game==='pong'&&!m.started);
  adminWS.send(JSON.stringify({type:'create',game:'pong',solo:false}));
  const duo=await duoStart;assert.equal(duo.players.length,1);
  const joinedPong=once(socket,'roomState',m=>m.game==='pong'&&m.players.length===2);
  socket.send(JSON.stringify({type:'join',code:duo.code}));
  const multiplayer=await joinedPong;assert.equal(multiplayer.started,false);
  const startedPong=once(adminWS,'roomState',m=>m.game==='pong'&&m.started);
  const started=await startedPong;assert.equal(started.players.length,2);
  const pongUpdate=once(adminWS,'frame',m=>m.game==='pong');
  socket.send(JSON.stringify({type:'paddle',y:.22}));
  const paddle=await pongUpdate;assert.equal(paddle.players.find(p=>p.id===c.data.user.id).paddle,.22);
  secondWS.close();adminWS.close();
  socket.close();
  const state=await request('admin/overview','GET',null,adminCookie);
  assert.equal(state.res.status,200);assert.ok(state.data.users.some(u=>u.name==='Piloto'));
 }finally{if(proc){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,1500))])}rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:120})}
});
