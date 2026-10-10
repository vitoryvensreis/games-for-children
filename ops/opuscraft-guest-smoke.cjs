'use strict';
// Runs only in CI against a running local ops/opuscraft-host.cjs.
// Proves an authenticated-style family client actually enters the hosted world,
// instead of merely passing the headless-host health check.
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const chromium=require('@sparticuz/chromium');
const {WebSocket,WebSocketServer}=require('ws');
const PORT=4182;
const sockets=new Set();
const wss=new WebSocketServer({noServer:true,perMessageDeflate:false});
const errors=[];
let stage='init',guestPage=null;
const watchdog=setTimeout(()=>{
 console.error('OPUSCRAFT_GUEST_TIMEOUT stage='+stage,errors.slice(-12));
 process.exit(3);
},150000);
const diagnostics=setInterval(async()=>{
 try{
  const info=await guestPage?.evaluate(()=>({mode:window.__game?.mode,inWorld:window.__game?.inWorld,client:!!window.__game?.client}));
  console.log('Guest smoke progress:',stage,JSON.stringify(info));
 }catch{console.log('Guest smoke progress:',stage)}
},12000);
diagnostics.unref?.();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/opuscraft/identity'){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  return res.end(JSON.stringify({playerName:'KID_TESTPLAYER',joinCode:'GFC2026X'}));
 }
 if(!u.pathname.startsWith('/opuscraft/')){res.writeHead(404).end();return}
 const proxy=http.get('http://127.0.0.1:4173'+req.url,upstream=>{
  res.writeHead(upstream.statusCode,upstream.headers);
  upstream.pipe(res);
 });
 proxy.on('error',e=>{errors.push(String(e));if(!res.headersSent)res.writeHead(502);res.end()});
});
server.on('upgrade',(req,socket,head)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname!=='/ws'||u.searchParams.get('opus')!=='1'||u.searchParams.get('role')!=='guest'){
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
 }
 wss.handleUpgrade(req,socket,head,ws=>{
  sockets.add(ws);
  const dest=new WebSocket('ws://127.0.0.1:4173/__mp?role=guest',{
   headers:{Origin:'http://127.0.0.1:4173'},perMessageDeflate:false,maxPayload:20*1024*1024
  });
  let queue=[];
  const close=()=>{
   sockets.delete(ws);
   if(ws.readyState===WebSocket.OPEN)ws.close();
   if(dest.readyState===WebSocket.OPEN)dest.close();
  };
  ws.on('message',(b,binary)=>{
   if(dest.readyState===WebSocket.OPEN)dest.send(b,{binary});
   else if(dest.readyState===WebSocket.CONNECTING && queue.length<10)queue.push([b,binary]);
  });
  dest.on('open',()=>{for(const [b,binary] of queue)dest.send(b,{binary});queue=[]});
  dest.on('message',(b,binary)=>{if(ws.readyState===WebSocket.OPEN)ws.send(b,{binary})});
  ws.on('close',close);dest.on('close',close);ws.on('error',e=>errors.push(String(e)));
  dest.on('error',e=>errors.push(String(e)));
 });
});
(async()=>{
 let browser;
 try{
  await new Promise((resolve,reject)=>server.listen(PORT,'127.0.0.1',e=>e?reject(e):resolve()));
  stage='launch-browser';console.log('Guest smoke: launching guest browser');
  browser=await puppeteer.launch({
   executablePath:await chromium.executablePath(),
   headless:true,
   args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader',
     '--ignore-gpu-blocklist','--disable-background-timer-throttling','--window-size=960,600'],
   defaultViewport:{width:960,height:600},protocolTimeout:180000
  });
  stage='new-page';
  const page=await browser.newPage();guestPage=page;
  page.on('pageerror',e=>errors.push('page: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,240))});
  stage='load-game';console.log('Guest smoke: loading game');
  await page.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html?gfcJoin=1',
    {waitUntil:'domcontentloaded',timeout:45000});
  stage='join-world';console.log('Guest smoke: waiting for authenticated multiplayer login');
  await page.waitForFunction(()=>{
   const g=window.__game;
   return !!(g&&g.mode==='client'&&g.inWorld&&g.client);
  },{timeout:115000,polling:1000});
  const status=await page.evaluate(()=>({
   mode:window.__game?.mode,inWorld:window.__game?.inWorld,
   name:window.__game?.client?.me?.name||'',
  }));
  const stats=await fetch('http://127.0.0.1:4173/__health').then(r=>r.json());
  if(!stats.ready||stats.guests<1)throw Error('The server did not record the guest connection: '+JSON.stringify(stats));
  console.log('OPUSCRAFT_GUEST_JOIN_SUCCESS',JSON.stringify({status,serverGuests:stats.guests}));
 }catch(err){
  console.error('OpusCraft guest multiplayer smoke failed:',err?.stack||err);
  if(errors.length)console.error('Diagnostics:',errors.slice(-20));
  process.exitCode=1;
 }finally{
  stage='cleanup';clearTimeout(watchdog);clearInterval(diagnostics);
  try{await Promise.race([browser?.close(),new Promise(resolve=>setTimeout(resolve,6000))])}catch{}
  for(const ws of sockets)try{ws.terminate()}catch{}
  wss.close();server.closeAllConnections?.();server.close();
 }
})();
