'use strict';
// Standalone experimental ONLY: same-host HTTPS proxy required. No main app edits.
// Serves the built WebGL client and forwards its original websocket frames to
// the dedicated Node runtime; protects both with one private pilot password.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const PORT=Number(process.env.OPUSCRAFT_PILOT_PORT||4186);
const ORIGIN=process.env.OPUSCRAFT_PILOT_ORIGIN;
const PASSWORD=process.env.OPUSCRAFT_PILOT_PASSWORD;
const TOKEN=process.env.OPUSCRAFT_DEDICATED_TOKEN;
const ROOT=path.resolve(__dirname,'../../public/opuscraft');
const sessions=new Map();
if(!ORIGIN||!ORIGIN.startsWith('https://')||new URL(ORIGIN).origin!==ORIGIN||
 !PASSWORD||PASSWORD.length<20||!TOKEN||TOKEN.length<32)
 throw Error('HTTPS pilot origin, password (20+), and dedicated token (32+) required');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
function auth(req){
 const v=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('opus_pilot='))?.slice(11);
 if(!v)return false;
 const expiry=sessions.get(v);
 if(!expiry||expiry<Date.now()){sessions.delete(v);return false}
 return true;
}
function reject(res,status,text){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(text)}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'&&url.pathname==='/__pilot/login'){
  let body='',overflow=false;
  req.on('data',b=>{body+=b;if(body.length>1024){overflow=true;req.destroy()}});
  req.on('end',()=>{
   if(overflow)return;
   const provided=new URLSearchParams(body).get('password')||'';
   const a=crypto.createHash('sha256').update(provided).digest();
   const b=crypto.createHash('sha256').update(PASSWORD).digest();
   if(!crypto.timingSafeEqual(a,b))return reject(res,403,'Senha incorreta');
   const sid=crypto.randomBytes(32).toString('hex');
   sessions.set(sid,Date.now()+12*3600*1000);
   res.writeHead(303,{'Set-Cookie':'opus_pilot='+sid+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200',
    Location:'/opuscraft/index.html?mp=dedicated&code='+encodeURIComponent(process.env.OPUSCRAFT_JOIN_CODE||''),'Cache-Control':'no-store'}).end();
  });return;
 }
 if(!auth(req)){
  if(req.method!=='GET'||url.pathname!=='/')return reject(res,401,'Acesso restrito');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
   'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
   'X-Content-Type-Options':'nosniff'});
  return res.end('<!doctype html><html lang="pt-br"><meta charset="utf-8"><title>Minecraft experimental</title><form method="POST" action="/__pilot/login"><h2>Minecraft experimental</h2><label>Senha de acesso <input type="password" name="password" required></label><button>Entrar</button></form></html>');
 }
 if(req.method!=='GET'&&! (req.method==='HEAD'))return reject(res,405,'Método inválido');
 if(url.pathname==='/'){res.writeHead(302,{Location:'/opuscraft/index.html?mp=dedicated&code='+encodeURIComponent(process.env.OPUSCRAFT_JOIN_CODE||'')}).end();return}
 if(!url.pathname.startsWith('/opuscraft/'))return reject(res,404,'Não encontrado');
 const file=path.resolve(ROOT,url.pathname.slice('/opuscraft/'.length)||'index.html');
 if(!file.startsWith(ROOT+path.sep))return reject(res,403,'Acesso negado');
 fs.readFile(file,(err,buf)=>{
  if(err)return reject(res,404,'Arquivo não encontrado');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:buf);
 });
});
const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024,perMessageDeflate:false});
const open=new Set();
server.on('upgrade',(req,socket,head)=>{
 if(req.headers.origin!==ORIGIN||!auth(req)||new URL(req.url,'http://localhost').pathname!=='/__dedicated'){
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return}
 wss.handleUpgrade(req,socket,head,ws=>{
  open.add(ws);
  const target=new WebSocket('ws://127.0.0.1:4185/?token='+encodeURIComponent(TOKEN),{perMessageDeflate:false,maxPayload:2*1024*1024});
  let queue=[],total=0;
  const close=()=>{open.delete(ws);if(ws.readyState<2)ws.close();if(target.readyState<2)target.close()};
  target.on('open',()=>{for(const [b,binary] of queue)target.send(b,{binary});queue=[]});
  ws.on('message',(b,binary)=>{
   if(target.readyState===WebSocket.OPEN){if(target.bufferedAmount>4*1024*1024)return close();target.send(b,{binary})}
   else if(target.readyState===WebSocket.CONNECTING&&total+b.length<=524288&&queue.length<32){queue.push([b,binary]);total+=b.length}
   else close();
  });
  target.on('message',(b,binary)=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>8*1024*1024)return close();ws.send(b,{binary})}});
  ws.on('close',close);ws.on('error',close);target.on('error',close);target.on('close',close);
 });
});
server.listen(PORT,'127.0.0.1',()=>console.log('OPUSCRAFT_EXPERIMENTAL_GATEWAY_READY',PORT));
function stop(){for(const ws of open)ws.terminate();wss.close();server.close()}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
