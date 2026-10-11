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
   worldAttractions:attractions?.status()||null};
 }
 function visit(name:string){
  // Existing authenticated admin-only API remains usable to visit the sign.
  if(!/^ADM_[a-zA-Z0-9_]{6,16}$/.test(name)||!game.server||!game.spawned)
   return {ok:false,error:'Administrador indisponível'};
  const s=guests().find(p=>p.name===name);
  if(!s?.player||s.player.level!==resident.level)
   return {ok:false,error:'Entre primeiro no mundo da família'};
  const p=attractions?.destination();
  if(!p)return {ok:false,error:'Atrações ainda em construção'};
  s.teleportTo(p.x,p.y+1.2,p.z-2,s.player.yaw,s.player.pitch);
  return {ok:true,action:'visit_landmark'};
 }
 (window as any).__gfcNpc={drive,status,visit};
}
