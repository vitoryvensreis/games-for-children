const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const WebSocket=require('ws');
const PORT=31897,MC_PORT=31901,ORIGIN='https://gamesforchildren.escotilhaprodutora.com';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('Gateway ClassiCube: authenticated binary proxy to localhost only',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-mc-'));let child;
 let incoming=[],forwarded,serverSocket=null;
 const server=net.createServer(s=>{serverSocket=s;s.on('data',d=>{incoming.push(d);if(incoming.length===1){forwarded=Buffer.concat(incoming);s.write(Buffer.from([7,8,9]))}})});
 await new Promise(r=>server.listen(MC_PORT,'127.0.0.1',r));
 try{
  child=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env:{...process.env,PORT:String(PORT),DATA_DIR:data,ADMIN_PASSWORD:'senha-segura-para-testes-12345',MCGALAXY_PORT:String(MC_PORT),MCGALAXY_EXTERNAL:'true'},stdio:'pipe'});
  let connected=false;
  for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:'+PORT+'/api/health');if(r.ok){connected=true;break}}catch{}await pause(100)}
  assert.ok(connected,'Node server did not start');
  const res=await fetch('http://127.0.0.1:'+PORT+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Administrador',password:'senha-segura-para-testes-12345'})});
  assert.equal(res.status,200);
  const cookie=res.headers.get('set-cookie').split(';')[0];
  let ready=false;for(let i=0;i<45;i++){const r=await fetch('http://127.0.0.1:'+PORT+'/api/classicube/status',{headers:{Cookie:cookie}});if((await r.json()).multiplayerConfigured){ready=true;break}await pause(100)}
  assert.ok(ready,'MCGalaxy local TCP mock not detected');
  const bad=await new Promise(resolve=>{const w=new WebSocket('ws://127.0.0.1:'+PORT+'/ws?classicube=1','ClassiCube',{headers:{Origin:ORIGIN}});w.on('unexpected-response',(req,res)=>resolve(res.statusCode));w.on('error',()=>resolve(0))});
  assert.equal(bad,401,'Unauthenticated game clients must be refused');
  const ws=new WebSocket('ws://127.0.0.1:'+PORT+'/ws?classicube=1','ClassiCube',{headers:{Cookie:cookie,Origin:ORIGIN}});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
  assert.equal(ws.protocol,'ClassiCube');
  const pkt=Buffer.alloc(131,32);pkt[0]=0;pkt[1]=7;pkt.write('ForgedUsername',2,'ascii');
  const frame=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('No return from TCP bridge')),4000);ws.once('message',d=>{clearTimeout(timeout);resolve(Buffer.from(d))})});
  ws.send(pkt);
  const reply=await frame;assert.deepEqual([...reply],[7,8,9]);
  assert.ok(forwarded,'No packets forwarded to local MCGalaxy');
  assert.equal(forwarded.length,131);
  const sentName=forwarded.subarray(2,66).toString('ascii').trim();
  assert.ok(sentName.startsWith('Administrador_'),sentName);
  assert.notEqual(sentName,'ForgedUsername');
  const following=Buffer.from([5,4,3,2,1]);ws.send(following);
  for(let i=0;i<35&&incoming.length<2;i++)await pause(20);
  assert.deepEqual(incoming[1],following);
  ws.close();
 }finally{child?.kill('SIGTERM');serverSocket?.destroy();await new Promise(r=>server.close(r));fs.rmSync(data,{recursive:true,force:true})}
});
