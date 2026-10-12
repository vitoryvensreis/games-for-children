'use strict';
// Bridge a Node ws.WebSocketServer to the ORIGINAL upstream Transport API.
// Server bootstrap and authenticated routing are deliberately separate;
// this module never opens a public port or changes the production relay.
const crypto=require('node:crypto');
const MAX_BYTES=2*1024*1024;
function createWebSocketTransport(wss,{authenticate=()=>true}={}){
 if(!wss||typeof wss.on!=='function')throw Error('WebSocketServer required');
 const peers=new Map();
 let message=()=>{},change=()=>{},closed=false;
 const onConnection=(ws,request)=>{
  if(closed){ws.close(1012,'Server unavailable');return}
  if(!authenticate(request)){ws.close(1008,'Unauthorized');return}
  const id=crypto.randomUUID();
  peers.set(id,ws);
  change(id,true);
  ws.on('message',(raw,isBinary)=>{
   if(!peers.has(id))return;
   if(!isBinary){ws.close(1003,'Binary protocol only');return}
   const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
   if(bytes.length>MAX_BYTES){ws.close(1009,'Packet too large');return}
   message(id,new Uint8Array(bytes));
  });
  ws.on('close',()=>{if(peers.delete(id))change(id,false)});
  ws.on('error',()=>{if(peers.delete(id))change(id,false)});
 };
 wss.on('connection',onConnection);
 return {
  onMessage:cb=>{message=cb},
  onPeer:cb=>{change=cb},
  send:(id,bytes)=>{
   const ws=peers.get(id);
   if(!ws||ws.readyState!==1)return;
   if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)
    throw Error('Invalid outbound packet');
   ws.send(bytes,{binary:true});
  },
  disconnect:id=>{const ws=peers.get(id);if(ws){peers.delete(id);change(id,false);ws.close(1000,'Disconnected')}},
  close:()=>{if(closed)return;closed=true;wss.off('connection',onConnection);
   for(const id of [...peers.keys()]){const ws=peers.get(id);peers.delete(id);change(id,false);ws.close(1001,'Server closing')}
  },
  peerCount:()=>peers.size
 };
}
module.exports={createWebSocketTransport};
