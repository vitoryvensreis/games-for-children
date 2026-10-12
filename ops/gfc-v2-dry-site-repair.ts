// One-time, resumable and non-destructive dry-site recovery for already saved
// V2 constructions. Never regenerates the world or moves X/Z landmarks.
// Changes only verified original attraction blocks and natural terrain.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';
import type { FamilySite, FamilyBlock } from './gfc-family-town';
const SEA=63, SAFE_Y=72, PAD=8, LOW=34, SCAN=1450, WRITES=240;
type Phase='check'|'copy'|'saveCopy'|'eraseOld'|'clear'|'foundation'|'saveFinal';
type Job={kind:FamilySite['kind'];x:number;z:number;oldY:number;y:number;high:number;
 phase:Phase;cursor:number};
type State={version:1;done:string[];blocked:string[];job:Job|null};
const SAFE=new Set(['air','water','lava','grass_block','dirt','coarse_dirt',
 'podzol','stone','sand','gravel','moss_block','snow_block','mud','clay',
 'mycelium','terracotta','deepslate','tuff','granite','diorite','andesite',
 'snow','short_grass','tall_grass','grass','fern','large_fern','dead_bush',
 'dandelion','poppy','cornflower','oxeye_daisy','moss_carpet','blue_orchid',
 'allium','oak_log','birch_log','spruce_log','jungle_log','acacia_log',
 'dark_oak_log','mangrove_log','cherry_log','oak_leaves','birch_leaves',
 'spruce_leaves','jungle_leaves','acacia_leaves','dark_oak_leaves',
 'mangrove_leaves','cherry_leaves','vine','seagrass','tall_seagrass','kelp',
 'kelp_plant','lily_pad','dirt_path']);
