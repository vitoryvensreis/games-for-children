'use strict';
// One real browser, real WebSocket, original OpusCraft client, dedicated Node.
// Isolated localhost CI verification; no user data and no VPS production.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {WebSocket,WebSocketServer}=require('ws');
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium');
const ROOT=path.resolve(__dirname,'../public/opuscraft'),PORT=4187;
const token='dedicated-ci-'+('z'.repeat(40));
let browser,child;
const wss=new WebSocketServer({noServer:true}),connections=new Set();
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/opuscraft/')){res.writeHead(404).end();return}
 const file=path.resolve(ROOT,url.pathname.slice('/opuscraft/'.length)||'index.html');
 if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));
});
server.on('upgrade',(req,socket,head)=>{
 if(new URL(req.url,'http://localhost').pathname!=='/__dedicated'){socket.destroy();return}
 wss.handleUpgrade(req,socket,head,ws=>{
  connections.add(ws);
  const remote=new WebSocket('ws://127.0.0.1:4185/?token='+encodeURIComponent(token),{perMessageDeflate:false});
  const queue=[];
  const close=()=>{connections.delete(ws);if(ws.readyState<2)ws.close();if(remote.readyState<2)remote.close()};
  remote.on('open',()=>{for(const [data,binary] of queue)remote.send(data,{binary})});
  ws.on('message',(data,binary)=>{if(remote.readyState===WebSocket.OPEN)remote.send(data,{binary});else if(queue.length<20)queue.push([data,binary])});
  remote.on('message',(data,binary)=>{if(ws.readyState===WebSocket.OPEN)ws.send(data,{binary})});
  ws.on('close',close);remote.on('close',close);remote.on('error',close);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(PORT,'127.0.0.1',resolve));
 child=spawn(process.execPath,['ops/opuscraft-headless/run-dedicated.cjs'],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,
   OPUSCRAFT_WORLD_DIR:path.resolve(__dirname,'../tmp/dedicated-ci-world-'+process.pid),
   OPUSCRAFT_SEED:'browser-ci',OPUSCRAFT_JOIN_CODE:'ABCD1234',
   OPUSCRAFT_DEDICATED_TOKEN:token,OPUSCRAFT_DEDICATED_MODE:'creative'},
  stdio:['ignore','pipe','pipe']
 });
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const started=Date.now()+30000;
 while(!output.includes('EXPERIMENTAL_NODE_OPUSCRAFT_READY')&&Date.now()<started){
  if(child.exitCode!==null)throw Error('Dedicated server exited: '+output);
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 if(!output.includes('EXPERIMENTAL_NODE_OPUSCRAFT_READY'))throw Error('Dedicated server did not start: '+output);
 browser=await puppeteer.launch({executablePath:await chromium.executablePath(),headless:true,
  args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--window-size=600,400'],
  defaultViewport:{width:600,height:400},protocolTimeout:150000});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html?mp=dedicated&code=ABCD1234',
  {waitUntil:'domcontentloaded',timeout:45000});
 try{
  await page.waitForFunction(()=>{const g=window.__game;return g?.mode==='client'&&g.inWorld&&g.client?.state==='play'&&g.level?.world?.chunks?.size>0},
   {timeout:90000,polling:500});
 }catch(e){
  const status=await page.evaluate(()=>{const g=window.__game;return {mode:g?.mode,inWorld:g?.inWorld,spawned:g?.spawned,
    clientState:g?.client?.state,reason:g?.client?.endReason,chunks:g?.level?.world?.chunks?.size}});
  throw Error('Dedicated browser failed to load terrain: '+JSON.stringify({status,errors,server:output.slice(-1200)}));
 }
 console.log('OPUSCRAFT_REAL_BROWSER_DEDICATED_WORLD_OK');
})().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{
 for(const ws of connections)try{ws.terminate()}catch{}
 await browser?.close().catch(()=>{});
 if(child){child.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,300))}
 await new Promise(resolve=>server.close(resolve));
});
