#!/usr/bin/env node
// Integration proof: load the actual pinned upstream Level and HostServer in
// pure Node. Runs in CI from inside the cloned upstream checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {HeadlessTicker} from './ticker.cjs';
const upstream=process.argv[2];
if(!upstream||!fs.existsSync(path.join(upstream,'src/game/level.ts')))
 throw Error('Expected cloned upstream OpusCraft checkout as argument');
const requireUpstream=createRequire(path.join(upstream,'package.json'));
const {build}=requireUpstream('esbuild');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'opuscraft-node-smoke-'));
try{
 const entry=path.join(temp,'headless-entry.ts');
 fs.writeFileSync(entry,`import '${path.join(upstream,'src/world/blocks.ts').replaceAll('\\','/')}';\nimport {World} from '${path.join(upstream,'src/world/world.ts').replaceAll('\\','/')}';
import {Chunk} from '${path.join(upstream,'src/world/chunk.ts').replaceAll('\\','/')}';
import {Level} from '${path.join(upstream,'src/game/level.ts').replaceAll('\\','/')}';
import {HostServer} from '${path.join(upstream,'src/net/server/hostServer.ts').replaceAll('\\','/')}';
import {encode,decode} from '${path.join(upstream,'src/net/codec.ts').replaceAll('\\','/')}';
import {offlinePlayerUuid} from '${path.join(upstream,'src/net/offlineUuid.ts').replaceAll('\\','/')}';
import {SB,CB} from '${path.join(upstream,'src/net/protocol.ts').replaceAll('\\','/')}';
export {World,Chunk,Level,HostServer,encode,decode,offlinePlayerUuid,SB,CB};`);
 const output=path.join(temp,'server.mjs');
 await build({entryPoints:[entry],outfile:output,bundle:true,format:'esm',platform:'node',
  target:'node22',logLevel:'warning',define:{__BUILD_ID__:JSON.stringify('headless-integration-smoke')}});
 // Reject runtime reliance on browser globals instead of adding mock DOM/WebGL.
 const {World,Chunk,Level,HostServer,encode,decode,offlinePlayerUuid,SB,CB}=await import(pathToFileURL(output).href);
 assert.equal(typeof HostServer,'function','HostServer must be loadable without a browser');
 const world=new World();
 const level=new Level(world,'24h-seed');
 assert.equal(level.world,world);
 assert.equal(level.seed,'24h-seed');
 // Test genuine upstream chunk storage and block-state mutation (not a mock).
 const chunk=new Chunk(0,0,world.dim.lightDefault);
 world.chunks.set(chunk.key,chunk);
 assert.equal(world.getChunk(0,0),chunk);
 assert.equal(world.getState(1,64,1),0);
 const previous=world.setState(1,64,1,1);
 assert.equal(previous,0);
 assert.equal(world.getState(1,64,1),1);

 // Exercise the actual upstream simulation, not merely the TypeScript import.
 assert.equal(typeof level.tick,'function');
 const before=level.gameTime;
 // Wire the real upstream Level to the bounded Node tick scheduler.
 let clock=0,serial=0;
 const pending=new Map();
 const ticker=new HeadlessTicker({
  tick:()=>level.tick(),
  now:()=>clock,
  schedule:(fn,ms)=>{const id=++serial;pending.set(id,{fn,at:clock+ms});return id},
  cancel:id=>pending.delete(id)
 });
 assert.equal(ticker.start(),true);
 for(let i=0;i<4;i++){
  clock+=50;
  const due=[...pending].find(([,job])=>job.at<=clock);
  assert.ok(due,'A simulated 50ms tick should be scheduled');
  pending.delete(due[0]);
  due[1].fn();
 }
 assert.equal(level.gameTime,before+4,'Real Level must advance on bounded Node 20 TPS scheduler');
 assert.equal(ticker.status().ticks,4);
 ticker.stop();
 // Exercise upstream HostServer's lifecycle against a no-browser Transport.
 // Deliberately do not advertise this as playable: without initialized chunks
 // and a real player the original host tick/guest login cannot run yet.
 let messageHandler=null,peerHandler=null,transportClosed=0;
 const disconnected=[];
 const transport={
  send:()=>{},
  onMessage:fn=>{messageHandler=fn},
  onPeer:fn=>{peerHandler=fn},
  disconnect:(peer)=>{disconnected.push({peer,reason:'transport disconnect'})},
  close:()=>{transportClosed++},
  address:()=>null
 };
 const hooks={
  spawnPoint:()=>[0,80,0],
  hostName:()=> 'DedicatedHost',
  worldName:()=> 'FamilyWorld',
  chat:()=>{},
  setTicket:()=>{},
  hostBreaking:()=>null
 };
 const host=new HostServer(level,transport,hooks,{
  lanId:'headless-test',joinCode:'ABCD1234',announce:false
 });
 // Mirror the precise upstream Game.tick ordering:
 // HostServer.receive -> Level.tick -> HostServer.tick.
 // The world currently contains zero chunks and players; this is a server
 // lifecycle proof, not multiplayer join or terrain generation.
 const serverClock=level.gameTime;
 const serverTick=()=>{
  host.receive();
  level.tick();
  host.tick();
 };
 for(let i=0;i<3;i++)serverTick();
 assert.equal(level.gameTime,serverClock+3);

 assert.equal(typeof messageHandler,'function');
 assert.equal(typeof peerHandler,'function');
 assert.equal(host.guestCount(),0);
 // Simulate an upstream transport peer and verify server-side login session
 // allocation, then clean disconnect. A full game login is a later milestone.
 peerHandler('integration-guest',true);
 assert.equal(host.sessions.size,1);
 assert.equal(host.sessions.get('integration-guest').state,'login');
 peerHandler('integration-guest',false);
 assert.equal(host.guestCount(),0);
 // Send an authentic byte-encoded upstream Hello through the transport.
 // This probes real packet decoding, the join-code check and player creation.
 const outbound=[];
 transport.send=(peer,data)=>outbound.push({peer,data});
 peerHandler('full-login-guest',true);
 const name='FamilyOne',uuid=offlinePlayerUuid(name);
 const hello=[SB.Hello,8,'headless-integration-smoke',name,uuid,4,'ABCD1234'];
 messageHandler('full-login-guest',encode([hello]));
 host.receive();
 assert.equal(host.sessions.get('full-login-guest')?.state,'play',
  'The original Hello must create a playable server-side guest; diagnostics='+JSON.stringify({disconnected,session:host.sessions.get('full-login-guest')?.state,outbound:outbound.map(x=>({peer:x.peer,packets:decode(x.data,16*1024*1024)}))}));
 assert.equal(host.guestCount(),1);
 assert.ok(level.playerByUuid(uuid),'Guest player must live in real Level');
 // sendOut is normally invoked from the server tick; confirm login packet.
 host.tick();
 const packets=outbound.flatMap(({data})=>decode(data,16*1024*1024));
 assert.ok(packets.some(p=>p[0]===CB.Login),'Guest must receive original CB.Login');
 peerHandler('full-login-guest',false);
 assert.equal(host.guestCount(),0);
 host.close('smoke complete');
 assert.equal(host.closed,true);
 assert.equal(transportClosed,1);
 assert.equal(pending.size,0);
 console.log('OPUSCRAFT_REAL_HOSTSERVER_LOGIN_PACKET_OK');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
