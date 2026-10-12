// Dedicated, invisible family host. No landmarks, builders, rotors,
// autonomous construction tasks or terrain mutations are installed.
import type { Game } from './game/game';
export function installGfcNpc(game:Game):void{
 const resident=game.player;
 let hidden=false;
 const guests=()=>game.server?[...game.server.sessions.values()]
  .filter(s=>s.state==='play'&&s.player&&!s.player.removed):[];
 function drive():void{
  if(game.mode!=='host'||!game.inWorld||!game.spawned)return;
  if(!hidden){
   resident.setGameMode('spectator');
   resident.dx=resident.dy=resident.dz=0;
   resident.flying=true;hidden=true;
  }
  const input=resident.input;
  input.forward=input.back=input.left=input.right=input.jump=input.sprint=input.sneak=false;
  resident.dx=resident.dy=resident.dz=0;
 }
 function status(){
  return {ok:true,ready:game.spawned&&game.mode==='host',name:'Andarilha',
   role:'invisible_host',action:'idle',brain:'disabled',configured:false,
   hidden,visitors:guests().length,
   worldId:String(game.meta?.id||''),
   worldAttractions:null,
   performance:{
    fps:Math.round(game.fps||0),
    frameMs:Math.round((game.frameTimeMs||0)*10)/10,
    loadedChunks:game.level.world.chunks.size,
    queuedChunks:game.chunks.pendingGen(),
    generatedChunks:game.chunks.stats.gens,
    generatedMs:Math.round(game.chunks.stats.genMs),
    meshedSections:game.chunks.stats.meshes,
    simulationOnly:game.chunks.dedicatedHeadlessHost===true,
    workerMaxConcurrent:game.pool?.maxInflight||0
   }};
 }
 (window as any).__gfcNpc={drive,status};
}
