'use strict';
// Persistent, server-owned game host. The actual OpusCraft simulation still runs in
// a headless WebGL2 Chromium page because upstream has no Node dedicated server.
// World + inventories are IndexedDB in the VPS browser profile, NOT children devices.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const chromium=require('@sparticuz/chromium');
const {decide}=require('./opuscraft-npc-brain.cjs');
const ROOT=path.resolve(__dirname,'..');
const SITE=path.join(ROOT,'public','opuscraft');
const PROFILE=path.join(ROOT,'data','opuscraft','profile');
const PORT=Number(process.env.OPUSCRAFT_PORT||4173);
let browser=null,hostPage=null,relay=null,starting=false,stopping=false,lastSave=null,lastError='',tries=0;
let npcTimer=null,npcBusy=false,npcPlanTime=0,npcStep=0,npcDecision='build',npcSource='local';
const log=(...a)=>console.log('[OpusCraft VPS]',...a);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'&&!(req.method==='POST'&&['/__teleport','/__npc/visit'].includes(url.pathname))){res.writeHead(405).end();return}
 if(url.pathname==='/__players'&&req.method==='GET'){
  Promise.resolve(hostPage&&!hostPage.isClosed()?hostPage.evaluate(()=>{
   const g=window.__game,srv=g?.server;
   if(!srv||g.mode!=='host')return [];
   return [...srv.sessions.values()]
    .filter(s=>s.state==='play'&&s.player&&!s.player.removed)
    .map(s=>({name:s.name,x:Math.round(s.player.x*100)/100,y:Math.round(s.player.y*100)/100,z:Math.round(s.player.z*100)/100,
      dimension:srv.level.world.dim.id,mode:s.player.gameMode}));
  }):[]).then(players=>{
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({players}));
  }).catch(e=>{res.writeHead(503).end('World host unavailable')});
  return;
 }
 if(url.pathname==='/__teleport'&&req.method==='POST'){
  // Only the authenticated platform backend can reach this localhost service.
  // The caller and target must both be currently logged-in guests of this exact world.
  let chunks=[],bytes=0;
  req.on('data',b=>{bytes+=b.length;if(bytes>1024){req.destroy();return}chunks.push(b)});
  req.on('end',async()=>{
   try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!/^(ADM|KID)_[A-Za-z0-9_]{6,16}$/.test(body.from||'')||
       !/^(ADM|KID)_[A-Za-z0-9_]{6,16}$/.test(body.to||'')||body.from===body.to)
      throw Error('Invalid player selection');
    if(!hostPage||hostPage.isClosed())throw Error('World unavailable');
    const outcome=await hostPage.evaluate(({from,to})=>{
     const g=window.__game,srv=g?.server;
     if(!srv||g?.mode!=='host'||!g.inWorld)return {ok:false,error:'Mundo indisponível'};
     const sessions=[...srv.sessions.values()].filter(s=>s.state==='play'&&s.player&&!s.player.removed);
     const me=sessions.find(s=>s.name===from),friend=sessions.find(s=>s.name===to);
     if(!me||!friend)return {ok:false,error:'Ambos precisam estar neste mundo'};
     if(me.player.level!==friend.player.level)return {ok:false,error:'Jogadores em dimensões diferentes'};
     const p=friend.player;
     me.teleportTo(p.x,p.y,p.z,p.yaw,p.pitch);
     return {ok:true,dimension:srv.level.world.dim.id};
    },body);
    res.writeHead(outcome.ok?200:409,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(outcome));
   }catch(e){
    res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:String(e.message).slice(0,120)}));
   }
  });return;
 }
 if(url.pathname==='/__npc/status'&&req.method==='GET'){
  Promise.resolve(hostPage&&!hostPage.isClosed()?hostPage.evaluate(()=>
   (window.__gfcNpc?.status?.()||{ok:false,ready:false})): {ok:false,ready:false})
   .then(result=>{
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({...result,brain:npcSource,configured:!!process.env.XAI_API_KEY}));
   }).catch(()=>{res.writeHead(503).end('NPC offline')});
  return;
 }
 if(url.pathname==='/__npc/visit'&&req.method==='POST'){
  let bytes=0,chunks=[];
  req.on('data',part=>{bytes+=part.length;if(bytes>256){req.destroy();return}chunks.push(part)});
  req.on('end',async()=>{
   try{
    const {from}=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!/^ADM_[A-Za-z0-9_]{6,16}$/.test(from||''))throw Error('Identidade invalida');
    if(!hostPage||hostPage.isClosed())throw Error('Mundo indisponivel');
    const result=await hostPage.evaluate(name=>window.__gfcNpc?.visit?.(name)
     ||{ok:false,error:'NPC ainda nao iniciou'},from);
    res.writeHead(result.ok?200:409,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(result));
   }catch(err){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:String(err.message).slice(0,100)}))}
  });return;
 }
 if(url.pathname==='/__ci/world-block'&&process.env.OPUSCRAFT_CI_MARKER==='yes'){
  // Test-only route for the CI runner, disabled completely in production.
  Promise.resolve(hostPage&&!hostPage.isClosed()?hostPage.evaluate(async ({mode,x,z})=>{
   const g=window.__game;
   if(!g||g.mode!=='host'||!g.inWorld||!g.spawned)return {ok:false,error:'host unavailable'};
   const px=mode==='write'?Math.floor(g.player.x):x;
   const pz=mode==='write'?Math.floor(g.player.z):z;
   const y=315;
   if(mode==='write'){
    let state=0;
    for(let yy=Math.min(Math.floor(g.player.y)-2,250);yy>=-60;yy--){
      const candidate=g.level.getState(px,yy,pz);
      if(candidate!==0){state=candidate;break}
    }
    if(state===0)return {ok:false,error:'no non-air block for persistence marker'};
    g.level.setBlock(px,y,pz,state,false);
    await g.saveWorld();
    return {ok:true,x:px,y,z:pz,state,actual:g.level.getState(px,y,pz)};
   }
   return {ok:true,x:px,y,z:pz,state:g.level.getState(px,y,pz)};
  },{mode:url.searchParams.get('mode'),x:Number(url.searchParams.get('x')),z:Number(url.searchParams.get('z'))}):{ok:false}).then(out=>{
   res.writeHead(out?.ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify(out));
  }).catch(err=>{res.writeHead(503).end(JSON.stringify({ok:false,error:String(err.message).slice(0,150)}))});
  return;
 }
 if(url.pathname==='/__debug'){
  // Localhost-only runtime diagnostics; never exposed as a public route.
  Promise.resolve(hostPage&&!hostPage.isClosed()?hostPage.evaluate(()=>{
   const g=window.__game,server=g?.server;
   return {mode:g?.mode,inWorld:g?.inWorld,spawned:g?.spawned,ticks:g?.ticks,
    world:{id:g?.meta?.id||null,created:g?.meta?.created||null,lastPlayed:g?.meta?.lastPlayed||null},
    hostSessions:[...(server?.sessions?.values()||[])].map(p=>({state:p.state,player:p.name||null})),
    hostTicks:server?.ticks||0};
  }):{}).then(info=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(info))})
  .catch(e=>{res.writeHead(503).end(String(e.message).slice(0,100))});
  return;
 }
 if(url.pathname==='/__health'){
  const stats=relay?.stats()||{};
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({ok:true,ready:!!(stats.hosting&&hostPage&&!hostPage.isClosed()),hosting:!!stats.hosting,guests:stats.guests||0,lastSave,error:lastError,attempts:tries}));
  return;
 }
 if(!url.pathname.startsWith('/opuscraft/')){res.writeHead(404).end();return}
 const relative=url.pathname.slice('/opuscraft/'.length)||'index.html';
 if(relative.includes('..')||relative.startsWith('.')){res.writeHead(403).end();return}
 const filename=path.resolve(SITE,relative);
 if(!filename.startsWith(SITE+path.sep)){res.writeHead(403).end();return}
 fs.readFile(filename,(err,buf)=>{
  if(err){res.writeHead(404).end();return}
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'public, max-age=3600'});
  res.end(buf);
 });
});
async function start(){
 if(stopping||starting||hostPage&&!hostPage.isClosed())return;
 starting=true;tries++;
 try{
  fs.mkdirSync(PROFILE,{recursive:true,mode:0o700});
  log('Starting browser host attempt',tries);
  browser=await puppeteer.launch({
   executablePath:await chromium.executablePath(),
   args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--window-size=320,240'],
   headless:true,
   userDataDir:PROFILE,
   defaultViewport:{width:320,height:240,deviceScaleFactor:1},
   protocolTimeout:180000
  });
  browser.on('disconnected',()=>{hostPage=null;browser=null;log('Browser disconnected');});
  const page=await browser.newPage();
  hostPage=page;
  // Rendering an unseen 3D scene consumes VPS CPU without helping players.
  // Keep simulation/network ticks alive while the authoritative host draws nothing.
  await page.evaluateOnNewDocument(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
  });
  page.on('pageerror',err=>{lastError=String(err.message).slice(0,250);log('Game page error:',lastError)});
  page.on('console',msg=>{if(msg.type()==='error')log('Browser console:',msg.text().slice(0,300))});
  await page.goto('http://127.0.0.1:'+PORT+'/opuscraft/index.html?gfcHost=1',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>{const g=window.__game;return !!(g&&g.mode==='host'&&g.inWorld)},{timeout:150000,polling:1000});
  if(!await save())throw Error('The family world did not save successfully to VPS IndexedDB');
  lastError='';
  log('Family world is hosted and backed up in IndexedDB');
 }catch(err){
  lastError=String(err?.message||err).slice(0,300);
  log('Unable to start:',lastError);
  try{await browser?.close()}catch{}
  browser=null;hostPage=null;
 }finally{starting=false}
}
async function save(){
 if(!hostPage||hostPage.isClosed())return false;
 try{
  const done=await hostPage.evaluate(async()=>{
   const game=window.__game;
   if(!game?.inWorld||game.mode!=='host')return false;
   await game.saveWorld();
   return true;
  });
  if(done)lastSave=new Date().toISOString();
  return done;
 }catch(err){lastError='Save error: '+String(err.message).slice(0,160);log(lastError);return false}
}
async function tickNpc(){
 if(stopping||npcBusy||!hostPage||hostPage.isClosed())return;
 npcBusy=true;
 try{
  const status=await hostPage.evaluate(()=>window.__gfcNpc?.status?.()||null);
  if(!status?.ok)return;
  if(!npcPlanTime||Date.now()-npcPlanTime>240000){
   npcPlanTime=Date.now();
   const plan=await decide({playersNearby:status.visitors,blocksBuilt:status.built,
    hasVisitors:status.visitors>0},npcStep++);
   npcDecision=plan.action;npcSource=plan.source;
   if(plan.error)log('NPC using offline fallback:',plan.error);
  }
  await hostPage.evaluate(action=>window.__gfcNpc?.step?.(action),npcDecision);
 }catch(err){log('NPC step failed:',String(err.message).slice(0,150))}
 finally{npcBusy=false}
}
async function stop(){
 if(stopping)return;stopping=true;
 clearInterval(watchTimer);clearInterval(saveTimer);clearInterval(npcTimer);
 try{await Promise.race([save(),new Promise(resolve=>setTimeout(resolve,9000))])}catch{}
 try{await browser?.close()}catch{}
 relay?.close();
 server.close();
 setTimeout(()=>process.exit(0),250).unref();
}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
process.on('unhandledRejection',err=>{lastError=String(err?.message||err);log('Unhandled:',lastError)});
let watchTimer=null,saveTimer=null;
(async()=>{
 // Runtime copy of upstream MIT-licensed relay is built in CI from an exact commit.
 const plugin=await import('./opuscraft-relay.mjs');
 relay=plugin.attachRelay(server,{allowedHosts:['127.0.0.1','localhost'],log});
 server.listen(PORT,'127.0.0.1',async()=>{
  log('Local relay ready on',PORT);
  await start();
  watchTimer=setInterval(async()=>{
   if(stopping||starting)return;
   if(!relay.stats().hosting){if(browser){try{await browser.close()}catch{};browser=null;hostPage=null}await start()}
  },30000);
  saveTimer=setInterval(()=>void save(),60000);
  npcTimer=setInterval(()=>void tickNpc(),20000);
  void tickNpc();
 });
})().catch(err=>{log('Startup failed:',err);process.exit(1)});
