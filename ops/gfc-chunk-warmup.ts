// Offline-first warmup of the already-built V2 family town.
// The authoritative host keeps one 3x3 chunk ticket while empty, commits those
// generated chunks to the existing OpusCraft IndexedDB cache, then releases them.
// No duplicate world database, mesh serialization, or terrain changes.
import type { Game } from './game/game';
type Landmark={x:number;z:number;kind:string};
type WarmState={version:1;worldId:string;done:number;cached:string[]};
type Point={cx:number;cz:number};
const VERSION=1;
const GROUP_RADIUS=1;
const KEY_PREFIX='gfc-v2-warm-cache:';
const MAX_GROUPS=36;
function chunk(x:number){return Math.floor(x)>>4}
function key(cx:number,cz:number){return cx+','+cz}
export function warmupTargets(anchor:{x:number;z:number},landmarks:Landmark[]):Point[]{
 const targets:Point[]=[],seen=new Set<string>();
 const add=(x:number,z:number)=>{
  const cx=chunk(x),cz=chunk(z),id=key(cx,cz);
  if(!seen.has(id)&&targets.length<MAX_GROUPS){seen.add(id);targets.push({cx,cz})}
 };
 // Start with spawn and the signs; a 3x3 window feeds native chunk lighting.
 add(anchor.x,anchor.z);
 const sign=landmarks.find(s=>s.kind==='names');
 if(sign)add(sign.x,sign.z);
 // Build the nearby village routes; don't pre-generate the whole infinite world.
 for(const site of landmarks){
  add(site.x,site.z);
  if(site.kind==='names')continue;
  const dx=site.x-anchor.x,dz=site.z-anchor.z;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/48));
  for(let i=1;i<steps;i++)add(anchor.x+dx*i/steps,anchor.z+dz*i/steps);
 }
 // A little extra walking room around spawn + the highly visible sign.
 for(const [dx,dz] of [[32,0],[-32,0],[0,32],[0,-32]]){
  add(anchor.x+dx,anchor.z+dz);
  if(sign)add(sign.x+dx,sign.z+dz);
 }
 return targets;
}
export function installGfcChunkWarmup(game:Game,anchor:{x:number;z:number},landmarks:Landmark[]){
 const worldId=String(game.meta?.id||'');
 const storageKey=KEY_PREFIX+worldId;
 const targets=warmupTargets(anchor,landmarks);
 let state:WarmState={version:VERSION,worldId,done:0,cached:[]};
 try{
  const data=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(data?.version===VERSION&&data.worldId===worldId&&
     Number.isInteger(data.done)&&data.done>=0&&data.done<=targets.length&&
     Array.isArray(data.cached)&&data.cached.length<=300)
   state={version:VERSION,worldId,done:data.done,cached:data.cached.filter((v:unknown)=>typeof v==='string')};
 }catch{}
 const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{}};
 const release=()=>game.chunks.setTicket('gfc-v2-warm-cache',null);
 let busy=false,ticks=0,reason='Aguardando mundo vazio',lastSave=0;
 function tick(){
  ticks++;
  if(game.meta?.id!=='gamesnavagador-family-world-v2'||!game.inWorld||!game.spawned||!game.server){release();return}
  const players=[...game.server.sessions.values()].some(s=>s.state==='play'&&s.player&&!s.player.removed);
  if(players){reason='Pausado enquanto a família joga';release();return}
  if(busy)return;
  if(state.done>=targets.length){reason='Cache pronto';release();return}
  if(ticks%10!==0)return;
  const target=targets[state.done];
  game.chunks.setTicket('gfc-v2-warm-cache',[target.cx,target.cz,GROUP_RADIUS]);
  const chunks=[];
  for(let dz=-GROUP_RADIUS;dz<=GROUP_RADIUS;dz++)
   for(let dx=-GROUP_RADIUS;dx<=GROUP_RADIUS;dx++){
    const c=game.level.world.getChunk(target.cx+dx,target.cz+dz);
    if(!c){reason='Gerando chunks '+(state.done+1)+'/'+targets.length;return}
    chunks.push(c);
   }
  // A freshly generated chunk is not necessarily marked "modified": native
  // writeWorld persists only modified chunks. Commit generated chunks explicitly.
  // Skip already saved windows so an idle VPS never rewrites them indefinitely.
  const known=new Set(state.cached),newKeys:string[]=[];
  for(const c of chunks){
   const id=key(c.cx,c.cz);
   if(known.has(id))continue;
   c.modified=true;newKeys.push(id);
  }
  busy=true;reason='Salvando cache '+(state.done+1)+'/'+targets.length;
  void game.saveWorld().then(()=>{
   state.done++;
   if(newKeys.length)state.cached.push(...newKeys);
   lastSave=Date.now();persist();busy=false;
   release();reason='Chunks salvos: '+state.cached.length;
  }).catch((error)=>{
   busy=false;release();
   reason='Cache aguardando salvamento: '+String(error).slice(0,90);
  });
 }
 function status(){return {
  active:busy||state.done<targets.length,
  savedWindows:state.done,totalWindows:targets.length,
  savedChunks:state.cached.length,lastSave,
  reason
 }}
 return {tick,status};
}
