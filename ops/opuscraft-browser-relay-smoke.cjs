'use strict';
// Transport-level smoke: the original host and guest protocol travel through
// the tiny VPS relay without a WebGL host. No browser-world data lives here.
const WebSocket=require('ws');
const assert=require('node:assert/strict');
const base='ws://127.0.0.1:4173/__mp?role=';
const sockets=[];
const inbox=new WeakMap();
function connect(role){
 return new Promise((resolve,reject)=>{
  const ws=new WebSocket(base+role,{origin:'http://127.0.0.1:4173'});
  sockets.push(ws);
  inbox.set(ws,[]);
  // The relay can send its first frame before 'open' finishes resolving.
  ws.on('message',(data,binary)=>inbox.get(ws).push({data,binary}));
  const timer=setTimeout(()=>reject(Error('Relay timeout for '+role)),7000);
  ws.once('open',()=>{clearTimeout(timer);resolve(ws)});
  ws.once('error',reject);
 });
}
function packet(ws,match,label='relay frame'){
 return new Promise((resolve,reject)=>{
  const messages=inbox.get(ws);
  if(!messages)return reject(Error('Unknown socket'));
  const timer=setTimeout(()=>{ws.off('message',on);reject(Error('Missing '+label))},8000);
  function consume(){
   for(let i=0;i<messages.length;i++){
    let out;
    try{out=match(messages[i].data,messages[i].binary)}
    catch(e){clearTimeout(timer);ws.off('message',on);reject(e);return}
    if(out===undefined)continue;
    messages.splice(i,1);
    clearTimeout(timer);ws.off('message',on);resolve(out);return;
   }
  }
  function on(){consume()}
  ws.on('message',on);
  consume();
 });
}
(async()=>{
 const health=await fetch('http://127.0.0.1:4173/__health').then(r=>r.json());
 assert.equal(health.ready,true);assert.equal(health.mode,'player-hosted');
 assert.equal(health.hosting,false);
 const host=await connect('host');
 const listed=await connect('list');
 const initial=await packet(listed,(b,bin)=>{
  if(bin)return;
  const j=JSON.parse(String(b));
  return j.t==='worlds'?j:undefined;
 },'initial worlds frame');
 assert.deepEqual(initial.worlds,[]);
 const world={id:'TESTLAN',name:'Original OpusCraft',host:'FamilyHost',
  players:1,max:8,protocol:1,build:'smoke'};
 const updated=packet(listed,(b,bin)=>{
  if(bin)return;const j=JSON.parse(String(b));
  return j.t==='worlds'&&j.worlds.length?j:undefined;
 },'updated worlds frame');
 host.send(JSON.stringify({t:'world',world}));
 assert.equal((await updated).worlds[0].name,world.name);
 const join=packet(host,(b,bin)=>{
  if(!bin||b[0]!==1)return;
  return b.readUInt32BE(1);
 },'guest join frame');
 const guest=await connect('guest');
 const id=await join;assert.ok(id>0);
 const received=packet(host,(b,bin)=>{
  if(!bin||b[0]!==2)return;
  return {id:b.readUInt32BE(1),data:b.subarray(5)};
 },'guest payload frame');
 guest.send(Buffer.from([0x7b,0x19]),{binary:true});
 const sent=await received;
 assert.equal(sent.id,id);
 assert.deepEqual([...sent.data],[0x7b,0x19]);
 const returnMessage=packet(guest,(b,bin)=>bin?b:undefined,'host response frame');
 const response=Buffer.alloc(7);response[0]=2;response.writeUInt32BE(id,1);
 response[5]=0x42;response[6]=0x37;
 host.send(response,{binary:true});
 assert.deepEqual([...(await returnMessage)],[0x42,0x37]);
 console.log('OPUSCRAFT_BROWSER_HOST_RELAY_OK');
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>{
 for(const ws of sockets)try{ws.terminate()}catch{}
});