const id=(s:FamilySite)=>s.kind+':'+s.x+':'+s.z;
const cell=(x:number,y:number,z:number)=>x+','+y+','+z;
export function installGfcDrySiteRepair(game:Game,sites:FamilySite[],
 planFor:(kind:FamilySite['kind'])=>FamilyBlock[],onCommit:()=>void){
 const key='gfc-v2-dry-site-recovery-v1:'+String(game.meta?.id||'');
 let state:State={version:1,done:[],blocked:[],job:null};
 try{
  const j=JSON.parse(localStorage.getItem(key)||'null');
  if(j?.version===1&&Array.isArray(j.done)&&Array.isArray(j.blocked)&&
    (!j.job||['check','copy','saveCopy','eraseOld','clear','foundation','saveFinal'].includes(j.job.phase)))
   state=j;
 }catch{}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state))}catch{}};
 const old=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const release=()=>game.chunks.setTicket('gfc-v2-dry-site-repair',null);
 let busy=false,ticks=0,reason='Aguardando área segura',fixed=state.done.length;
 const empty=()=>!game.server||![...game.server.sessions.values()].some(
  s=>s.state==='play'&&s.player&&!s.player.removed);
 function bounds(j:Job){
  const blocks=planFor(j.kind),xs=blocks.map(b=>b.x),zs=blocks.map(b=>b.z);
  const x0=j.x+Math.min(...xs)-PAD,x1=j.x+Math.max(...xs)+PAD;
  const z0=j.z+Math.min(...zs)-PAD,z1=j.z+Math.max(...zs)+PAD;
  return {x0,x1,z0,z1,d:z1-z0+1,w:x1-x0+1,
   height:j.high-j.y+1,depth:j.y-LOW};
 }
 function loaded(a:ReturnType<typeof bounds>){
  for(let cx=a.x0>>4;cx<=a.x1>>4;cx++)
   for(let cz=a.z0>>4;cz<=a.z1>>4;cz++)
    if(!game.level.world.isLoaded(cx*16,cz*16))return false;
  return true;
 }
 function maps(j:Job){
  const plan=planFor(j.kind),source=new Map<string,string>(),
   destination=new Map<string,string>();
  for(const b of plan){
   source.set(cell(j.x+b.x,j.oldY+b.y,j.z+b.z),b.name);
   destination.set(cell(j.x+b.x,j.y+b.y,j.z+b.z),b.name);
  }
  return {plan,source,destination};
 }
 function begin(){
  for(const site of sites){
   if(state.done.includes(id(site))||state.blocked.includes(id(site)))continue;
   const plan=planFor(site.kind),max=Math.max(...plan.map(b=>b.y));
   const target=Math.max(SAFE_Y,site.y);
   // Existing areas above water still get a wider tree-free courtyard.
   state.job={kind:site.kind,x:site.x,z:site.z,oldY:site.y,
    y:target,high:Math.min(230,target+max+12),phase:'check',cursor:0};
   persist();return;
  }
  reason='Todas as áreas verificadas';release();
 }
 function blockSite(j:Job,why:string){
  const s=sites.find(s=>s.kind===j.kind);
  if(s&&!state.blocked.includes(id(s)))state.blocked.push(id(s));
  state.job=null;persist();release();
  reason='Proteção: '+j.kind+' — '+why;
 }
 function saveThen(j:Job,next:Phase){
  if(busy)return;
  busy=true;reason='Salvando '+j.kind+' antes de '+next;
  void game.saveWorld().then(()=>{
   j.phase=next;j.cursor=0;persist();busy=false;
  }).catch(e=>{busy=false;reason='Falha de salvamento: '+String(e).slice(0,85)});
 }
 function tick(){
  ticks++;
  if(!game.inWorld||!game.spawned||!game.server||!empty()){
   release();return;
  }
  if(busy)return;
  if(!state.job){if(ticks%20!==0)return;begin()}
  const j=state.job;if(!j)return;
  const a=bounds(j);
  game.chunks.setTicket('gfc-v2-dry-site-repair',[j.x>>4,j.z>>4,4]);
  if(!loaded(a)){reason='Carregando terreno de '+j.kind;return}
  const {plan,source,destination}=maps(j);
  // Verify the original blueprint before any writes. If children changed
  // blocks, preserve them and require an explicit manual decision.
  if(j.phase==='check'){
   if(j.cursor===0){
    for(const [coord,name] of source){
     const [x,y,z]=coord.split(',').map(Number);
     if(old(x,y,z)!==name){blockSite(j,'construção modificada');return}
    }
   }
   const total=a.w*a.d*a.height;let budget=0;
   while(j.cursor<total&&budget++<SCAN){
    const n=j.cursor++,col=Math.floor(n/a.height),dy=n%a.height;
    const x=a.x0+Math.floor(col/a.d),z=a.z0+col%a.d,y=j.y+dy;
    const p=cell(x,y,z),existing=old(x,y,z);
    if(!SAFE.has(existing)&&source.get(p)!==existing&&destination.get(p)!==existing){
     blockSite(j,'blocos protegidos no novo lote');return;
    }
   }
   reason='Verificando terreno protegido '+j.kind;
   if(j.cursor>=total){j.cursor=0;j.phase='copy';persist()}
   return;
  }
  if(j.phase==='copy'){
   // Save the elevated copy BEFORE removing any source block.
   let writes=0;
   while(j.cursor<plan.length&&writes++<WRITES){
    const b=plan[j.cursor++],x=j.x+b.x,y=j.y+b.y,z=j.z+b.z;
    if(old(x,y,z)!==b.name)game.level.setBlock(x,y,z,S(b.name));
   }
   if(j.cursor>=plan.length){j.cursor=0;j.phase='saveCopy';persist()}
   reason='Elevando '+j.kind;return;
  }
  if(j.phase==='saveCopy'){
   // The browser could crash after persisting the phase but BEFORE IndexedDB
   // commits the new copy. Restore all expected blocks before saving again.
   let missing=0;
   for(const b of plan){
    const x=j.x+b.x,y=j.y+b.y,z=j.z+b.z;
    if(old(x,y,z)!==b.name){game.level.setBlock(x,y,z,S(b.name));missing++}
   }
   if(missing){reason='Revalidando cópia após possível reinício';return}
   saveThen(j,'eraseOld');return;
  }
  if(j.phase==='eraseOld'){
   let writes=0;
   while(j.cursor<plan.length&&writes++<WRITES){
    const b=plan[j.cursor++],x=j.x+b.x,y=j.oldY+b.y,z=j.z+b.z;
    const p=cell(x,y,z);
    if(!destination.has(p)&&old(x,y,z)===b.name)
     game.level.setBlock(x,y,z,S('air'));
   }
   if(j.cursor>=plan.length){j.cursor=0;j.phase='clear';persist()}
   reason='Limpando blocos antigos de '+j.kind;return;
  }
  if(j.phase==='clear'){
   const total=a.w*a.d*a.height;let scans=0,writes=0;
   while(j.cursor<total&&scans++<SCAN&&writes<WRITES){
    const n=j.cursor++,col=Math.floor(n/a.height),dy=n%a.height;
    const x=a.x0+Math.floor(col/a.d),z=a.z0+col%a.d,y=j.y+dy;
    if(destination.has(cell(x,y,z)))continue;
    const existing=old(x,y,z);
    if(existing!=='air'){
     if(!SAFE.has(existing)){blockSite(j,'alteração externa detectada; preservando');return}
     game.level.setBlock(x,y,z,S('air'));writes++;
    }
   }
   if(j.cursor>=total){j.cursor=0;j.phase='foundation';persist()}
   reason='Desmatando e retirando água '+j.kind+': '+Math.floor(100*j.cursor/total)+'%';
   return;
  }
  if(j.phase==='foundation'){
   const depth=a.depth,total=a.w*a.d*depth;let scans=0,writes=0;
   while(j.cursor<total&&scans++<SCAN&&writes<WRITES){
    const n=j.cursor++,col=Math.floor(n/depth),down=n%depth;
    const x=a.x0+Math.floor(col/a.d),z=a.z0+col%a.d,y=j.y-1-down;
    const current=old(x,y,z);
    if(down===0){
     if(current!=='grass_block'){
      if(!SAFE.has(current)){blockSite(j,'piso protegido detectado');return}
      game.level.setBlock(x,y,z,S('grass_block'));writes++;
     }
     continue;
    }
    // Fill the ocean and shallow cavities, stop at stable natural ground.
    if(current!=='air'&&current!=='water'&&current!=='lava'){
     j.cursor=(col+1)*depth;continue;
    }
    game.level.setBlock(x,y,z,S('stone'));writes++;
   }
   if(j.cursor>=total){j.cursor=0;j.phase='saveFinal';persist()}
   reason='Criando praça acima da água '+j.kind+': '+Math.floor(100*j.cursor/total)+'%';
   return;
  }
  if(j.phase==='saveFinal'){
   busy=true;reason='Salvando terreno definitivo de '+j.kind;
   void game.saveWorld().then(()=>{
    const site=sites.find(s=>s.kind===j.kind&&s.x===j.x&&s.z===j.z);
    if(site){site.y=j.y;site.elevated=false;if(!state.done.includes(id(site)))state.done.push(id(site))}
    fixed=state.done.length;state.job=null;persist();onCommit();release();busy=false;
    reason='Praça e atração salvas: '+j.kind;
   }).catch(e=>{busy=false;reason='Erro ao salvar o terreno: '+String(e).slice(0,90)});
  }
 }
 const status=()=>({version:1,completed:fixed,total:sites.length,blocked:state.blocked.length,
  active:state.job?{name:state.job.kind,phase:state.job.phase,fromY:state.job.oldY,toY:state.job.y}:null,
  reason});
 return {tick,status};
}
