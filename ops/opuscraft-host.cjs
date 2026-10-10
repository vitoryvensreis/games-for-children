'use strict';
// Persistent, server-owned game host. The actual OpusCraft simulation still runs in
// a headless WebGL2 Chromium page because upstream has no Node dedicated server.
// World + inventories are IndexedDB in the VPS browser profile, NOT children devices.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const chromium=require('@sparticuz/chromium');
const ROOT=path.resolve(__dirname,'..');
const SITE=path.join(ROOT,'public','opuscraft');
const PROFILE=path.join(ROOT,'data','opuscraft','profile');
const PORT=Number(process.env.OPUSCRAFT_PORT||4173);
let browser=null,hostPage=null,relay=null,starting=false,stopping=false,lastSave=null,lastError='',tries=0;
const log=(...a)=>console.log('[OpusCraft VPS]',...a);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'){res.writeHead(405).end();return}
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
   args:[...chromium.args,'--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--window-size=1000,700'],
   headless:true,
   userDataDir:PROFILE,
   defaultViewport:{width:1000,height:700,deviceScaleFactor:1},
   protocolTimeout:180000
  });
  browser.on('disconnected',()=>{hostPage=null;browser=null;log('Browser disconnected');});
  const page=await browser.newPage();
  hostPage=page;
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
async function stop(){
 if(stopping)return;stopping=true;
 clearInterval(watchTimer);clearInterval(saveTimer);
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
 });
})().catch(err=>{log('Startup failed:',err);process.exit(1)});
