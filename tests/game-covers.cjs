const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('Game covers: default images, admin replace/reset, access control, persistent override',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-covers-'));
 const port=31913;
 let proc;
 const url='http://127.0.0.1:'+port;
 const request=async(p,{method='GET',cookie='',body}={})=>fetch(url+'/api/'+p,{
  method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 try{
  proc=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{
   env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:'testing-admin-password-12345',MCGALAXY_ENABLED:'false'},stdio:'pipe'
  });
  let ready=false;
  for(let i=0;i<80;i++){try{const r=await fetch(url+'/api/health');if(r.ok){ready=true;break}}catch{}await sleep(80)}
  assert.ok(ready,'Backend did not start');
  const login=await request('login',{method:'POST',body:{name:'Administrador',password:'testing-admin-password-12345'}});
  assert.equal(login.status,200);
  const adminCookie=login.headers.get('set-cookie').split(';')[0];
  const accounts=await request('admin/users',{method:'POST',cookie:adminCookie,body:{name:'TesteCapa',password:'4567'}});
  assert.equal(accounts.status,201);
  const childLogin=await request('login',{method:'POST',body:{name:'TesteCapa',password:'4567'}});
  const childCookie=childLogin.headers.get('set-cookie').split(';')[0];

  for(const slug of ['pong','snake','minecraft']){
   const def=fs.readFileSync(path.join(__dirname,'..','public','assets','game-covers',slug+'.webp'));
   const fetched=await request('game-covers/'+slug,{cookie:childCookie});
   assert.equal(fetched.status,200,slug);
   assert.equal(fetched.headers.get('content-type'),'image/webp');
   assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),def,slug+' default cover should match GitHub binary');
  }
  assert.equal((await request('game-covers/pong')).status,401,'Anonymous visitor cannot read private game cover endpoint');
  assert.equal((await request('admin/game-covers',{cookie:childCookie})).status,403);
  assert.equal((await request('admin/game-covers/pong',{method:'POST',cookie:childCookie,body:{image:null}})).status,403);

  const original=fs.readFileSync(path.join(__dirname,'..','public','assets','game-covers','minecraft.webp'));
  const upload=await request('admin/game-covers/pong',{method:'POST',cookie:adminCookie,body:{image:'data:image/webp;base64,'+original.toString('base64')}});
  assert.equal(upload.status,200);
  assert.equal((await upload.json()).custom,true);
  const diskPath=path.join(dir,'game-covers','pong.webp');
  assert.deepEqual(fs.readFileSync(diskPath),original,'Override stored in persistent DATA_DIR, not public folder');
  const after=await request('game-covers/pong',{cookie:childCookie});
  assert.deepEqual(Buffer.from(await after.arrayBuffer()),original,'Custom image served to child');
  const metadata=await request('admin/game-covers',{cookie:adminCookie});
  assert.equal((await metadata.json()).covers.pong.custom,true);

  const invalid=await request('admin/game-covers/snake',{method:'POST',cookie:adminCookie,body:{image:'data:image/webp;base64,'+Buffer.from('not a real picture').toString('base64')}});
  assert.equal(invalid.status,400);

  const reset=await request('admin/game-covers/pong',{method:'POST',cookie:adminCookie,body:{image:null}});
  assert.equal(reset.status,200);
  assert.equal(fs.existsSync(diskPath),false,'Reset deletes only custom override');
  const fallback=await request('game-covers/pong',{cookie:childCookie});
  assert.deepEqual(Buffer.from(await fallback.arrayBuffer()),fs.readFileSync(path.join(__dirname,'..','public','assets','game-covers','pong.webp')));
 }finally{
  if(proc){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(1900)]);}
  fs.rmSync(dir,{force:true,recursive:true,maxRetries:8,retryDelay:150});
 }
});

