// Runs ONLY in the VPS-owned OpusCraft host tab, not on children's clients.
// The existing host avatar becomes a rare autonomous resident, not an extra
// Chromium game instance. The actual world remains the same saved IndexedDB.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';

type Intent = 'build' | 'explore' | 'hide' | 'observe';
type Plot = { x:number; y:number; z:number };
const intents: readonly Intent[] = ['build','explore','hide','observe'];
const MAX_BUILD = 130;
const ENCOUNTER_COOLDOWN = 25 * 60 * 1000;
const greetings = [
  'Que bom encontrar voce por aqui! Estou construindo meu cantinho.',
  'Ola! Explorar com cuidado rende boas descobertas.',
  'Se precisar de uma ideia, experimente construir uma pequena ponte.'
];

export function installGfcNpc(game: Game): void {
  const resident = game.player;
  const start = {x:Math.floor(resident.x), z:Math.floor(resident.z)};
  let plot: Plot | null = null;
  let stepCount = 0, built = 0, lastMeet = Date.now(), visibleUntil = 0, lastVisit = 0;
  let lastAction: Intent = 'observe';
  let nextBlock = 0;
  let lastPlotSearch = 0, nextPlotCandidate = 0, roamMoves = 0, lastMoveOk = false;
  // The host avatar uses the game's own player input/physics, never coordinate teleporting.
  let waypoint: {x:number;z:number}|null = null;
  let driveTicks=0, walkingTicks=0, walkedBlocks=0, stuckSamples=0;
  let lastX=resident.x, lastZ=resident.z;
  let canAdvance=true;
  const blueprint: {x:number;y:number;z:number;block:string}[] = [];
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)
    blueprint.push({x,y:0,z,block:'oak_planks'});
  for(let y=1;y<=3;y++)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
    if(Math.abs(x)!==2 && Math.abs(z)!==2)continue;
    // Doorway stays open; windows appear on the sides.
    if(z===-2 && x===0 && y<=2)continue;
    const windowBlock = y===2 && (x===0 || z===0);
    blueprint.push({x,y,z,block:windowBlock?'glass':'oak_planks'});
  }
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)
    blueprint.push({x,y:4,z,block:'oak_planks'});

  function guests(){
    const srv=game.server;
    return srv ? [...srv.sessions.values()]
      .filter(s=>s.state==='play' && s.player && !s.player.removed)
      .map(s=>({name:s.name,x:s.player!.x,y:s.player!.y,z:s.player!.z})) : [];
  }
  function distance(ax:number,az:number,bx:number,bz:number){
    return Math.hypot(ax-bx,az-bz);
  }
  function feet(x:number,z:number):number|null{
    const level=game.level, bx=Math.floor(x),bz=Math.floor(z);
    for(let y=290;y>-54;y--){
      const floor=level.getState(bx,y-1,bz);
      if(floor===0 || level.getState(bx,y,bz)!==0 || level.getState(bx,y+1,bz)!==0)continue;
      const name=blockOf(floor).name;
      if(/water|lava|leaves|log|cactus|magma|ice|snow|fire|portal|fence|wall|glass/.test(name))continue;
      return y;
    }
    return null;
  }
  function choosePlot():Plot|null{
    // Scan a few locations per tick, never thousands of world queries at once.
    // This avoids stalling the multiplayer host when terrain is uneven/unloaded.
    const candidates: {x:number;z:number}[] = [];
    for(const radius of [12,16,20,24,32,40]){
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        candidates.push({x:start.x+dx*radius,z:start.z+dz*radius});
      }
    }
    for(let checked=0;checked<4;checked++){
      const {x,z}=candidates[nextPlotCandidate++%candidates.length];
      const y=feet(x,z);
      if(y===null)continue;
      let usable=true;
      for(let ox=-2;ox<=2&&usable;ox++)for(let oz=-2;oz<=2;oz++){
        const fy=feet(x+ox,z+oz);
        if(fy===null||Math.abs(fy-y)>1||game.level.getState(x+ox,y+1,z+oz)!==0){
          usable=false;break;
        }
      }
      if(usable)return {x,y,z};
    }
    return null;
  }
  function nearFeet(x:number,z:number):number|null{
    // Small vertical search around the current feet, not a 340-block column every tick.
    const bx=Math.floor(x),bz=Math.floor(z),base=Math.floor(resident.y);
    for(const dy of [0,1,-1,2,-2]){
      const y=base+dy, ground=game.level.getState(bx,y-1,bz);
      if(ground===0||game.level.getState(bx,y,bz)!==0||game.level.getState(bx,y+1,bz)!==0)continue;
      if(/water|lava|leaves|log|cactus|magma|ice|snow|fire|portal|fence|wall|glass/.test(blockOf(ground).name))continue;
      return y;
    }
    return null;
  }
  function move(x:number,z:number):boolean{
    const gx=Math.floor(x)+0.5,gz=Math.floor(z)+0.5;
    if(nearFeet(gx,gz)===null){lastMoveOk=false;return false;}
    waypoint={x:gx,z:gz};
    lastMoveOk=true;
    return true;
  }
  function roam():boolean{
    // Short, safe waypoints inside the original clearing. Physics handles the trip.
    const directions=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
    const stride=2+stepCount%3;
    const kids=guests().filter(p=>p.name.startsWith('KID_'));
    for(let offset=0;offset<directions.length;offset++){
      const [dx,dz]=directions[(driveTicks+stepCount+offset)%directions.length];
      const x=Math.floor(resident.x)+dx*stride,z=Math.floor(resident.z)+dz*stride;
      if(distance(x,z,start.x,start.z)>16)continue;
      if(kids.some(p=>distance(p.x,p.z,x,z)<18))continue;
      if(move(x,z)){roamMoves++;return true;}
    }
    lastMoveOk=false;
    return false;
  }
  function drive():void{
    // Called from the native host game tick just before level.tick().
    // Turning, collision, jumping, walk animation and network replication are native.
    const inp=resident.input;
    inp.forward=inp.back=inp.left=inp.right=inp.jump=inp.sprint=inp.sneak=false;
    if(!game.inWorld||game.mode!=='host'||!game.spawned)return;
    driveTicks++;
    const motion=Math.hypot(resident.x-lastX,resident.z-lastZ);
    if(motion>0.012){
      walkedBlocks+=Math.min(motion,0.4);
      walkingTicks++;
      stuckSamples=0;
    }
    lastX=resident.x;lastZ=resident.z;
    // A long-running 'build' plan should not freeze the character at one spot.
    if(!waypoint&&lastAction!=='observe'&&driveTicks%80===0)roam();
    if(!waypoint)return;
    const dx=waypoint.x-resident.x,dz=waypoint.z-resident.z;
    if(Math.hypot(dx,dz)<0.65){waypoint=null;return;}
    const intendedYaw=Math.atan2(-dx,dz)*180/Math.PI;
    const delta=((intendedYaw-resident.yaw+540)%360)-180;
    resident.yaw+=Math.max(-11,Math.min(11,delta));
    resident.headYaw=resident.yaw;
    // Check the next footstep at 4 Hz; avoid any unloaded or obstructed blocks.
    if(driveTicks%5===0){
      const n=Math.hypot(dx,dz),x=resident.x+dx/n*0.7,z=resident.z+dz/n*0.7;
      const y=nearFeet(x,z);
      canAdvance=y!==null && Math.abs(y-resident.y)<=1.2;
      inp.jump=canAdvance && y!==null && y>resident.y+0.5 && resident.onGround;
    }else{
      inp.jump=false;
    }
    if(!canAdvance){
      waypoint=null;lastMoveOk=false;
      if(driveTicks%20===0)roam();
      return;
    }
    if(Math.abs(delta)<30)inp.forward=true;
    if(inp.forward&&driveTicks%20===0){
      if(motion<0.012)stuckSamples++;
      if(stuckSamples>=3){waypoint=null;lastMoveOk=false;stuckSamples=0;roam();}
    }
  }
  function build():void{
    if(!plot || nextBlock>=blueprint.length || built>=MAX_BUILD)return;
    // Building is limited to a tiny predefined footprint, never model-generated coordinates.
    // A child/admin standing there pauses construction to avoid interference.
    // Keep only the actual build footprint clear; ADM watching nearby is allowed.
    if(guests().some(p=>distance(p.x,p.z,plot!.x,plot!.z)<4))return;
    const block=blueprint[nextBlock++];
    const x=plot.x+block.x,y=plot.y+block.y,z=plot.z+block.z;
    const old=game.level.getState(x,y,z);
    if(old!==0)return; // Existing construction has absolute priority.
    game.level.setBlock(x,y,z,S(block.block));
    resident.swing(); // Other players see the work animation.
    built++;
  }
  function hide(){
    if(!plot){roam();return;}
    // Being rare is a deliberate behavior: return to the quiet area.
    for(const [x,z] of [[plot.x+11,plot.z+9],[plot.x-11,plot.z-9],[plot.x,plot.z]]){
      if(!guests().some(p=>distance(p.x,p.z,x,z)<20) && move(x,z))return;
    }
    // If every hiding location is obstructed, still try to keep moving safely.
    roam();
  }
  function step(intent: string){
    if(!game.inWorld||game.mode!=='host'||!game.spawned)
      return {ok:false,error:'Servidor ainda carregando'};
    const now=Date.now();
    if(!plot && (!lastPlotSearch || now-lastPlotSearch>=18000)){
      lastPlotSearch=now;
      plot=choosePlot();
    }
    const action=intents.includes(intent as Intent)?intent as Intent:'observe';
    const nearby=guests().filter(p=>p.name.startsWith('KID_')&&distance(p.x,p.z,resident.x,resident.z)<25);
    stepCount++;lastAction=action;
    if(nearby.length && now>visibleUntil && now-lastMeet>ENCOUNTER_COOLDOWN){
      // A rare, short greeting. Children never receive arbitrary AI-generated text.
      if(Math.random()<0.12){
        lastMeet=now;visibleUntil=now+90000;
        game.server?.broadcastChat('§d<Andarilha> '+greetings[Math.floor(Math.random()*greetings.length)]);
      }
    }
    if(nearby.length && now>visibleUntil && now-lastVisit>120000){
      hide();
    } else if(action==='hide' && now-lastVisit>120000){
      hide();
    } else if(!plot && action!=='observe'){
      // Still roam while the site finder waits for chunks/flat terrain.
      roam();
    } else if(plot && action==='build'){
      // Work from different sides instead of standing forever on a single block.
      const a=stepCount*Math.PI/4;
      if(!move(plot.x+Math.round(Math.cos(a)*5),plot.z+Math.round(Math.sin(a)*5)))roam();
      build();
    } else if(plot && action==='explore'){
      const a=stepCount/4, x=plot.x+Math.round(Math.cos(a)*7),z=plot.z+Math.round(Math.sin(a)*7);
      if(!move(x,z))roam();
    }
    return status();
  }
  function visit(name:string){
    // Caller authority is independently checked by GamesNavagador's admin API.
    if(!/^ADM_[a-zA-Z0-9_]{6,16}$/.test(name)||!game.server||!game.spawned)
      return {ok:false,error:'Administrador indisponivel'};
    const s=[...game.server.sessions.values()].find(s=>s.state==='play'&&s.name===name&&s.player);
    if(!s?.player || s.player.level!==resident.level)return {ok:false,error:'Entre primeiro no mundo da familia'};
    // The server sends its native teleport packet; moving a client-side camera
    // would not actually move the character in the authoritative world.
    s.teleportTo(resident.x+1.5,resident.y,resident.z+1.5,s.player.yaw,s.player.pitch);
    lastVisit=Date.now();
    return {ok:true,action:lastAction};
  }
  function status(){
    return {ok:true,ready:game.spawned && game.mode==='host',hasPlot:!!plot,name:'Andarilha',action:lastAction,
      built,planned:blueprint.length,steps:stepCount,visitors:guests().length,
      roamMoves,lastMoveOk,plotSearchChecked:nextPlotCandidate,
      walkingTicks,walkedBlocks:Math.round(walkedBlocks*10)/10,walkingTo:waypoint,
      position:{x:Math.round(resident.x),y:Math.round(resident.y),z:Math.round(resident.z)}};
  }
  (window as any).__gfcNpc={step,drive,status,visit};
}
