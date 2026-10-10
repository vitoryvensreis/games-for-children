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

test('Catalog and admin expose three game covers and Minecraft listing',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/classicube/index.html'),'utf8');
 for(const slug of ['pong','snake','minecraft']){
  assert.ok(css.includes("url('/api/game-covers/"+slug+"')"),slug+' illustration is set in CSS');
 }
 assert.ok(app.includes('admin/game-covers'), 'Admin can update cover images');
 assert.match(app,/class="game-card game-card--cover card-minecraft"/);
 assert.match(app,/<h2>Minecraft<\/h2>/);
 assert.match(app,/function refreshGameCovers\(\)/);
 assert.match(app,/data-action="reset"/);
 assert.match(css,/linear-gradient\(180deg,rgba\(9,15,48/,'Cover overlay is present');
 assert.match(html,/left:env\(safe-area-inset-left,0px\)/);
 assert.match(html,/right:env\(safe-area-inset-right,0px\)/);
});