test('Catalog and admin expose three game covers and OpusCraft listing',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
 for(const slug of ['pong','snake','minecraft']){
  assert.ok(css.includes("url('/api/game-covers/"+slug+"')"),slug+' illustration is set in CSS');
 }
 assert.ok(app.includes('admin/game-covers'), 'Admin can update cover images');
 assert.match(app,/class="game-card game-card--cover card-minecraft"/);
 assert.match(app,/<h2>OpusCraft<\/h2>/);
 assert.match(app,/function refreshGameCovers\(\)/);
 assert.match(app,/data-action="reset"/);
 assert.match(css,/linear-gradient\(180deg,rgba\(9,15,48/,'Cover overlay is present');
 assert.match(css,/left:env\(safe-area-inset-left,0px\)/);
 assert.match(css,/right:env\(safe-area-inset-right,0px\)/);
});


test('Sessions: admin stays connected above daily limit; children remain restricted',async()=>{
 const crypto=require('node:crypto');
 const {WebSocket}=require('ws');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-auth-time-limit-'));
 const port=31971;
 const base='http://127.0.0.1:'+port;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());
 const pass=(plain)=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(plain,salt,64).toString('hex')};
 const tokenKey=(token)=>crypto.createHash('sha256').update(token).digest('hex');
 const adminToken='integration-admin-cookie',childToken='integration-child-cookie';
 const adminCookie='gfc_sid='+adminToken,childCookie='gfc_sid='+childToken;
 const users=[
  {id:'integration-admin',name:'Administrador',role:'admin',pass:pass('integration-admin-secret-123'),enabled:true,loginEnabled:true,dailyLimit:1440,version:0,voiceEnabled:true},
  {id:'integration-child',name:'TestChild',role:'child',pass:pass('123456'),enabled:true,loginEnabled:true,dailyLimit:1,version:0,voiceEnabled:true}
 ];
 const session=(id,userId,token,minutes)=>({id,userId,key:tokenKey(token),version:0,revoked:false,expires:Date.now()+86400000,lastTick:Date.now(),daily:{[day]:minutes*60000}});
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({
  users,sessions:[session('session-admin',users[0].id,adminToken,1441),session('session-child',users[1].id,childToken,2)],
  events:[],games:[],pushSubscriptions:[]
 }));
 let proc,socket;
 const api=(url,{cookie,method='GET',body}={})=>fetch(base+'/api/'+url,{
  method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 try{
  proc=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{
   env:{...process.env,PORT:String(port),DATA_DIR:dir,DB_HOST:'',DB_NAME:'',DB_USER:'',DB_PASSWORD:'',ADMIN_PASSWORD:'integration-admin-secret-123',MCGALAXY_ENABLED:'false',MCGALAXY_EXTERNAL:'false'},
   stdio:'ignore'
  });
  let ready=false;
  for(let i=0;i<90;i++){try{if((await api('health')).ok){ready=true;break}}catch{}await sleep(80)}
  assert.ok(ready,'Backend did not start');
  assert.equal((await api('me',{cookie:adminCookie})).status,200,'Admin existing session is valid even after exceeding 24h');
  assert.equal((await api('admin/overview',{cookie:adminCookie})).status,200);
  assert.equal((await api('me',{cookie:childCookie})).status,401,'Child above their limit must be denied');
  socket=new WebSocket('ws://127.0.0.1:'+port+'/ws',{
   headers:{Origin:'https://gamesforchildren.escotilhaprodutora.com',Cookie:adminCookie}
  });
  await Promise.race([
   new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)}),
   sleep(4000).then(()=>{throw Error('Admin WebSocket did not open')})
  ]);
  socket.send(JSON.stringify({type:'lobby'}));
  await sleep(11200); // Observe the server's 10-second session enforcement interval.
  assert.equal(socket.readyState,WebSocket.OPEN,'Admin socket must not be closed by child-only time enforcement');
  assert.equal((await api('me',{cookie:adminCookie})).status,200,'Admin session must not be revoked by periodic enforcement');
  assert.equal((await api('admin/overview',{cookie:adminCookie})).status,200);
  assert.equal((await api('login',{method:'POST',body:{name:'Administrador',password:'integration-admin-secret-123'}})).status,200,'Admin can log in above 24h');
  assert.equal((await api('login',{method:'POST',body:{name:'TestChild',password:'123456'}})).status,401,'Child cannot log in after hitting their limit');
 }finally{
  try{socket?.terminate()}catch{}
  if(proc){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(1900)])}
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:120});
 }
});
