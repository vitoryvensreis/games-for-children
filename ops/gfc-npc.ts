// Runs only in the VPS-owned authoritative OpusCraft Chromium world.
// One construction at a time. World/IndexedDB owned by the existing game.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';
type Kind='village'|'castle'|'windmill'|'bridge'|'cave'|'town'|'portal'|'tower'|'garden';
type Style='medieval'|'rustic'|'fantasy'|'stone'|'woodland';
type Project={kind:Kind;style:Style;title:string;reason:string;x:number;y:number;z:number;
 cursor:number;placed:number;skipped:number;startedAt:number;state:'building'|'blocked';blockedReason:string};
type Block={x:number;y:number;z:number;name:string};
type Archived={kind:Kind;title:string;x:number;y:number;z:number;placed:number};
type Draft={kind:Kind;style:Style;title:string;reason:string};
const kinds=['village','castle','windmill','bridge','cave','town','portal','tower','garden'] as const;
const styles=['medieval','rustic','fantasy','stone','woodland'] as const;
const NATURAL=/^(?:air|cave_air|void_air|grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|stone|deepslate|cobbled_deepslate|granite|diorite|andesite|tuff|calcite|bedrock|sand|red_sand|gravel|clay|mud|snow|snow_block|ice|packed_ice|blue_ice|water|lava|short_grass|tall_grass|grass|fern|large_fern|dead_bush|vine|moss_block|moss_carpet|brown_mushroom|red_mushroom|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|sugar_cane|bamboo|kelp|seagrass|tall_seagrass|cactus|(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_(?:log|wood|leaves)|(?:coal|iron|copper|gold|diamond|emerald|lapis|redstone)_ore|deepslate_(?:coal|iron|copper|gold|diamond|emerald|lapis|redstone)_ore)$/;
const REPLACEABLE=/^(?:short_grass|tall_grass|grass|fern|large_fern|dead_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|vine|snow|moss_carpet)$/;
const DIGGABLE=/^(?:stone|deepslate|granite|diorite|andesite|tuff|dirt|grass_block|sand|gravel)$/;
const siteSizes:{[k in Kind]:number}={village:15,castle:13,windmill:9,bridge:13,cave:9,town:15,portal:7,tower:7,garden:11};
function bounded(n:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,n));}
function pattern(p:Project):Block[]{
 const blocks=new Map<string,Block>();
 const put=(x:number,y:number,z:number,name:string)=>{
  if(Math.abs(x)>18||Math.abs(z)>18||y< -8||y>30)return;
  blocks.set(x+':'+y+':'+z,{x,y,z,name});
 };
 const rect=(x1:number,z1:number,x2:number,z2:number,y:number,name:string)=>{
  for(let x=x1;x<=x2;x++)for(let z=z1;z<=z2;z++)put(x,y,z,name);
 };
 const hut=(cx:number,cz:number,w:number,h:number)=>{
  const a=Math.floor(w/2);
  rect(cx-a,cz-a,cx+a,cz+a,0,'oak_planks');
  for(let y=1;y<=h;y++)for(let x=cx-a;x<=cx+a;x++)for(let z=cz-a;z<=cz+a;z++){
   if(x!==cx-a&&x!==cx+a&&z!==cz-a&&z!==cz+a)continue;
   if(z===cz-a&&x===cx&&y<=2)continue;
   put(x,y,z,y===2&&(x===cx||z===cz)?'glass':'oak_planks');
  }
  rect(cx-a-1,cz-a-1,cx+a+1,cz+a+1,h+1,'oak_planks');
 };
 switch(p.kind){
 case 'village':
  hut(-5,-5,5,3);hut(5,-5,5,3);hut(-5,5,5,3);hut(5,5,5,3);
  for(let x=-7;x<=7;x++)for(let z=-1;z<=1;z++)put(x,0,z,'cobblestone');
  for(let z=-7;z<=7;z++)put(0,0,z,'cobblestone');break;
 case 'town':
  hut(-5,-4,5,5);hut(5,-4,5,5);hut(-5,5,5,4);hut(5,5,5,4);
  rect(-7,-1,7,1,0,'stone_bricks');break;
 case 'castle':
  rect(-6,-6,6,6,0,'stone_bricks');
  for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++){
   if(Math.abs(x)!==6&&Math.abs(z)!==6)continue;
   for(let y=1;y<=6;y++)if(!(z===-6&&x===0&&y<=3))put(x,y,z,'stone_bricks');
  }
  for(const x of [-6,6])for(const z of [-6,6]){
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
    for(let y=1;y<=10;y++)if(Math.abs(dx)===1||Math.abs(dz)===1)put(x+dx,y,z+dz,'cobblestone');
  }
  for(let x=-7;x<=7;x++)for(let z=-7;z<=7;z++)if(Math.abs(x)===7||Math.abs(z)===7)
   if((x+z)%2===0)put(x,8,z,'stone_bricks');break;
 case 'windmill':
  rect(-3,-3,3,3,0,'stone_bricks');
  for(let y=1;y<=11;y++)for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
   if(Math.abs(x)!==3&&Math.abs(z)!==3)continue;
   if(z===-3&&x===0&&y<=2)continue;
   put(x,y,z,y===5&&(x===0||z===0)?'glass':'oak_planks');
  }
  rect(-4,-4,4,4,12,'oak_planks');
  put(0,9,-4,'oak_log');
  // Stationary facade until the windmill animation engine is activated separately.
  for(let t=1;t<=3;t++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
   put(dx*t,9+dy*t,-5,'white_wool');
  for(let t=1;t<=3;t++)for(const [dx,dy] of [[0,1],[0,-1]])
   put(dx*t,9+dy*t,-5,'white_wool');break;
 case 'bridge':
  for(let x=-6;x<=6;x++)for(let z=-2;z<=2;z++)put(x,0,z,'oak_planks');
  for(let x=-6;x<=6;x++)for(let z of [-2,2])put(x,1,z,'oak_fence');
  for(let x of [-6,6])for(let z of [-2,2])for(let y=-2;y<0;y++)put(x,y,z,'stone_bricks');
  break;
 case 'cave':
  // A shallow underground gallery: only genuine natural rock may be excavated.
  for(let z=-3;z<=3;z++)for(let x=-2;x<=2;x++)for(let y=-4;y<=0;y++)
   if(Math.abs(x)<=1&&y>=-3&&y<=-1)put(x,y,z,'air');
   else if(Math.abs(x)===2||y===-4||y===0)put(x,y,z,'stone_bricks');
  for(let x=-2;x<=2;x++)put(x,1,-3,'stone_bricks');
  break;
 case 'portal':
  rect(-3,-3,3,3,0,'stone_bricks');
  for(let y=1;y<=6;y++)for(const x of [-2,2])put(x,y,0,'obsidian');
  for(let x=-2;x<=2;x++)put(x,6,0,'obsidian');
  // Two completed portals can be paired by a future approved transport controller.
  break;
 case 'tower':
  rect(-3,-3,3,3,0,'stone_bricks');
  for(let y=1;y<=16;y++)for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)
   if(Math.abs(x)===3||Math.abs(z)===3)put(x,y,z,(y%4===0?'cobblestone':'stone_bricks'));
  rect(-4,-4,4,4,17,'stone_bricks');break;
 case 'garden':
  for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++){
   if(Math.abs(x)===5||Math.abs(z)===5)put(x,0,z,'cobblestone');
   else if(x===0||z===0)put(x,0,z,'oak_planks');
   else if((x+z)%3===0)put(x,0,z,'moss_block');
  }
  put(0,1,0,'oak_fence');put(0,2,0,'lantern');break;
 }
 return [...blocks.values()].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x);
}
export function installGfcNpc(game:Game):void{
 const resident=game.player,start={x:Math.floor(resident.x),z:Math.floor(resident.z)};
 let project:Project|null=null,queue:Draft|null=null;
 let completed:Archived[]=[],steps=0,searchCursor=0,placedTotal=0,lastReason='initializing';
 let lastVisit=0,lastMeet=Date.now(),visibleUntil=0,lastAction='observe',lastX=resident.x,lastZ=resident.z;
 let walkingTicks=0,walkedBlocks=0,driveTicks=0,lastMoveOk=false,roamMoves=0;
 let waypoint:{x:number;z:number}|null=null,lifeRestored=false,blockedSites:{x:number;z:number}[]=[];
 let animationTime=0;
 const visitors=()=>game.server?[...game.server.sessions.values()].filter(s=>s.state==='play'&&s.player&&!s.player.removed):[];
 const distance=(x:number,z:number,a:number,b:number)=>Math.hypot(x-a,z-b);
 const guestNear=(x:number,z:number,d:number)=>visitors().some(s=>distance(s.player!.x,s.player!.z,x,z)<d);
 const blockName=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const reserve=(x:number,z:number,r:number)=>{
  if(distance(x,z,start.x,start.z)<44)return false;
  if(guestNear(x,z,30))return false;
  if(completed.some(c=>distance(x,z,c.x,c.z)<r+17))return false;
  if(blockedSites.some(c=>distance(x,z,c.x,c.z)<12))return false;
  return true;
 };
 function surface(x:number,z:number):number|null{
  if(!game.level.world.isLoaded(x,z))return null;
  for(let y=180;y>6;y--){
   const ground=blockName(x,y-1,z);
   const foot=blockName(x,y,z),head=blockName(x,y+1,z);
   // Short grass and flowers must not make an otherwise safe clearing invisible.
   const open=(n:string)=>n==='air'||REPLACEABLE.test(n);
   if(!open(foot)||!open(head))continue;
   if(/^(?:grass_block|dirt|stone|sand|gravel|podzol|coarse_dirt|snow_block)$/.test(ground))return y;
  }
  return null;
 }
 function safeSite(x:number,y:number,z:number,r:number):boolean{
  if(!reserve(x,z,r))return false;
  // Survey all columns of the full project + a buffer, not just a center point.
  // Any evidence of placed materials or an unknown block aborts the location.
  for(let dx=-r-3;dx<=r+3;dx++)for(let dz=-r-3;dz<=r+3;dz++){
   const bx=x+dx,bz=z+dz;
   const fy=surface(bx,bz);
   if(fy===null||Math.abs(fy-y)>3)return false;
   for(let yy=fy-6;yy<=fy+18;yy++){
    const n=blockName(bx,yy,bz);
    // Natural-looking underground basements and tunnels usually contain air
    // cavities; reject them rather than excavate into a possible family build.
    // Solid rock/soil must fill the subterranean clearance volume.
    if(yy<fy){
     if(n==='air'||n==='cave_air'||n==='void_air'||!NATURAL.test(n))return false;
    }else{
     // Clearings only; even natural-looking logs, stone and soil ABOVE
     // surface could belong to a family building.
     if(!/^(?:air|short_grass|tall_grass|grass|fern|large_fern|dead_bush|dandelion|poppy|oxeye_daisy|cornflower|snow)$/.test(n))
      return false;
    }
   }
  }
  return true;
 }
 function chooseSite(kind:Kind):{x:number;y:number;z:number}|null{
  const r=Math.ceil(siteSizes[kind]/2);
  const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for(let tries=0;tries<3;tries++){
   const i=searchCursor++,ring=Math.floor(i/directions.length)%24,[dx,dz]=directions[i%directions.length];
   const radius=56+ring*24;
   const x=start.x+dx*radius,z=start.z+dz*radius;
   const y=surface(x,z);
   if(y!==null&&safeSite(x,y,z,r))return {x,y,z};
  }
  return null;
 }
 function startNext(draft:Draft):boolean{
  if(project)return false;
  queue={kind:draft.kind,style:draft.style,title:draft.title.slice(0,70),
   reason:draft.reason.slice(0,160)};
  const site=chooseSite(queue.kind);
  if(!site){lastReason='searching_untouched_land';return false;}
  project={...queue,...site,cursor:0,placed:0,skipped:0,startedAt:Date.now(),
   state:'building',blockedReason:''};
  queue=null;lastReason='project_started';lastAction='build';
  return true;
 }
 function buildOne(){
  if(!project||project.state!=='building')return;
  const p=project,blueprint=pattern(p);
  if(p.cursor>=blueprint.length){
   completed.push({kind:p.kind,title:p.title,x:p.x,y:p.y,z:p.z,placed:p.placed});
   if(completed.length>200)completed=completed.slice(-200);
   project=null;lastReason='project_completed';lastAction='observe';
   return;
  }
  if(guestNear(p.x,p.z,siteSizes[p.kind]+5)){lastReason='visitors_near_site';return;}
  const task=blueprint[p.cursor];
  const x=p.x+task.x,y=p.y+task.y,z=p.z+task.z;
  if(!game.level.world.isLoaded(x,z)){lastReason='chunk_unloaded';return;}
  const current=game.level.getState(x,y,z),name=blockOf(current).name;
  const desired=S(task.name);
  if(current===desired){
   p.skipped++;p.cursor++;lastReason='existing_design_block';return;
  }
  // No arbitrary excavation. Only a natural, isolated site surveyed before
  // beginning, and only allow-listed natural blocks may ever be removed.
  // For ordinary surface buildings, never replace natural-looking solid
  // blocks: they could be intentionally placed by a player.
  // The isolated underground cave is the only project authorized to cut
  // surveyed, solid, natural underground material.
  const natural=(name==='air'||REPLACEABLE.test(name));
  const caveUnderground=p.kind==='cave'&&y<p.y&&DIGGABLE.test(name);
  const allowed=task.name==='air'?(caveUnderground||name==='air'):(natural||caveUnderground);
  if(!allowed){
   p.state='blocked';p.blockedReason='protected_or_unknown_block:'+name;
   lastReason='protected_structure_detected';return;
  }
  if(task.name==='air'&&name==='air'){p.cursor++;return;}
  // Check for new player constructions nearby each time before removing terrain.
  if(name!=='air'&&!REPLACEABLE.test(name)&&!safeSiteForWork(p)){
   p.state='blocked';p.blockedReason='nearby_construction_detected';
   lastReason='protected_structure_detected';return;
  }
  game.level.setBlock(x,y,z,desired);
  resident.swing();
  p.placed++;placedTotal++;p.cursor++;lastReason=task.name==='air'?'natural_terrain_excavated':'block_placed';
 }
 function safeSiteForWork(p:Project):boolean{
  if(guestNear(p.x,p.z,siteSizes[p.kind]+5))return false;
  // Do not repeat the initial full survey: our own new blocks are expected.
  // Instead inspect a perimeter outside the reserved construction footprint.
  const r=Math.ceil(siteSizes[p.kind]/2)+3;
  for(let dx=-r;dx<=r;dx+=3)for(const dz of [-r,r])
   if(!NATURAL.test(blockName(p.x+dx,p.y+1,p.z+dz)))return false;
  for(let dz=-r;dz<=r;dz+=3)for(const dx of [-r,r])
   if(!NATURAL.test(blockName(p.x+dx,p.y+1,p.z+dz)))return false;
  return true;
 }
 function drive():void{
  const input=resident.input;
  input.forward=input.back=input.left=input.right=input.jump=input.sprint=input.sneak=false;
  if(!game.inWorld||game.mode!=='host'||!game.spawned)return;
  driveTicks++;
  const moved=Math.hypot(resident.x-lastX,resident.z-lastZ);
  if(moved>0.012){walkedBlocks+=Math.min(0.4,moved);walkingTicks++;}
  lastX=resident.x;lastZ=resident.z;
  if(project&&!waypoint&&driveTicks%80===0&&
   distance(resident.x,resident.z,project.x,project.z)>8){
   const dx=project.x-resident.x,dz=project.z-resident.z,n=Math.hypot(dx,dz);
   const x=resident.x+dx/n*3,z=resident.z+dz/n*3;
   if(surface(Math.floor(x),Math.floor(z))!==null){waypoint={x,z};lastMoveOk=true;}
  }
  if(!waypoint)return;
  const dx=waypoint.x-resident.x,dz=waypoint.z-resident.z;
  if(Math.hypot(dx,dz)<0.7){waypoint=null;return;}
  const target=Math.atan2(-dx,dz)*180/Math.PI;
  const delta=((target-resident.yaw+540)%360)-180;
  resident.yaw+=bounded(delta,-11,11);resident.headYaw=resident.yaw;
  if(Math.abs(delta)<30)input.forward=true;
  const nextX=Math.floor(resident.x+dx/Math.hypot(dx,dz)*0.65);
  const nextZ=Math.floor(resident.z+dz/Math.hypot(dx,dz)*0.65);
  const y=surface(nextX,nextZ);
  if(y===null||Math.abs(y-resident.y)>1.2){waypoint=null;lastMoveOk=false;input.forward=false;return;}
  input.jump=y>resident.y+0.5&&resident.onGround;
 }
 function step(intent:string){
  if(!game.inWorld||game.mode!=='host'||!game.spawned)return {ok:false};
  steps++;lastAction=intent==='build'?'build':'observe';
  if(project)buildOne();
  else if(queue)startNext(queue);
  return status();
 }
 function createProject(data:any){
  if(project||queue)return false; // strict: never work on two projects
  if(!kinds.includes(data?.kind)||!styles.includes(data?.style))return false;
  const title=typeof data.title==='string'?data.title.slice(0,70):data.kind;
  const reason=typeof data.reason==='string'?data.reason.slice(0,160):'';
  return startNext({kind:data.kind,style:data.style,title,reason});
 }
 function visit(name:string){
  if(!/^ADM_[a-zA-Z0-9_]{6,16}$/.test(name)||!game.server||!game.spawned)
   return {ok:false,error:'Administrador indisponível'};
  const s=visitors().find(s=>s.name===name);
  if(!s?.player||s.player.level!==resident.level)return {ok:false,error:'Entre no mundo da família'};
  const target=project||completed.at(-1);
  const x=target?.x??resident.x,y=target?.y??resident.y,z=target?.z??resident.z;
  s.teleportTo(x+siteSizes[(target?.kind||'tower') as Kind]/2+3,y+2,z+3,s.player.yaw,s.player.pitch);
  lastVisit=Date.now();return {ok:true,action:lastAction};
 }
 function status(){
  const p=project,blueprint=p?pattern(p):null;
  return {ok:true,ready:game.mode==='host'&&game.spawned,name:'Andarilha',
   role:'world_architect',action:p?'build':'observe',brain:'gemini',
   project:p?{kind:p.kind,style:p.style,title:p.title,reason:p.reason,progress:p.cursor,
    total:blueprint?.length||0,placed:p.placed,skipped:p.skipped,
    state:p.state,blockedReason:p.blockedReason,site:{x:p.x,y:p.y,z:p.z}}:null,
   nextProjectQueued:!!queue,completedCount:completed.length,completed:completed.slice(-8),
   placedTotal,steps,lastReason,searchCursor,
   built:p?.placed||0,planned:blueprint?.length||0,buildCursor:p?.cursor||0,
   buildReason:lastReason,buildPlot:p?{x:p.x,y:p.y,z:p.z}:null,
   visitors:visitors().length,walkingTicks,walkedBlocks:Math.round(walkedBlocks*10)/10,
   walkingTo:waypoint,lastMoveOk,roamMoves,hasPlot:!!p,
   currentGoal:p?.title||'Escolher a próxima obra',
   goalReason:p?.reason||'Criar um universo cada vez maior',
   position:{x:Math.round(resident.x),y:Math.round(resident.y),z:Math.round(resident.z)}};
 }
 function lifeSnapshot(){
  return {version:2,role:'world_architect',project,queue,completed:completed.slice(-200),
   placedTotal,searchCursor,blockedSites:blockedSites.slice(-80)};
 }
 function restoreLife(data:any){
  if(lifeRestored||data?.version!==2||data.role!=='world_architect')return false;
  const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<30000000;
  completed=(Array.isArray(data.completed)?data.completed:[]).slice(-200).filter((x:any)=>
   kinds.includes(x?.kind)&&finite(x.x)&&finite(x.y)&&finite(x.z)).map((x:any)=>({
    kind:x.kind,title:String(x.title||'').slice(0,70),x:x.x,y:x.y,z:x.z,
    placed:bounded(Number(x.placed)||0,0,100000)}));
  const p=data.project;
  if(p&&kinds.includes(p.kind)&&styles.includes(p.style)&&
   finite(p.x)&&finite(p.y)&&finite(p.z)){
   project={kind:p.kind,style:p.style,title:String(p.title||'').slice(0,70),
    reason:String(p.reason||'').slice(0,160),x:p.x,y:p.y,z:p.z,
    cursor:bounded(Number(p.cursor)||0,0,20000),placed:bounded(Number(p.placed)||0,0,20000),
    skipped:bounded(Number(p.skipped)||0,0,20000),startedAt:Number(p.startedAt)||Date.now(),
    state:p.state==='blocked'?'blocked':'building',blockedReason:String(p.blockedReason||'').slice(0,100)};
  }
  if(data.queue&&kinds.includes(data.queue.kind)&&styles.includes(data.queue.style))
   queue={kind:data.queue.kind,style:data.queue.style,
    title:String(data.queue.title||'').slice(0,70),reason:String(data.queue.reason||'').slice(0,160)};
  searchCursor=bounded(Number(data.searchCursor)||0,0,100000);
  placedTotal=bounded(Number(data.placedTotal)||0,0,1e8);
  blockedSites=(Array.isArray(data.blockedSites)?data.blockedSites:[]).slice(-80)
   .filter((x:any)=>finite(x?.x)&&finite(x?.z));
  lifeRestored=true;return true;
 }
 function setGoal(_goal:string,_reason:string){}
 (window as any).__gfcNpc={step,drive,status,visit,createProject,lifeSnapshot,restoreLife,setGoal};
}
