'use strict';
// EXPERIMENTAL: Node process wiring for the original upstream HostServer.
// Not deployed or publicly routed. Terrain generation and full world-save
// integration must be completed before this can host a family world.
const fs=require('node:fs');
const path=require('node:path');
const {HeadlessTicker}=require('./ticker.cjs');
const {createChunkDemand}=require('./chunk-demand.cjs');
const {createWebSocketTransport}=require('./ws-transport.cjs');
const {readCheckpointWithBackup,writeCheckpoint}=require('./native-checkpoint.cjs');
const {readPlayer,writePlayer}=require('./native-player-store.cjs');
function createDedicatedRuntime({engine,wss,worldDir,seed,joinCode,hostName='Family Server',worldName='Family World',authenticate,gameMode='survival'}){
 if(!engine?.World||!engine?.Level||!engine?.Chunk||!engine?.HostServer||!engine?.savePlayer||!engine?.ChunkGenerator)
  throw Error('Original upstream world, level, host and player serializer required');
 if(!worldDir||typeof seed!=='string'||!seed||typeof joinCode!=='string'||!joinCode)
  throw Error('World directory, seed and join code required');
 if(!['survival','creative'].includes(gameMode))throw Error('Invalid experimental game mode');
 const {World,Level,Chunk,HostServer,savePlayer,ChunkGenerator}=engine;
 const generator=new ChunkGenerator(seed);
 const checkpoint=path.join(worldDir,'world.json');
 const playerDir=path.join(worldDir,'players');
 const world=new World();
 const level=new Level(world,seed);
 let restored=null;
 // If a checkpoint exists but is invalid, fail closed; NEVER start an empty
 // world in its place. This protects the family's constructions.
 if(fs.existsSync(checkpoint)||fs.existsSync(checkpoint+'.bak')){
  restored=readCheckpointWithBackup(checkpoint,{expectedSeed:seed,Chunk});
  for(const chunk of restored.chunks){
   chunk.lightMerged=true;
   world.chunks.set(chunk.key,chunk);
  }
  level.gameTime=restored.gameTime;
  level.dayTime=restored.dayTime;
 }
 // Uses the original OpusCraft terrain pipeline, including its pending writes,
 // instead of fabricating empty spawn chunks. Initial generation is opt-in
 // until off-thread scheduling and world metadata persistence are finished.
 function generateChunk(cx,cz){
  if(!Number.isInteger(cx)||!Number.isInteger(cz))throw Error('Invalid chunk coordinates');
  const existing=world.getChunk(cx,cz);
  if(existing)return existing;
  return world.addChunk(generator.generate(cx,cz));
 }
 // Prepare the original spawn terrain before accepting a player.
 // New experimental worlds may be discarded; this avoids spawning into void.
 generateChunk(0,0);
 const spawnY=Math.max(-62,Math.min(318,world.heightAt(0,0)+2));
 const demand=createChunkDemand({isLoaded:(x,z)=>!!world.getChunk(x,z),generate:generateChunk});
 demand.requestAround(0,0,3);
 const transport=createWebSocketTransport(wss,{authenticate,opuscraftGuestFrames:true});
 const hooks={
  spawnPoint:()=>[0,spawnY,0],hostName:()=>hostName,worldName:()=>worldName,
  chat:()=>{},setTicket:()=>{},hostBreaking:()=>null,
  loadGuest:uuid=>{
   try{return readPlayer(playerDir,uuid)}
   catch(err){if(err.code==='ENOENT')return null;throw err}
  },
  saveGuest:(uuid,data)=>writePlayer(playerDir,uuid,data)
 };
 const host=new HostServer(level,transport,hooks,{lanId:'family-dedicated',joinCode,announce:false,guestGameMode:gameMode});
 function save(){
  // Preserve native column arrays. This alone does NOT yet capture entities,
  // tile entities or scheduled ticks. Do not advertise full survival durability.
  host.saveAll();
  writeCheckpoint(checkpoint,{seed,gameTime:level.gameTime,dayTime:level.dayTime,
   chunks:[...world.chunks.values()]});
 }
 let tickIndex=0;
 const ticker=new HeadlessTicker({tick:()=>{
  host.receive();
  // Queue sufficient spawn-area terrain for client render readiness; generate at most one
  // column every 10 ticks, keeping the exploration backlog bounded.
  if(++tickIndex%10===0){
   for(const session of host.sessions.values()){
    if(session.state==='play'&&session.player)
     demand.requestAround(session.player.x,session.player.z,3);
   }
   demand.pump();
  }
  level.tick();host.tick();
 },save,onError:err=>{process.stderr.write('[OpusCraft] '+String(err)+'\n')}});
 let stopped=false;
 return {
  world,level,host,transport,ticker,restored,generateChunk,demand,
  start:()=>ticker.start(),
  stop:()=>{if(stopped)return false;stopped=true;ticker.stop();host.close();transport.close();return true},
  save,
  status:()=>({...ticker.status(),guests:host.guestCount(),chunks:world.chunks.size,pendingChunks:demand.stats().pending,checkpoint:restored?.source??'new'})
 };
}
module.exports={createDedicatedRuntime};
