'use strict';
// Transport-only OpusCraft relay. The actual world runs in the browser of one
// authenticated GamesNavagador player, never in a VPS Chromium process.
// The platform proxies authenticated /__mp sockets here from localhost;
// the upstream relay therefore continues enforcing its original localhost
// host-security rule, single-host lock and byte/rate limits.
const http=require('node:http');
const PORT=Number(process.env.OPUSCRAFT_PORT||4173);
let relay;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'||url.pathname!=='/__health'){
  res.writeHead(404,{'Cache-Control':'no-store'}).end('Not Found');
  return;
 }
 const stats=relay.stats();
 res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({ready:true,mode:'player-hosted',hosting:stats.hosting,
   guests:stats.guests,connections:stats.connections}));
});
async function start(){
 const {attachRelay}=await import('./opuscraft-relay.mjs');
 relay=attachRelay(server,{maxConnections:32,maxGuests:7,maxListeners:20,
  log:(msg)=>console.log('[OpusCraft Relay]',msg)});
 server.listen(PORT,'127.0.0.1',()=>{
  console.log('[OpusCraft Relay] player-hosted multiplayer ready on 127.0.0.1:'+PORT);
 });
}
function stop(){relay?.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref()}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
start().catch(err=>{console.error('[OpusCraft Relay]',err);process.exit(1)});
