// Only the dedicated VPS-owned host tab installs this resident.
// No movement, decision engine, survival system, network calls or AI.
import type { Game } from './game/game';
import { installGfcWorldAttractions } from './gfc-world-attractions';

export function installGfcNpc(game:Game):void{
 const resident=game.player;
 let attractions:ReturnType<typeof installGfcWorldAttractions>|null=null;
 let hidden=false;
 const guests=()=>game.server?[...game.server.sessions.values()]
   .filter(s=>s.state==='play'&&s.player&&!s.player.removed):[];
 function drive():void{
  if(game.mode!=='host'||!game.inWorld||!game.spawned)return;
  if(!hidden){
   // The spectator is invisible to other players and cannot die.
   // Do not change the family world's meta.gameMode (creative for children).
   resident.setGameMode('spectator');
   resident.dx=resident.dy=resident.dz=0;
   resident.flying=true;
   hidden=true;
  }
  // Keep the hosting player at its existing coordinates, with no input.
  const inp=resident.input;
  inp.forward=inp.back=inp.left=inp.right=inp.jump=inp.sprint=inp.sneak=false;
  resident.dx=resident.dy=resident.dz=0;
  if(!attractions)attractions=installGfcWorldAttractions(game);
  attractions.tick();
 }
 function status(){
  return {ok:true,ready:game.spawned&&game.mode==='host',name:'Andarilha',
   role:'invisible_host',action:'idle',brain:'disabled',configured:false,
   hidden,visitors:guests().length,
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
   },
   worldAttractions:attractions?.status()||null};
 }
 function visit(name:string,attraction?:string){
  // Existing authenticated admin-only API remains usable to visit the sign.
  if(!/^ADM_[a-zA-Z0-9_]{6,16}$/.test(name)||!game.server||!game.spawned)
   return {ok:false,error:'Administrador indisponível'};
  const s=guests().find(p=>p.name===name);
  if(!s?.player||s.player.level!==resident.level)
   return {ok:false,error:'Entre primeiro no mundo da família'};
  const p=attractions?.destination(attraction);
  if(!p){
   if(attraction)return {ok:false,error:'Essa construção ainda não está disponível'};
   // Keep the previous admin visit functional before the first attraction.
   s.teleportTo(resident.x+2,resident.y+1,resident.z+2,s.player.yaw,s.player.pitch);
   return {ok:true,action:'waiting_for_landmark'};
  }
  // Creative flight prevents falling through tree canopy or off raised
  // landmarks while the surrounding chunks stream into the browser.
  s.player.flying=true;
  s.teleportTo(p.x,p.y+7,p.z-12,0,0);
  return {ok:true,action:'visit_landmark',attraction:p.kind};
 }
 function recover(name:string,kind:'names'|'windmill'|'pinwheels'|'castle'|'village'|'garden'|'watchtower'){
  if(!/^ADM_[a-zA-Z0-9_]{6,16}$/.test(name)||!game.spawned||!game.server)
   return {ok:false,error:'Administrador indisponível'};
  const session=guests().find(s=>s.name===name);
  if(!session?.player||session.player.level!==resident.level)
   return {ok:false,error:'Entre primeiro no mundo da família'};
  if(!attractions)return {ok:false,error:'As atrações ainda estão carregando'};
  return attractions.recoverNear(kind,session.player.x,session.player.y,session.player.z);
 }
 (window as any).__gfcNpc={drive,status,visit,recover};
}
