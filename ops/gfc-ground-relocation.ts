// Relocate only the seven verified automated attractions to real natural ground.
// Two-phase commit: copy + save, then retire old owned blocks + save.
// Never relocate a player building, change the seed, or edit unknown block types.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';

export type FamilyKind='names'|'windmill'|'pinwheels'|'castle'|'village'|'garden'|'watchtower';
export type FamilyBlock={x:number;y:number;z:number;name:string};
export type FamilySite={kind:FamilyKind;x:number;y:number;z:number;elevated?:boolean};
type Relocation={kind:FamilyKind;from:FamilySite;to:FamilySite;phase:'fill'|'copy'|'saveNew'|'erase'|'saveOld';cursor:number;foundation:{x:number;y:number;z:number;name:string}[]};
type State={completed:FamilySite[];relocation?:Relocation|null;movedKinds?:FamilyKind[]};
const SOIL=new Set(['grass_block','dirt','coarse_dirt','podzol','stone','sand','gravel','snow_block','moss_block','mycelium']);
const TREE=/^(?:[a-z_]+_leaves|[a-z_]+_log|[a-z_]+_wood|vine|hanging_roots|mangrove_roots|azalea|flowering_azalea|oak_sapling|birch_sapling|spruce_sapling|jungle_sapling|acacia_sapling|dark_oak_sapling)$/;
const FLORA=new Set(['air','short_grass','tall_grass','grass','fern','large_fern','dead_bush','dandelion','poppy','cornflower','oxeye_daisy','snow','moss_carpet','blue_orchid','allium','pink_tulip','red_tulip','white_tulip','orange_tulip','sunflower','peony','rose_bush','lilac']);
const removable=(name:string)=>FLORA.has(name)||TREE.test(name);
const planKey=(b:FamilyBlock)=>b.x+','+b.y+','+b.z;
export function installGroundRelocation(
 game:Game,state:State,planFor:(k:FamilyKind)=>FamilyBlock[],persist:()=>void,
 canWork:()=>boolean,marqueeReady:()=>boolean
){
 let tickNumber=0,searches=0,reason='Aguardando terreno seguro',saving=false;
 const nameAt=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const dims=(kind:FamilyKind)=>{
  const list=planFor(kind);return {
   xmin:Math.min(...list.map(b=>b.x)),xmax:Math.max(...list.map(b=>b.x)),
   zmin:Math.min(...list.map(b=>b.z)),zmax:Math.max(...list.map(b=>b.z)),
   ymax:Math.max(...list.map(b=>b.y))};
 };
 function ground(x:number,z:number):number|null{
  if(!game.level.world.isLoaded(x,z))return null;
  const roof=game.level.world.heightAt(x,z);
  if(roof<36||roof>195)return null;
  for(let y=roof-1;y>=32;y--){
   const n=nameAt(x,y,z);
   if(SOIL.has(n))return y+1;
   if(!removable(n))return null; // houses, custom blocks, fluids and players' bases
  }
  return null;
 }
 function assess(site:FamilySite):{base:number;foundation:FamilyBlock[]}|null{
  const d=dims(site.kind),ys:{x:number;z:number;ground:number}[]=[];
  let high=-1000,low=1000;
  for(let x=site.x+d.xmin;x<=site.x+d.xmax;x++)
   for(let z=site.z+d.zmin;z<=site.z+d.zmax;z++){
    const fy=ground(x,z);if(fy===null)return null;
    high=Math.max(high,fy);low=Math.min(low,fy);
    if(high-low>5)return null;
    ys.push({x,z,ground:fy});
   }
  if(high+d.ymax>=220)return null;
  const base=high;
  const foundation:FamilyBlock[]=[];
  for(const col of ys){
   for(let y=col.ground;y<base;y++){
    if(!removable(nameAt(col.x,y,col.z)))return null;
    foundation.push({x:col.x,y,z:col.z,name:y===base-1?'dirt':'stone'});
   }
  }
  for(const b of planFor(site.kind)){
   const n=nameAt(site.x+b.x,base+b.y,site.z+b.z);
   if(n!==b.name&&!removable(n))return null;
  }
  return {base,foundation};
 }
 const offsets:[number,number][]=[[35,0],[-35,0],[0,35],[0,-35],
  [42,42],[-42,42],[42,-42],[-42,-42],[70,0],[-70,0],
  [0,70],[0,-70],[80,35],[-80,-35],[35,80],[-35,-80]];
 let choice=0;
 function tryStart(){
  if(!canWork())return;
  const existing=state.completed.find(s=>!state.movedKinds?.includes(s.kind));
  if(!existing){reason='Todas as estruturas estão apoiadas no terreno';return}
  if(existing.kind==='names'&&!marqueeReady()){reason='Aguardando correção segura do letreiro';return}
  const [dx,dz]=offsets[choice%offsets.length];
  const i=Math.floor(choice/offsets.length)%6;
  const offX=dx+(i*18*Math.sign(dx||1)),offZ=dz+(i*18*Math.sign(dz||1));
  const candidate={kind:existing.kind,x:existing.x+offX,z:existing.z+offZ,y:0,elevated:false};
  if(state.completed.some(s=>s!==existing&&Math.hypot(s.x-candidate.x,s.z-candidate.z)<42)){
   choice++;reason='Evitando construções próximas';return;
  }
  game.chunks.setTicket('gfc-ground-relocation',[candidate.x>>4,candidate.z>>4,2]);
  const d=dims(candidate.kind);
  for(let cx=(candidate.x+d.xmin)>>4;cx<=((candidate.x+d.xmax)>>4);cx++)
   for(let cz=(candidate.z+d.zmin)>>4;cz<=((candidate.z+d.zmax)>>4);cz++)
    if(!game.level.world.isLoaded(cx*16,cz*16)){
     reason='Carregando terreno firme';return;
    }
  searches++;
  const answer=assess(candidate);
  if(!answer){choice++;reason='Terreno irregular ou construído: procurando outro';return}
  // Confirm most of the source is still our automated structure before
  // starting the copy. Never relocate an unrelated hand-built landmark.
  const source=planFor(existing.kind);
  const rotor=existing.kind==='windmill'||existing.kind==='pinwheels';
  let recognized=0,unknown=0;
  for(const block of source){
   if(!game.level.world.isLoaded(existing.x+block.x,existing.z+block.z)){
    reason='Carregando estrutura original';return;
   }
   const here=nameAt(existing.x+block.x,existing.y+block.y,existing.z+block.z);
   if(here===block.name||(rotor&&/^(?:white|red)_wool$/.test(block.name)&&here==='air'))recognized++;
   else if(!removable(here))unknown++;
  }
  if(recognized<Math.floor(source.length*0.90)||unknown>0){
   reason='Construção original modificada por jogador; protegida';
   state.movedKinds=[...(state.movedKinds||[]),existing.kind];
   persist();return;
  }
  const target={...candidate,y:answer.base};
  state.relocation={kind:existing.kind,from:{...existing},to:target,
   phase:'fill',cursor:0,foundation:answer.foundation};
  reason='Transferindo '+existing.kind+' para o chão';persist();
 }
 function nextStep(){
  const job=state.relocation;
  if(!job||saving)return;
  const to=job.to,from=job.from;
  game.chunks.setTicket('gfc-ground-relocation',[to.x>>4,to.z>>4,2]);
  game.chunks.setTicket('gfc-old-attraction',[from.x>>4,from.z>>4,2]);
  if(!game.level.world.isLoaded(to.x,to.z)||!game.level.world.isLoaded(from.x,from.z))return;
  const list=job.phase==='fill'?job.foundation:planFor(job.kind);
  if(job.phase==='fill'||job.phase==='copy'||job.phase==='erase'){
   for(let n=0;n<12&&job.cursor<list.length;n++,job.cursor++){
    const b=list[job.cursor],dest=job.phase==='erase'?from:to;
    const x=job.phase==='fill'?b.x:dest.x+b.x;
    const y=job.phase==='fill'?b.y:dest.y+b.y;
    const z=job.phase==='fill'?b.z:dest.z+b.z;
    const now=nameAt(x,y,z);
    if(job.phase==='erase'){
     // Only original known attraction blocks, never unknown changes.
     if(now===b.name)game.level.setBlock(x,y,z,S('air'));
    }else{
     if(now===b.name)continue;
     if(!removable(now)){
      reason='Obra alterada: manutenção pausada por segurança';
      return;
     }
     game.level.setBlock(x,y,z,S(b.name));
    }
   }
   if(job.cursor>=list.length){
    job.cursor=0;
    job.phase=job.phase==='fill'?'copy':job.phase==='copy'?'saveNew':'saveOld';
    persist();
   }
   return;
  }
  if(job.phase==='saveNew'||job.phase==='saveOld'){
   saving=true;
   void game.saveWorld().then(()=>{
    saving=false;
    if(job.phase==='saveNew'){
     job.phase='erase';job.cursor=0;persist();return;
    }
    const index=state.completed.findIndex(s=>s.kind===job.kind&&s.x===from.x&&s.z===from.z);
    if(index>=0)state.completed[index]={...to};
    state.movedKinds=[...(state.movedKinds||[]).filter(k=>k!==job.kind),job.kind];
    state.relocation=null;persist();
    game.chunks.setTicket('gfc-ground-relocation',null);
    game.chunks.setTicket('gfc-old-attraction',null);
    reason=job.kind+' agora fica no chão';
   }).catch(()=>{saving=false;reason='Falha ao salvar, preservando ambos os locais'});
  }
 }
 function tick(){
  tickNumber++;
  if(!canWork())return;
  if(state.relocation){
   if(tickNumber%4===0)nextStep();
  }else if(tickNumber%80===0)tryStart();
 }
 function status(){return {relocating:state.relocation?{
  kind:state.relocation.kind,phase:state.relocation.phase,cursor:state.relocation.cursor,
  from:state.relocation.from,to:state.relocation.to}:null,
  grounded:(state.movedKinds||[]).length,searches,reason};}
 return {tick,status};
}
