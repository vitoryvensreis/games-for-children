// Runs ONLY in the VPS-owned OpusCraft host tab, not on children's clients.
// The existing host avatar becomes a rare autonomous resident, not an extra
// Chromium game instance. The actual world remains the same saved IndexedDB.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';

type Intent = 'build' | 'explore' | 'hide' | 'observe' | 'seek_water' | 'seek_food' | 'rest' | 'warm_up' | 'cool_down' | 'surface';
type Plot = { x:number; y:number; z:number };
const intents: readonly Intent[] = ['build','explore','hide','observe','seek_water','seek_food','rest','warm_up','cool_down','surface'];
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
  let nextBlock = 0, lastBuildReason = 'not_started';
  let lastPlotSearch = 0, nextPlotCandidate = 0, roamMoves = 0, lastMoveOk = false;
  // The host avatar uses the game's own player input/physics, never coordinate teleporting.
  let waypoint: {x:number;z:number}|null = null;
  let driveTicks=0, walkingTicks=0, walkedBlocks=0, stuckSamples=0;
  let lastX=resident.x, lastZ=resident.z;
  let canAdvance=true;
  // NPC-only survival simulation. Guests keep their original creative rules.
  type Vitals={hunger:number;thirst:number;energy:number;temperature:number;oxygen:number;health:number};
  let vitals:Vitals={hunger:100,thirst:100,energy:100,temperature:23,oxygen:100,health:20};
  let livedSeconds=0,deaths=0,underwaterSeconds=0;
  let currentGoal='survive',goalReason='Ainda não conheço este mundo.';
  const experiences:{kind:string;detail:string;at:number}[]=[];
  const discoveries:{x:number;z:number;kind:string}[]=[];
  let safe={x:resident.x,y:resident.y,z:resident.z};
  const clip=(n:number,lo=0,hi=100)=>Math.max(lo,Math.min(hi,n));
  function remember(kind:string,detail:string){
    if(experiences.at(-1)?.kind===kind && experiences.at(-1)?.detail===detail)return;
    experiences.push({kind:kind.slice(0,32),detail:detail.slice(0,160),at:livedSeconds});
    if(experiences.length>25)experiences.shift();
  }
  function survivalTick(){
    // Only one cheap update per second. The upstream Player.isUnderWater()
    // checks its *eyes*, so surface swimming doesn't consume breath.
    if(driveTicks%20!==0)return;
    livedSeconds++;
    const submerged=resident.isUnderWater();
    if(submerged){
      underwaterSeconds++;
      vitals.oxygen=clip(vitals.oxygen-7);
      if(underwaterSeconds===1)remember('water','Entrei em água profunda; preciso manter a cabeça fora da água.');
      if(vitals.oxygen===0) vitals.health=clip(vitals.health-1,0,20);
    } else{
      if(underwaterSeconds>0)remember('air','Recuperei o ar ao chegar à superfície.');
      underwaterSeconds=0;
      vitals.oxygen=clip(vitals.oxygen+24);
      if(!resident.inWater && resident.onGround && livedSeconds%10===0)
        safe={x:resident.x,y:resident.y,z:resident.z};
    }
    vitals.hunger=clip(vitals.hunger-0.025);
    vitals.thirst=clip(vitals.thirst-(resident.inWater?0.065:0.05));
    vitals.energy=clip(vitals.energy-(lastAction==='rest'?-0.45:0.035));
    const x=Math.floor(resident.x),y=Math.floor(resident.y),z=Math.floor(resident.z);
    const wet=resident.inWater||game.level.isRainingAt(x,y,z);
    const night=game.level.dayTime%24000>=12500;
    const target=wet?15:night?19:y>110?17:26;
    vitals.temperature=clip(vitals.temperature+(target-vitals.temperature)*0.08,-30,55);
    if(vitals.hunger<1||vitals.thirst<1||vitals.temperature<8||vitals.temperature>41)
      vitals.health=clip(vitals.health-0.13,0,20);
    else if(!submerged&&vitals.hunger>35&&vitals.thirst>35&&vitals.energy>35)
      vitals.health=clip(vitals.health+0.02,0,20);
    if(vitals.oxygen<35) {
      // Immediate reflex takes precedence over the language model's long-term plan.
      waypoint=null;resident.input.jump=true;currentGoal='breathe';
    }
    if(vitals.health<=0){
      deaths++;
      remember('death',submerged?'Morri afogada. Preciso evitar permanecer submersa.':'Não consegui atender às minhas necessidades de sobrevivência.');
      // Never kill the actual host Player: it is keeping the family's world online.
      // Recover the NPC at its last safe ground without altering any blocks or inventory.
      resident.moveTo(safe.x,safe.y,safe.z);
      vitals={hunger:45,thirst:45,energy:55,temperature:23,oxygen:100,health:20};
      underwaterSeconds=0;waypoint=null;currentGoal='survive';
    }
  }
  function lifeSnapshot(){
    return {version:1,vitals,livedSeconds,deaths,currentGoal,goalReason,
      experiences:experiences.slice(-25),discoveries:discoveries.slice(-12),
      safe,position:{x:resident.x,y:resident.y,z:resident.z}};
  }
  function restoreLife(data:any){
    if(!data||data.version!==1||livedSeconds!==0)return false;
    const n=data.vitals;
    if(!n||typeof n!=='object')return false;
    const valid=(x:unknown)=>typeof x==='number'&&Number.isFinite(x);
    if(![n.hunger,n.thirst,n.energy,n.temperature,n.oxygen,n.health].every(valid))return false;
    vitals={hunger:clip(n.hunger),thirst:clip(n.thirst),energy:clip(n.energy),
      temperature:clip(n.temperature,-30,55),oxygen:clip(n.oxygen),health:clip(n.health,1,20)};
    livedSeconds=clip(Number(data.livedSeconds)||0,0,1e9);
    deaths=clip(Number(data.deaths)||0,0,1e6);
    currentGoal=typeof data.currentGoal==='string'?data.currentGoal.slice(0,90):'survive';
    goalReason=typeof data.goalReason==='string'?data.goalReason.slice(0,160):'';
    for(const e of (Array.isArray(data.experiences)?data.experiences:[]).slice(-25))
      if(typeof e?.kind==='string'&&typeof e?.detail==='string')
        experiences.push({kind:e.kind.slice(0,32),detail:e.detail.slice(0,160),at:clip(Number(e.at)||0,0,1e9)});
    for(const d of (Array.isArray(data.discoveries)?data.discoveries:[]).slice(-12))
      if(valid(d?.x)&&valid(d?.z)&&typeof d.kind==='string')
        discoveries.push({x:Math.round(d.x),z:Math.round(d.z),kind:d.kind.slice(0,30)});
    if(data.safe&&[data.safe.x,data.safe.y,data.safe.z].every(valid))
      safe={x:data.safe.x,y:data.safe.y,z:data.safe.z};
    return true;
  }
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
    const anchor=plot??start; // Wander near the build, even if it is far from world spawn.
    const kids=guests().filter(p=>p.name.startsWith('KID_'));
    for(let offset=0;offset<directions.length;offset++){
      const [dx,dz]=directions[(driveTicks+stepCount+offset)%directions.length];
      const x=Math.floor(resident.x)+dx*stride,z=Math.floor(resident.z)+dz*stride;
      if(distance(x,z,anchor.x,anchor.z)>16)continue;
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
    survivalTick();
    if(vitals.oxygen<35&&resident.isUnderWater()){
      waypoint=null;inp.jump=true;return;
    }
    // A long-running 'build' plan should not freeze the character at one spot.
    // Even an 'observe' plan allows an occasional short, believable walk.
    if(!waypoint&&lastAction!=='build'&&lastAction!=='rest'&&driveTicks%120===0)roam();
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
      if(lastAction!=='build'&&driveTicks%20===0)roam();
      return;
    }
    if(Math.abs(delta)<30)inp.forward=true;
    if(inp.forward&&driveTicks%20===0){
      if(motion<0.012)stuckSamples++;
      if(stuckSamples>=3){waypoint=null;lastMoveOk=false;stuckSamples=0;if(lastAction!=='build')roam();}
    }
  }
  function build():void{
    if(!plot){lastBuildReason='no_plot';return;}
    if(nextBlock>=blueprint.length || built>=MAX_BUILD){
      lastBuildReason='blueprint_finished';return;
    }
    // Do not build on top of a visitor, but ADM can watch from outside the footprint.
    if(guests().some(p=>distance(p.x,p.z,plot!.x,plot!.z)<4)){
      lastBuildReason='visitor_in_build_area';return;
    }
    const block=blueprint[nextBlock++];
    const x=plot.x+block.x,y=plot.y+block.y,z=plot.z+block.z;
    if(game.level.getState(x,y,z)!==0){
      lastBuildReason='existing_block_preserved';return;
    }
    game.level.setBlock(x,y,z,S(block.block));
    resident.swing(); // Guests see the player working.
    built++;
    lastBuildReason='placed_block';
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
    if(intent==='build' && !plot && (!lastPlotSearch || now-lastPlotSearch>=18000)){
      lastPlotSearch=now;
      plot=choosePlot();
    }
    const action=intents.includes(intent as Intent)?intent as Intent:'observe';
    const nearby=guests().filter(p=>p.name.startsWith('KID_')&&distance(p.x,p.z,resident.x,resident.z)<25);
    stepCount++;lastAction=action;
    if(action==='seek_water' || action==='cool_down'){
      const cx=Math.floor(resident.x),cy=Math.floor(resident.y),cz=Math.floor(resident.z);
      // Only inspect a small local grid once per NPC step, not in a game tick.
      let found=false;
      for(let radius=1;radius<=7&&!found;radius++)
        for(const [ox,oz] of [[radius,0],[-radius,0],[0,radius],[0,-radius],[radius,radius],[-radius,-radius]]){
          const bx=cx+ox,bz=cz+oz;
          if(!game.level.world.isLoaded(bx,bz))continue;
          let water=false;
          for(const yy of [cy-1,cy,cy+1]){
            const name=blockOf(game.level.getState(bx,yy,bz)).name;
            if(name.includes('water')){water=true;break;}
          }
          if(!water)continue;
          // Stand on land near the water, keep the head above it.
          for(const [ax,az] of [[bx+1,bz],[bx-1,bz],[bx,bz+1],[bx,bz-1]]){
            if(nearFeet(ax,az)===null)continue;
            if(distance(resident.x,resident.z,ax,az)<2.3){
              vitals.thirst=clip(vitals.thirst+48);
              remember('drink','Encontrei água acessível e consegui matar a sede.');
              discoveries.push({x:bx,z:bz,kind:'water'});
              if(discoveries.length>12)discoveries.shift();
              found=true;break;
            }
            if(move(ax,az)){found=true;break;}
          }
          if(found)break;
        }
      if(!found)remember('search','Procurei água por perto, mas ainda não encontrei acesso seguro.');
    }
    if(action==='rest' && vitals.energy<97) waypoint=null;
    if(action==='seek_food') remember('food','Procurei alimento; preciso localizar uma fonte comestível acessível.');
    if(action==='surface'){waypoint=null;resident.input.jump=true;}
    if(action==='warm_up'||action==='cool_down')remember('temperature','Procuro um lugar de temperatura mais confortável.');
    if(action==='explore' && stepCount%5===0){
      const px=Math.floor(resident.x),pz=Math.floor(resident.z);
      if(!discoveries.some(d=>distance(d.x,d.z,px,pz)<8)){
        discoveries.push({x:px,z:pz,kind:'visited'});
        if(discoveries.length>12)discoveries.shift();
      }
    }
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
    } else if(!plot && ['explore','hide','seek_food','seek_shelter'].includes(action)){
      // Still roam while the site finder waits for chunks/flat terrain.
      roam();
    } else if(plot && action==='build'){
      // No aimless wandering during building; finish the current task first.
      const paused=nextBlock>=blueprint.length ||
        guests().some(p=>distance(p.x,p.z,plot!.x,plot!.z)<4);
      if(paused)waypoint=null;
      else {
        const a=stepCount*Math.PI/4;
        if(!move(plot.x+Math.round(Math.cos(a)*5),plot.z+Math.round(Math.sin(a)*5)))
          waypoint=null;
      }
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
      buildCursor:nextBlock,buildReason:lastBuildReason,buildPlot:plot,
      needs:{...vitals},livedSeconds,deaths,currentGoal,goalReason,underwater:resident.isUnderWater(),
      memoryCount:experiences.length,memories:experiences.slice(-5),discoveries:discoveries.slice(-5),
      position:{x:Math.round(resident.x),y:Math.round(resident.y),z:Math.round(resident.z)}};
  }
  function setGoal(goal:string,reason:string){
    if(typeof goal!=='string')return;
    const next=goal.slice(0,90);
    if(next!==currentGoal)remember('goal','Novo objetivo escolhido: '+next);
    currentGoal=next;
    goalReason=typeof reason==='string'?reason.slice(0,160):'';
  }
  (window as any).__gfcNpc={step,drive,status,visit,lifeSnapshot,restoreLife,setGoal};
}
