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
function once(ws,type){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.off('message',on);reject(Error('timeout '+type))},4000);function on(data){const m=JSON.parse(data);if(m.type===type){clearTimeout(timeout);ws.off('message',on);resolve(m)}}ws.on('message',on)})}
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
  const socket=await wsConnect(child.cookie);
  const roomMessage=once(socket,'roomState');socket.send(JSON.stringify({type:'create',solo:false}));const r=await roomMessage;assert.equal(r.game,'race');assert.equal(r.started,false);
  const progress=once(socket,'frame');
  const adminWS=await wsConnect(adminCookie);
  const online=await request('admin/overview','GET',null,adminCookie);
  assert.equal(online.data.users.find(u=>u.name==='Piloto').online,true,'Presença online não atualizou');
  const second=await request('admin/users','POST',{name:'Piloto Dois',password:'4567'},adminCookie);assert.equal(second.res.status,201);
  const loginTwo=await request('login','POST',{name:'Piloto Dois',password:'4567'});assert.equal(loginTwo.res.status,200);
  const secondWS=await wsConnect(loginTwo.cookie);
  const secondRoom=once(secondWS,'roomState');secondWS.send(JSON.stringify({type:'join',code:r.code}));
  const joined=await secondRoom;assert.equal(joined.players.length,2);const frame=await progress;assert.ok(frame.remaining>0);
  const rename=await request('admin/users/'+second.data.user.id,'POST',{name:'Segundo Piloto',password:'5678'},adminCookie);assert.equal(rename.res.status,200);
  secondWS.close();adminWS.close();
  socket.close();
  const state=await request('admin/overview','GET',null,adminCookie);
  assert.equal(state.res.status,200);assert.ok(state.data.users.some(u=>u.name==='Piloto'));
 }finally{proc?.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})}
});
