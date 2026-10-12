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
let stage='init',guestPage=null,guestPage2=null;
const watchdog=setTimeout(()=>{
 console.error('OPUSCRAFT_GUEST_TIMEOUT stage='+stage,errors.slice(-12));
 process.exit(3);
},255000);
const diagnostics=setInterval(async()=>{
 try{
  const info=await guestPage?.evaluate(()=>{const g=window.__game,c=g?.client;return {mode:g?.mode,inWorld:g?.inWorld,spawned:g?.spawned,clientState:c?.state,connection:c?.transport?.state,reason:c?.endReason,screen:g?.screen?.constructor?.name,screenTitle:g?.screen?.title,screenReason:g?.screen?.reason,wait:c?.loading,recent:c?.latelyIds?.slice(-5)};});
  const second=await guestPage2?.evaluate(()=>({mode:window.__game?.mode,spawned:window.__game?.spawned,clientState:window.__game?.client?.state,screen:window.__game?.screen?.constructor?.name,screenTitle:window.__game?.screen?.title,screenReason:window.__game?.screen?.reason})).catch(()=>({error:'second busy'}));
 const relayState=await fetch('http://127.0.0.1:4173/__health').then(r=>r.json()).catch(()=>({}));
  const hostState=await fetch('http://127.0.0.1:4173/__debug',{signal:AbortSignal.timeout(2500)}).then(r=>r.json()).catch(()=>({error:'host busy'}));
  console.log('Guest smoke progress:',stage,JSON.stringify({info,second,relay:{hosting:relayState.hosting,guests:relayState.guests},host:hostState}));
 }catch{console.log('Guest smoke progress:',stage)}
},12000);
diagnostics.unref?.();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/me'){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  const adult=req.headers['x-gfc-test-profile']==='adult';
  return res.end(JSON.stringify({user:{id:adult?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',role:adult?'admin':'child',dailyLimit:1440,usedSeconds:0}}));
 }
 if(u.pathname==='/api/opuscraft/identity'){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  const playerName=req.headers['x-gfc-test-profile']==='adult'?'ADM_TESTPLAYER':'KID_TESTPLAYER';
  return res.end(JSON.stringify({playerName,joinCode:'GFC2026X'}));
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
 if(u.pathname!=='/ws'||u.searchParams.get('opus')!=='1'||!['guest','list'].includes(u.searchParams.get('role'))){
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
 }
 wss.handleUpgrade(req,socket,head,ws=>{
  sockets.add(ws);
  const dest=new WebSocket('ws://127.0.0.1:4173/__mp?role='+u.searchParams.get('role'),{
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
  // Verify the same public route used by the PWA before launching the game.
  const worlds=await new Promise((resolve,reject)=>{
   const ws=new WebSocket('ws://127.0.0.1:'+PORT+'/ws?opus=1&role=list');
   const timeout=setTimeout(()=>{ws.terminate();reject(new Error('OpusCraft public WebSocket list timed out'))},7000);
   ws.on('message',data=>{
    clearTimeout(timeout);
    try{
     const result=JSON.parse(String(data));
     if(result.t!=='worlds'||!Array.isArray(result.worlds)||!result.worlds.length)
      throw new Error('Expected a real OpusCraft world announcement, got '+String(data).slice(0,100));
     resolve(result.worlds);
    }catch(error){reject(error)}
    ws.close();
   });
   ws.on('error',error=>{clearTimeout(timeout);reject(error)});
   ws.on('close',()=>clearTimeout(timeout));
  });
  console.log('OPUSCRAFT_PUBLIC_RELAY_DISCOVERY_OK worlds='+worlds.length);
  // Prove localhost-only teleport POST is routed to the host handler,
  // rather than accidentally rejected by the static-file GET guard.
  const teleportProbe=await fetch('http://127.0.0.1:4173/__teleport',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({from:'',to:''})
  });
  if(teleportProbe.status!==400)
   throw Error('Teleport endpoint is not active (expected 400 for invalid names, got '+teleportProbe.status+')');
  console.log('OPUSCRAFT_TELEPORT_ROUTE_OK');
  stage='launch-browser';console.log('Guest smoke: launching guest browser');
  browser=await puppeteer.launch({
   executablePath:await chromium.executablePath(),
   headless:true,
   args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader',
     '--ignore-gpu-blocklist','--disable-background-timer-throttling','--window-size=480,320'],
   defaultViewport:{width:480,height:320},protocolTimeout:180000
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
   return !!(g&&g.mode==='client'&&g.inWorld&&g.client&&g.spawned);
  },{timeout:145000,polling:1000});
  const status=await page.evaluate(()=>({
   mode:window.__game?.mode,inWorld:window.__game?.inWorld,spawned:window.__game?.spawned,
   name:window.__game?.client?.me?.name||'',
   renderDistance:window.__game?.opts?.renderDistance,
   hostViewDistance:window.__game?.client?.info?.viewDistance,
  }));
  if(status.renderDistance!==2||status.hostViewDistance!==2)
   throw Error('Desktop family client still restricted to two-chunk horizon: '+JSON.stringify(status));
  // Real desktop framebuffers react to per-device quality; the VPS/world
  // geometry/chunk radius must not change. The default remains automatic.
  const desktopQuality=await page.evaluate(()=>{
   const q=window.__gfcQuality,g=window.__game;
   const before=g.canvas.width,rd=g.opts.renderDistance;
   if(!q||q.status().mode!=='auto'||q.status().mobile)throw Error('Desktop auto quality not initialized');
   if(!q.setMode('quality'))throw Error('Desktop quality override unavailable');
   const qualityWidth=g.canvas.width;
   if(qualityWidth<=before)throw Error('Quality selection did not increase desktop framebuffer');
   q.setMode('auto');
   if(g.opts.renderDistance!==rd||g.canvas.width!==before)throw Error('Quality changed world radius or failed restoration');
   return {before,qualityWidth,restored:g.canvas.width,scale:q.status().scale};
  });
  console.log('OPUSCRAFT_DESKTOP_ADAPTIVE_QUALITY_OK',JSON.stringify(desktopQuality));
  console.log('OPUSCRAFT_FAMILY_DESKTOP_CHUNK_RADIUS_OK',JSON.stringify({
   client:status.renderDistance,server:status.hostViewDistance}));
  const stats=await fetch('http://127.0.0.1:4173/__health').then(r=>r.json());
  if(!stats.ready||stats.guests<1)throw Error('The server did not record the guest connection: '+JSON.stringify(stats));
  const roster=await fetch('http://127.0.0.1:4173/__players').then(r=>r.json());
  if(!roster.players?.some(p=>p.name==='KID_TESTPLAYER'))
   throw Error('The server roster did not include the connected child: '+JSON.stringify(roster));
  console.log('OPUSCRAFT_LIVE_ROSTER_OK');

  console.log('OPUSCRAFT_GUEST_JOIN_SUCCESS',JSON.stringify({status,serverGuests:stats.guests}));
  // The family client must work on two different devices and user accounts at once.
  stage='second-player-join';
  // In the CI's software-rendered WebGL environment, do not spend CPU/GPU
  // drawing the first guest while the second device is starting. The game
  // still advances network/simulation via its fallback tick timer.
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
  });
  console.log('OPUSCRAFT_FIRST_GUEST_RENDER_PAUSED_FOR_SECOND_JOIN');

  const page2=await browser.newPage();guestPage2=page2;
  // Exercise the same multiplayer on a simulated touch iPhone viewport.
  await page2.setViewport({width:390,height:700,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await page2.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await page2.setExtraHTTPHeaders({'x-gfc-test-profile':'adult'});
  page2.on('pageerror',e=>errors.push('second page: '+e.message));
  page2.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push('second console '+m.type()+': '+m.text().slice(0,380))});
  // Regression: the real catalog URL must open the title rather than the map.
  stage='native-title';
  await page2.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html',
    {waitUntil:'domcontentloaded',timeout:85000});
  await page2.waitForFunction(()=>{
    const g=window.__game;
    return !!(g&&g.mode==='single'&&!g.inWorld&&window.__gfcFamilyActions?.preflight);
  },{timeout:50000,polling:1000});
  console.log('OPUSCRAFT_NATIVE_TITLE_READY');
  stage='second-player-join';
  await page2.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html?gfcJoin=1',
    {waitUntil:'domcontentloaded',timeout:85000});
  await page2.waitForFunction(()=>{const g=window.__game;return !!(g?.mode==='client'&&g.inWorld&&g.spawned)},{
   timeout:105000,polling:1000
  });
  const mobileQuality=await page2.evaluate(()=>{
   const q=window.__gfcQuality,g=window.__game;
   if(!q||!q.status().mobile||q.status().mode!=='auto')throw Error('Mobile auto quality not initialized');
   const initial=g.canvas.width,rd=g.opts.renderDistance;
   q.setMode('performance');
   const performanceWidth=g.canvas.width;
   q.setMode('quality');
   const qualityWidth=g.canvas.width;
   if(!(performanceWidth<initial&&initial<qualityWidth))throw Error('Mobile presets did not change framebuffer correctly');
   q.setMode('auto');
   if(g.canvas.width!==initial||g.opts.renderDistance!==rd)throw Error('Mobile solo-safe quality restoration failed');
   return {initial,performanceWidth,qualityWidth,restored:g.canvas.width};
  });
  console.log('OPUSCRAFT_MOBILE_ADAPTIVE_QUALITY_OK',JSON.stringify(mobileQuality));
  const readyPlayers=await fetch('http://127.0.0.1:4173/__players').then(r=>r.json());
  const kid=readyPlayers.players?.find(p=>p.name==='KID_TESTPLAYER');
  const adm=readyPlayers.players?.find(p=>p.name==='ADM_TESTPLAYER');
  if(!kid||!adm)throw Error('The server did not show both family players: '+JSON.stringify(readyPlayers));
  const live=await fetch('http://127.0.0.1:4173/__health').then(r=>r.json());
  if(live.guests!==2)throw Error('Expected two simultaneous connections, got '+JSON.stringify(live));
  console.log('OPUSCRAFT_TWO_PLAYERS_ONLINE_OK',JSON.stringify({guests:live.guests,players:[kid.name,adm.name]}));
  stage='cross-client-visibility';
  await Promise.all([page,page2].map((p,i)=>p.waitForFunction(expected=>{
   const g=window.__game;
   return !!(g?.spawned&&g.level?.players()?.some(p=>p.profileName===expected));
  },{timeout:45000,polling:750},i===0?'ADM_TESTPLAYER':'KID_TESTPLAYER')));
  console.log('OPUSCRAFT_TWO_PLAYERS_VISIBLE_OK');

  // Exercise the real authority-side teleport RPC using two live sessions.
  // The game server, not the caller's JavaScript, must accept and execute it.
  stage='server-teleport';
  const tp=await fetch('http://127.0.0.1:4173/__teleport',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({from:kid.name,to:adm.name}),
   signal:AbortSignal.timeout(20000)
  });
  const tpResult=await tp.json();
  if(tp.status!==200||!tpResult.ok)
   throw Error('The live two-player teleport failed: '+JSON.stringify({status:tp.status,result:tpResult}));
  console.log('OPUSCRAFT_TWO_PLAYER_TELEPORT_OK',JSON.stringify(tpResult));

  // NPC is the existing host avatar; it must not take another family player slot.
  const npc=await fetch('http://127.0.0.1:4173/__npc/status').then(r=>r.json());
  if(!npc.ok||npc.name!=='Andarilha'||!npc.hidden||npc.role!=='invisible_host'||npc.brain!=='disabled')
   throw Error('Invisible hosting spectator not ready: '+JSON.stringify(npc));
  const visit=await fetch('http://127.0.0.1:4173/__npc/visit',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:adm.name})
  });
  const visitResult=await visit.json();
  if(visit.status!==200||!visitResult.ok)
   throw Error('Administrator could not visit resident: '+JSON.stringify(visitResult));
  const badVisit=await fetch('http://127.0.0.1:4173/__npc/visit',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:kid.name})
  });
  if(badVisit.status!==400)throw Error('Child identity was accepted as an administrator by the NPC host');
  const invalidAttraction=await fetch('http://127.0.0.1:4173/__npc/visit',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({from:adm.name,attraction:'nonexistent-world-coordinate'})
  });
  if(invalidAttraction.status!==400)
   throw Error('Arbitrary administrator coordinates were accepted by landmark teleport');
  console.log('OPUSCRAFT_NPC_ADMIN_VISIT_OK');


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
