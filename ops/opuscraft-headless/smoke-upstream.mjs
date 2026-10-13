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
import {saveColumn,loadColumn} from './native-column-store.cjs';
import {writeCheckpoint,readCheckpoint,readCheckpointWithBackup} from './native-checkpoint.cjs';
import {writePlayer,readPlayer} from './native-player-store.cjs';
import {createDedicatedRuntime} from './dedicated-runtime.cjs';
import {EventEmitter,once} from 'node:events';
const requireLocal=createRequire(import.meta.url);
const {WebSocketServer,WebSocket}=requireLocal('ws');
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
import {ChunkGenerator} from '${path.join(upstream,'src/world/gen/generator.ts').replaceAll('\\','/')}';
import {Level} from '${path.join(upstream,'src/game/level.ts').replaceAll('\\','/')}';
import {HostServer} from '${path.join(upstream,'src/net/server/hostServer.ts').replaceAll('\\','/')}';
import {encode,decode} from '${path.join(upstream,'src/net/codec.ts').replaceAll('\\','/')}';
import {offlinePlayerUuid} from '${path.join(upstream,'src/net/offlineUuid.ts').replaceAll('\\','/')}';
import {SB,CB} from '${path.join(upstream,'src/net/protocol.ts').replaceAll('\\','/')}';
import {savePlayer} from '${path.join(upstream,'src/game/playerData.ts').replaceAll('\\','/')}';
import {ItemStack} from '${path.join(upstream,'src/item/item.ts').replaceAll('\\','/')}';
export {World,Chunk,ChunkGenerator,Level,HostServer,encode,decode,offlinePlayerUuid,SB,CB,savePlayer,ItemStack};`);
 const output=path.join(temp,'server.mjs');
 await build({entryPoints:[entry],outfile:output,bundle:true,format:'esm',platform:'node',
  target:'node22',logLevel:'warning',define:{__BUILD_ID__:JSON.stringify('headless-integration-smoke')}});
 // Reject runtime reliance on browser globals instead of adding mock DOM/WebGL.
 const {World,Chunk,ChunkGenerator,Level,HostServer,encode,decode,offlinePlayerUuid,SB,CB,savePlayer,ItemStack}=await import(pathToFileURL(output).href);
 assert.equal(typeof HostServer,'function','HostServer must be loadable without a browser');
 // Boot an independent Node-only dedicated runtime with real upstream
 // HostServer/Level/World, then save and reload a checkpoint.
 const dedicatedDir=path.join(temp,'dedicated-world');
 const runtime=createDedicatedRuntime({
  engine:{World,Level,Chunk,ChunkGenerator,HostServer,savePlayer},wss:new EventEmitter(),
  worldDir:dedicatedDir,seed:'family-integration',joinCode:'ABCD1234'
 });
 // Generate genuine terrain using the unchanged upstream noise/structure engine.
 const nativeTerrain=runtime.generateChunk(1,1);
 assert.equal(runtime.world.getChunk(1,1),nativeTerrain);
 assert.equal(runtime.generateChunk(1,1),nativeTerrain,'Do not overwrite a loaded chunk');
 const terrainState=runtime.world.getState(16,-63,16);
 assert.equal(terrainState,nativeTerrain.getState(0,-63,0));
 const dedicatedChunk=new Chunk(0,0,runtime.world.dim.lightDefault);
 runtime.world.chunks.set(dedicatedChunk.key,dedicatedChunk);
 dedicatedChunk.setState(1,64,1,1);
 runtime.save();
 assert.equal(runtime.status().chunks,2);
 runtime.stop();
 const restarted=createDedicatedRuntime({
  engine:{World,Level,Chunk,ChunkGenerator,HostServer,savePlayer},wss:new EventEmitter(),
  worldDir:dedicatedDir,seed:'family-integration',joinCode:'ABCD1234'
 });
 assert.equal(restarted.restored.source,'primary');
 assert.equal(restarted.world.getState(1,64,1),1);
 assert.equal(restarted.world.getState(16,-63,16),terrainState);
 restarted.stop();

 // Real localhost WebSocket handshake against the original HostServer.
 // This is an integration probe, not a deployed browser or public endpoint.
 const wss=new WebSocketServer({host:'127.0.0.1',port:0});
 try{
  await once(wss,'listening');
  const liveDir=path.join(temp,'ws-live-world');
  const live=createDedicatedRuntime({
   engine:{World,Level,Chunk,ChunkGenerator,HostServer,savePlayer},wss,
   worldDir:liveDir,seed:'ws-integration',joinCode:'ABCD1234',
   authenticate:()=>true
  });
  const ws=new WebSocket('ws://127.0.0.1:'+wss.address().port);
  try{
   await once(ws,'open');
   const received=[];
   ws.on('message',(data)=>received.push(Buffer.from(data)));
   const liveUuid=offlinePlayerUuid('NetworkChild');
   ws.send(Buffer.concat([Buffer.from([0]),Buffer.from(encode([[
    SB.Hello,8,'headless-integration-smoke','NetworkChild',liveUuid,4,'ABCD1234'
   ]]))]));
   // Network delivery and upstream guest login are asynchronous. Drive the
   // real server tick until CB.Login arrives, with a bounded timeout.
   const deadline=Date.now()+5000;
   let frames=[];
   while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,10));
    live.host.receive();
    live.level.tick();
    live.host.tick();
    frames=received.flatMap(bytes=>bytes[0]===0?decode(bytes.subarray(1),16*1024*1024):[]);
    if(frames.some(packet=>packet[0]===CB.Login))break;
   }
   assert.ok(frames.some(packet=>packet[0]===CB.Login),
    'Real websocket guest must receive native CB.Login; session='+JSON.stringify(
     [...live.host.sessions.values()].map(session=>session.state)));
   assert.equal(live.host.guestCount(),1);
   // Continue driving the ORIGINAL host with a real socket, until the first
   // generated terrain column is sent to the connected guest.
   const chunkDeadline=Date.now()+8000;
   while(Date.now()<chunkDeadline&&!frames.some(packet=>packet[0]===CB.LevelChunk)){
    await new Promise(resolve=>setTimeout(resolve,10));
    live.host.receive();
    live.level.tick();
    live.host.tick();
    frames=received.flatMap(bytes=>bytes[0]===0?decode(bytes.subarray(1),16*1024*1024):[]);
   }
   assert.ok(frames.some(packet=>packet[0]===CB.LevelChunk),
    'Dedicated websocket must stream real generated terrain to guest');
   console.log('OPUSCRAFT_DEDICATED_SOCKET_LOGIN_AND_TERRAIN_OK');
  }finally{ws.close();live.stop()}
 }finally{await new Promise(resolve=>wss.close(resolve))}

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
 // Persist real upstream Chunk section arrays and recover into a fresh World.
 const checkpoint=path.join(temp,'chunk-0-0.json');
 saveColumn(checkpoint,chunk);
 const recovered=loadColumn(checkpoint,Chunk);
 assert.equal(recovered.getState(1,64,1),1);
 assert.equal(recovered.modified,false);
 const reloadedWorld=new World();
 reloadedWorld.chunks.set(recovered.key,recovered);
 assert.equal(reloadedWorld.getState(1,64,1),1);
 assert.equal(recovered.cx,0);
 assert.equal(recovered.cz,0);
 // Save two independent upstream columns and verify their coordinates,
 // blocks and biome values survive a clean process-style reload.
 const other=new Chunk(-2,3,world.dim.lightDefault);
 other.setState(4,70,9,1);
 other.biomes[7]=3;
 saveColumn(path.join(temp,'chunk--2-3.json'),other);
 const recoveredOther=loadColumn(path.join(temp,'chunk--2-3.json'),Chunk);
 reloadedWorld.chunks.set(recoveredOther.key,recoveredOther);
 assert.equal(reloadedWorld.getState(-28,70,57),1);
 assert.equal(reloadedWorld.getState(1,64,1),1);
 assert.equal(recoveredOther.biomes[7],3);
 // A malformed checkpoint must stop recovery instead of silently regenerating
 // an empty chunk and deleting a child's construction.
 const corrupted=path.join(temp,'corrupt.json');
 fs.writeFileSync(corrupted,JSON.stringify({format:1,cx:0,cz:0,sections:999}));
 assert.throws(()=>loadColumn(corrupted,Chunk),/Invalid chunk snapshot/);
 // A checkpoint captures all loaded native chunks and the level's clock
 // as one atomic manifest, with strict seed and corruption validation.
 const manifest=path.join(temp,'world-checkpoint.json');
 writeCheckpoint(manifest,{seed:level.seed,gameTime:level.gameTime,dayTime:level.dayTime,chunks:[chunk,other]});
 const restoredWorld=readCheckpoint(manifest,{expectedSeed:'24h-seed',Chunk});
 assert.equal(restoredWorld.chunks.length,2);
 assert.equal(restoredWorld.gameTime,level.gameTime);
 assert.equal(restoredWorld.chunks.find(c=>c.cx===-2).getState(4,70,9),1);
 assert.throws(()=>readCheckpoint(manifest,{expectedSeed:'wrong-world',Chunk}),/Incompatible or corrupt checkpoint/);
 fs.writeFileSync(corrupted,JSON.stringify({version:1,seed:'24h-seed',gameTime:0,dayTime:0,columns:[{format:1,cx:0,cz:0,sections:999}]}));
 assert.throws(()=>readCheckpoint(corrupted,{expectedSeed:'24h-seed',Chunk}));
 // Two successive atomic saves retain the previous known-good generation.
 // If latest is corrupted, restore backup; do not auto-write over it.
 const firstSnapshot=path.join(temp,'rotating-world.json');
 writeCheckpoint(firstSnapshot,{seed:level.seed,gameTime:10,dayTime:10,chunks:[chunk]});
 writeCheckpoint(firstSnapshot,{seed:level.seed,gameTime:20,dayTime:20,chunks:[chunk,other]});
 assert.equal(readCheckpoint(firstSnapshot,{expectedSeed:level.seed,Chunk}).gameTime,20);
 assert.equal(readCheckpoint(firstSnapshot+'.bak',{expectedSeed:level.seed,Chunk}).gameTime,10);
 fs.writeFileSync(firstSnapshot,'{invalid json');
 const recoveredBackup=readCheckpointWithBackup(firstSnapshot,{expectedSeed:level.seed,Chunk});
 assert.equal(recoveredBackup.source,'backup');
 assert.equal(recoveredBackup.gameTime,10);
 assert.equal(recoveredBackup.chunks.length,1);
 assert.throws(()=>readCheckpointWithBackup(firstSnapshot,{expectedSeed:'other-seed',Chunk}),
  /No valid checkpoint available/);
 // Corrupted-but-parseable primary must never overwrite the known-good backup.
 const trustedBackup=fs.readFileSync(firstSnapshot+'.bak','utf8');
 fs.writeFileSync(firstSnapshot,JSON.stringify({
  version:1,seed:level.seed,gameTime:30,dayTime:30,
  columns:[{format:1,cx:0,cz:0,sections:999}]
 }));
 assert.throws(()=>writeCheckpoint(firstSnapshot,{
  seed:level.seed,gameTime:40,dayTime:40,chunks:[chunk]
 }),/Invalid chunk snapshot/);
 assert.equal(fs.readFileSync(firstSnapshot+'.bak','utf8'),trustedBackup);
 assert.equal(readCheckpointWithBackup(firstSnapshot,{expectedSeed:level.seed,Chunk}).gameTime,10);






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
 // Preserve the upstream SavedPlayer payload (including inventory and
 // survival stats) without creating our own incompatible player schema.
 const originalPlayer=level.playerByUuid(uuid);
 originalPlayer.moveTo(6,81,8,45,10);
 originalPlayer.food.level=13;
 originalPlayer.xpLevel=4;
 originalPlayer.inventory.selected=2;
 originalPlayer.inventory.setSlot(2,ItemStack.of('stone',17));
 originalPlayer.inventory.setSlot(5,ItemStack.of('dirt',32));
 const savedPlayer=savePlayer(originalPlayer,world.dim.id);
 assert.equal(savedPlayer.x,6);
 assert.equal(savedPlayer.food,13);
 assert.equal(savedPlayer.xpLevel,4);
 assert.equal(savedPlayer.selected,2);
 assert.deepEqual(savedPlayer.inventory[2],['stone',17,0]);
 assert.deepEqual(savedPlayer.inventory[5],['dirt',32,0]);
 const playerDir=path.join(temp,'players');
 writePlayer(playerDir,uuid,savedPlayer);
 const loadedPlayer=readPlayer(playerDir,uuid);
 assert.deepEqual(loadedPlayer,JSON.parse(JSON.stringify(savedPlayer)),
  'JSON roundtrip intentionally omits undefined optional player fields');
 assert.ok(Array.isArray(loadedPlayer.inventory));
 assert.ok(Array.isArray(loadedPlayer.armor));
 assert.throws(()=>readPlayer(playerDir,'../bad'),/Invalid UUID/);

 // sendOut is normally invoked from the server tick; confirm login packet.
 host.tick();
 const packets=outbound.flatMap(({data})=>decode(data,16*1024*1024));
 assert.ok(packets.some(p=>p[0]===CB.Login),'Guest must receive original CB.Login');
 // A generated upstream Chunk, not just a login screen: prepare the spawn
 // chunk and prove CB.LevelChunk reaches the authenticated guest.
 const spawnChunk=new Chunk(0,5,world.dim.lightDefault);
 world.chunks.set(spawnChunk.key,spawnChunk);
 spawnChunk.lightMerged=true;
 const oldChunkPos=host.sessions.get('full-login-guest').pos;
 host.sessions.get('full-login-guest').pos={x:0,y:80,z:80};
 outbound.length=0;
 for(let i=0;i<3;i++){host.receive();level.tick();host.tick();}
 const chunkPackets=outbound.flatMap(({data})=>decode(data,16*1024*1024));
 assert.ok(chunkPackets.some(p=>p[0]===CB.LevelChunk && p[1]===0 && p[2]===5),
  'Original CB.LevelChunk must be transmitted for loaded visible chunks');
 // After the initial chunk, the server should send only block-state deltas.
 // Use the same chunk already known to this session (no replacement chunk).
 outbound.length=0;
 const oldBlock=world.getState(1,80,81);
 world.setState(1,80,81,oldBlock===1?2:1);
 for(let i=0;i<2;i++){host.receive();level.tick();host.tick();}
 const deltaPackets=outbound.flatMap(({data})=>decode(data,16*1024*1024));
 assert.ok(deltaPackets.some(p=>p[0]===CB.BlockUpdates),
  'Editing a visible chunk must produce CB.BlockUpdates');
 assert.equal(deltaPackets.some(p=>p[0]===CB.LevelChunk),false,
  'A single block edit should not resend an entire chunk');


 // A second real guest must receive the same block mutation, independently.
 const name2='FamilyTwo',uuid2=offlinePlayerUuid(name2);
 peerHandler('second-guest',true);
 messageHandler('second-guest',encode([[SB.Hello,8,'headless-integration-smoke',name2,uuid2,4,'ABCD1234']]));
 host.receive();
 assert.equal(host.sessions.get('second-guest')?.state,'play');
 assert.equal(host.guestCount(),2);
 const second=host.sessions.get('second-guest');
 second.pos={x:0,y:80,z:80};
 outbound.length=0;
 for(let i=0;i<3;i++){host.receive();level.tick();host.tick();}
 const packets2=outbound.filter(x=>x.peer==='second-guest').flatMap(x=>decode(x.data,16*1024*1024));
 assert.ok(packets2.some(p=>p[0]===CB.LevelChunk && p[1]===0 && p[2]===5),
  'Second player receives the same upstream chunk');
 outbound.length=0;
 const blockBefore=world.getState(2,80,81);
 const blockAfter=blockBefore===1?2:1;
 world.setState(2,80,81,blockAfter);
 for(let i=0;i<2;i++){host.receive();level.tick();host.tick();}
 for(const peer of ['full-login-guest','second-guest']){
  const received=outbound.filter(x=>x.peer===peer).flatMap(x=>decode(x.data,16*1024*1024));
  assert.ok(received.some(p=>p[0]===CB.BlockUpdates),
   'Shared block updates must reach '+peer);
  assert.equal(received.some(p=>p[0]===CB.LevelChunk),false,
   'No full chunk resend for '+peer);
 }
 peerHandler('second-guest',false);
 peerHandler('full-login-guest',false);
 assert.equal(host.guestCount(),0);
 // Allow the original Level to prune disconnected player entities before
 // their UUID can be used for a new login.
 level.tick();
 assert.equal(level.playerByUuid(uuid),null,'Disconnected player must leave Level');
 // Reconnect with the actual original loadGuest hook, reading the persisted
 // SavedPlayer; login resumes asynchronously on a later server receive tick.
 hooks.loadGuest=(playerUuid)=>readPlayer(playerDir,playerUuid);
 peerHandler('full-login-guest',true);
 messageHandler('full-login-guest',encode([hello]));
 host.receive();
 for(let i=0;i<5;i++)await Promise.resolve();
 host.receive();
 const returning=host.sessions.get('full-login-guest');
 assert.equal(returning?.state,'play',
  'SavedPlayer must be restored through upstream loadGuest on reconnect');
 assert.equal(returning.player.uuid,uuid);
 assert.equal(returning.player.x,loadedPlayer.x);
 assert.equal(returning.player.food.level,loadedPlayer.food);
 assert.equal(returning.player.y,loadedPlayer.y);
 assert.equal(returning.player.z,loadedPlayer.z);
 assert.equal(returning.player.xpLevel,4);
 assert.equal(returning.player.inventory.selected,2);
 assert.equal(returning.player.inventory.main[2]?.item.id,'stone');
 assert.equal(returning.player.inventory.main[2]?.count,17);
 assert.equal(returning.player.inventory.main[5]?.item.id,'dirt');
 assert.equal(returning.player.inventory.main[5]?.count,32);
 assert.equal(returning.player.inventory.main.length,loadedPlayer.inventory.length);
 peerHandler('full-login-guest',false);
 assert.equal(host.guestCount(),0);
 host.close('smoke complete');
 assert.equal(host.closed,true);
 assert.equal(transportClosed,1);
 assert.equal(pending.size,0);
 console.log('OPUSCRAFT_REAL_HOSTSERVER_LOGIN_PACKET_OK');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
