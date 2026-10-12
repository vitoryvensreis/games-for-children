'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core');
const chromium=require('@sparticuz/chromium');
const {WebSocket,WebSocketServer}=require('ws');
const PORT=4182,ROOT=path.resolve(__dirname,'../public/opuscraft');
const errors=[],sockets=new Set(),wss=new WebSocketServer({noServer:true,perMessageDeflate:false});
let browser,guestBrowser,stage='init';
const watchdog=setTimeout(()=>{
 console.error('OPUSCRAFT_BROWSER_HOST_TIMEOUT',stage,errors.slice(-12));process.exit(3);
},260000);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css',
 '.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(!u.pathname.startsWith('/opuscraft/')){res.writeHead(404).end();return}
 const rel=u.pathname.slice('/opuscraft/'.length);
 const file=path.resolve(ROOT,rel||'index.html');
 if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404).end('Missing test asset');return}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
 });
});
server.on('upgrade',(req,socket,head)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname!=='/__mp'||!['host','guest','list'].includes(u.searchParams.get('role'))){
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;
 }
 wss.handleUpgrade(req,socket,head,ws=>{
  sockets.add(ws);
  const remote=new WebSocket('ws://127.0.0.1:4173/__mp?role='+u.searchParams.get('role'),{
   headers:{Origin:'http://127.0.0.1:4173'},perMessageDeflate:false,maxPayload:20*1024*1024
  });
  let queued=[];
  const stop=()=>{sockets.delete(ws);if(ws.readyState<2)ws.close();if(remote.readyState<2)remote.close()};
  remote.on('open',()=>{for(const [b,binary] of queued)remote.send(b,{binary});queued=[]});
  ws.on('message',(b,binary)=>{
   if(remote.readyState===WebSocket.OPEN)remote.send(b,{binary});
   else if(remote.readyState===WebSocket.CONNECTING&&queued.length<20)queued.push([b,binary]);
  });
  remote.on('message',(b,binary)=>{if(ws.readyState===WebSocket.OPEN)ws.send(b,{binary})});
  ws.on('close',stop);remote.on('close',stop);
  ws.on('error',e=>errors.push('browser proxy: '+e.message));
  remote.on('error',e=>errors.push('relay: '+e.message));
 });
});
(async()=>{
 await new Promise((resolve,reject)=>server.listen(PORT,'127.0.0.1',e=>e?reject(e):resolve()));
 stage='launch-chromium';
 browser=await puppeteer.launch({
  executablePath:await chromium.executablePath(),headless:true,
  args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader',
   '--use-angle=swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling',
   '--window-size=480,320'],defaultViewport:{width:480,height:320},protocolTimeout:180000
 });
 // A second incognito context in the same Lambda Chromium binary can hang
 // CDP Target.createTarget even BEFORE world generation. Two separate browser
 // processes model different devices and avoid that unsupported target path.
 stage='launch-independent-guest-browser';
 guestBrowser=await puppeteer.launch({
  executablePath:await chromium.executablePath(),headless:true,
  args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader',
   '--use-angle=swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling',
   '--window-size=480,320'],defaultViewport:{width:480,height:320},protocolTimeout:120000
 });
 stage='preallocate-independent-guest';
 const guest=await guestBrowser.newPage();
 guest.on('pageerror',e=>errors.push('guest: '+e.message));
 stage='host-browser';
 const host=await browser.newPage();
 host.on('pageerror',e=>errors.push('host: '+e.message));
 await host.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html?mp=host&quick=1&rd=2&mode=creative&guests=creative',
  {waitUntil:'domcontentloaded',timeout:50000});
 await host.waitForFunction(()=>{
  const g=window.__game;return g?.mode==='host'&&g.inWorld&&g.spawned&&g.lanShare?.code;
 },{timeout:150000,polling:1000});
 // Test the real original game's normal video options; slow the headless
 // host's visuals only so it has CPU headroom to send guest chunks.
 await host.evaluate(()=>{
  const g=window.__game;
  g.opts.maxFps=20;g.opts.renderDistance=2;g.opts.simulationDistance=2;
  g.opts.graphics=0;g.opts.fancy=false;g.opts.smoothLighting=false;
  g.opts.clouds=0;g.opts.particles=2;
 });
 const code=await host.evaluate(()=>window.__game.lanShare.code);
 console.log('OPUSCRAFT_ORIGINAL_BROWSER_HOST_READY',code);
 stage='guest-browser';
 // Upstream prioritizes BroadcastChannel when two tabs share one browser
 // profile; use an isolated browser context to force the real VPS WebSocket.
 await guest.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html?mp=join&code='+encodeURIComponent(code),
  {waitUntil:'domcontentloaded',timeout:70000});
 try{
  await guest.waitForFunction(()=>{const g=window.__game;return g?.mode==='client'&&g.inWorld&&g.spawned},
   {timeout:125000,polling:1000});
 }catch(e){
  const detail=await guest.evaluate(()=>{
   const g=window.__game;return {mode:g?.mode,inWorld:g?.inWorld,spawned:g?.spawned,
    screen:g?.screen?.constructor?.name,reason:g?.client?.endReason,
    clientState:g?.client?.state,transport:g?.client?.transport?.state};
  }).catch(()=>({}));
  throw Error('Guest never finished network join: '+JSON.stringify({detail,errors,error:String(e)}));
 }
 const pair=await Promise.all([
  host.evaluate(()=>({mode:window.__game.mode,guests:window.__game.server?.guestCount?.()})),
  guest.evaluate(()=>({mode:window.__game.mode,inWorld:window.__game.inWorld,
   chunks:window.__game.level?.world?.chunks?.size}))
 ]);
 if(pair[0].guests<1||pair[1].chunks<1)throw Error('World not replicated to guest: '+JSON.stringify(pair));
 const health=await fetch('http://127.0.0.1:4173/__health').then(r=>r.json());
 if(!health.hosting||health.guests<1||health.mode!=='player-hosted'){
  const debug=await Promise.all([
   host.evaluate(()=>({mode:window.__game?.mode,spawned:window.__game?.spawned,
     guests:window.__game?.server?.guestCount?.(),serverTicks:window.__game?.server?.ticks,
     relayStatus:window.__game?.lanShare?.relay?.socket?.readyState,
     sessions:[...(window.__game?.server?.sessions?.values?.()||[])].map(s=>({
      state:s.state,name:s.name,reason:s.endReason}))})),
   guest.evaluate(()=>({mode:window.__game?.mode,spawned:window.__game?.spawned,
     inWorld:window.__game?.inWorld,clientState:window.__game?.client?.state,
     reason:window.__game?.client?.endReason,screen:window.__game?.screen?.constructor?.name,
     hostGone:window.__game?.client?.hostGone}))
  ]);
  throw Error('Browser multiplayer dropped connection: '+JSON.stringify({health,debug,errors}));
 }
 console.log('OPUSCRAFT_ORIGINAL_BROWSER_MULTIPLAYER_OK',JSON.stringify({pair,relay:health}));
})().catch(e=>{console.error(e,errors.slice(-12));process.exitCode=1}).finally(async()=>{
 clearTimeout(watchdog);
 for(const ws of sockets)try{ws.terminate()}catch{}
 if(guestBrowser)await guestBrowser.close().catch(()=>{});
 if(browser)await browser.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
});
