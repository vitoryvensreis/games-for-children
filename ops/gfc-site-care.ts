// Repair automated family landmarks IN PLACE: preserve X/Z, lower high floating
// landmarks vertically when safe, remove intersecting natural trees, flatten and
// support the footprint. This never changes a player's world or private saves.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';
import type { FamilyBlock, FamilyKind, FamilySite } from './gfc-ground-relocation';

type Cell={x:number;y:number;z:number;name:string};
export type SiteCareJob={
 site:FamilySite;targetY:number;moving:boolean;
 phase:'clear'|'foundation'|'copy'|'saveNew'|'eraseOld'|'saveOld';
 cursor:number;clear:Cell[];foundation:Cell[];
};
type CareState={
 completed:FamilySite[];siteCare?:SiteCareJob|null;
 caredSites?:string[];careBlocked?:string[];
};
const SOIL=new Set(['grass_block','dirt','coarse_dirt','podzol','stone','sand','gravel','snow_block','moss_block','mycelium','clay','terracotta']);
const FLORA=new Set(['air','short_grass','tall_grass','grass','fern','large_fern','dead_bush',
 'dandelion','poppy','cornflower','oxeye_daisy','snow','moss_carpet','blue_orchid','allium',
 'pink_tulip','red_tulip','white_tulip','orange_tulip','sunflower','peony','rose_bush','lilac']);
const TREE=/^(?:[a-z_]+_(?:leaves|log|wood|stem|hyphae)|vine|weeping_vines|twisting_vines|hanging_roots|mangrove_roots|azalea|flowering_azalea|[a-z_]+_sapling)$/;
const natural=(name:string)=>SOIL.has(name)||FLORA.has(name)||TREE.test(name);
const siteId=(s:FamilySite)=>s.kind+':'+s.x+':'+s.y+':'+s.z;
const cellId=(x:number,y:number,z:number)=>x+','+y+','+z;
const PAD=3;
const BATCH=36;
export function installGfcSiteCare(
 game:Game,state:CareState,planFor:(kind:FamilyKind)=>FamilyBlock[],
 persist:()=>void,parked:()=>boolean,canStart:()=>boolean
){
 let ticks=0,busy=false,reason='Aguardando manutenção do terreno',repaired=0,skipped=0;
 const nameAt=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const loaded=(x:number,z:number)=>game.level.world.isLoaded(x,z);
 const release=()=>game.chunks.setTicket('gfc-site-care',null);
 const bounds=(s:FamilySite,plan:FamilyBlock[])=>({
  x0:s.x+Math.min(...plan.map(b=>b.x))-PAD,
  x1:s.x+Math.max(...plan.map(b=>b.x))+PAD,
  z0:s.z+Math.min(...plan.map(b=>b.z))-PAD,
  z1:s.z+Math.max(...plan.map(b=>b.z))+PAD,
  high:Math.max(...plan.map(b=>b.y))
 });
 const isMine=(s:FamilySite,plan:FamilyBlock[])=>{
  let recognized=0,edited=0;
  for(const b of plan){
   const n=nameAt(s.x+b.x,s.y+b.y,s.z+b.z);
   if(n===b.name||((s.kind==='windmill'||s.kind==='pinwheels')&&/^(?:red|white)_wool$/.test(b.name)&&n==='air'))recognized++;
   else if(!natural(n))edited++;
  }
  return recognized>=Math.floor(plan.length*.86)&&edited===0;
 };
 function survey(s:FamilySite):SiteCareJob|null{
  const plan=planFor(s.kind),d=bounds(s,plan);
  game.chunks.setTicket('gfc-site-care',[s.x>>4,s.z>>4,3]);
  for(let x=d.x0;x<=d.x1;x++)for(let z=d.z0;z<=d.z1;z++)
   if(!loaded(x,z)){reason='Carregando área original de '+s.kind;return null;}
  if(!isMine(s,plan)){
   reason='Construção alterada: revisão manual necessária ('+s.kind+')';
   state.careBlocked=[...(state.careBlocked||[]),siteId(s)];
   persist();release();return null;
  }
  const soilCols:{x:number;z:number;surface:number}[]=[];
  let top=-1000,bottom=1000;
  for(let x=d.x0;x<=d.x1;x++)for(let z=d.z0;z<=d.z1;z++){
   let found=-1;
   // Scan BELOW the original building; heightAt() alone sees its roof/trees.
   for(let y=Math.min(s.y-1,game.level.world.heightAt(x,z)-1);y>=32;y--){
    const n=nameAt(x,y,z);
    if(SOIL.has(n)){found=y+1;break;}
   }
   if(found<0){
    reason='Sem solo natural confirmado; preservando '+s.kind;
    state.careBlocked=[...(state.careBlocked||[]),siteId(s)];
    persist();release();return null;
   }
   top=Math.max(top,found);bottom=Math.min(bottom,found);
   soilCols.push({x,z,surface:found});
  }
  if(top-bottom>24){
   reason='Declive muito grande; revisão manual necessária ('+s.kind+')';
   state.careBlocked=[...(state.careBlocked||[]),siteId(s)];
   persist();release();return null;
  }
  // A vertical move only happens when old/new volumes cannot overlap.
  // For ordinary builds keep their original Y, level the land to that floor.
  const moving=s.y-top>d.high+5&&top>35&&top+d.high<220;
  const targetY=moving?top:s.y;
  const source=new Map(plan.map(b=>[cellId(s.x+b.x,s.y+b.y,s.z+b.z),b.name]));
  const clear:Cell[]=[],foundation:Cell[]=[];
  const maxY=Math.min(230,Math.max(s.y,targetY)+d.high+4);
  for(const col of soilCols){
   for(let y=targetY;y<=maxY;y++){
    const n=nameAt(col.x,y,col.z),p=source.get(cellId(col.x,y,col.z));
    if(p===n)continue; // Never clear known landmark blocks.
    if(TREE.test(n)||FLORA.has(n)&&n!=='air'||(SOIL.has(n)&&y>=targetY)){
     // Do not clear the natural terrain at the old elevation except where
     // necessary for a level footprint; distant mountains are untouched.
     if(n!=='air'&&(!moving||y<targetY+d.high+4||TREE.test(n)))
      clear.push({x:col.x,y,z:col.z,name:n});
    }
   }
   if(col.surface<targetY){
    for(let y=col.surface;y<targetY;y++){
     const current=nameAt(col.x,y,col.z);
     if(source.get(cellId(col.x,y,col.z))===current)continue;
     if(!natural(current)){
      reason='Fundação contém blocos protegidos; preservando '+s.kind;
      state.careBlocked=[...(state.careBlocked||[]),siteId(s)];persist();release();return null;
     }
     foundation.push({x:col.x,y,z:col.z,name:y===targetY-1?'dirt':'stone'});
    }
   }
  }
  // Validate every destination cell before making any change. The plan can
  // replace natural terrain, but cannot overwrite other custom constructions.
  if(moving)for(const b of plan){
   const n=nameAt(s.x+b.x,targetY+b.y,s.z+b.z);
   if(!natural(n)&&n!==b.name){
    reason='Destino contém construção protegida ('+s.kind+')';
    state.careBlocked=[...(state.careBlocked||[]),siteId(s)];persist();release();return null;
   }
  }
  if(clear.length+foundation.length>40000){
   reason='Reparo muito grande; evitando travamento ('+s.kind+')';
   state.careBlocked=[...(state.careBlocked||[]),siteId(s)];persist();release();return null;
  }
  reason=(moving?'Baixando':'Nivelando')+' '+s.kind+' no mesmo X/Z';
  return {site:{...s},targetY,moving,phase:'clear',cursor:0,clear,foundation};
 }
 function step(){
  const j=state.siteCare;if(!j||busy)return;
  game.chunks.setTicket('gfc-site-care',[j.site.x>>4,j.site.z>>4,3]);
  const plan=planFor(j.site.kind);
  const d=bounds(j.site,plan);
  for(let x=d.x0;x<=d.x1;x++)for(let z=d.z0;z<=d.z1;z++)
   if(!loaded(x,z)){reason='Aguardando chunks da manutenção';return;}
  const cells:Cell[]=j.phase==='clear'?j.clear:j.phase==='foundation'?j.foundation:
   j.phase==='copy'?plan.map(b=>({x:j.site.x+b.x,y:j.targetY+b.y,z:j.site.z+b.z,name:b.name})):
   j.phase==='eraseOld'?plan.map(b=>({x:j.site.x+b.x,y:j.site.y+b.y,z:j.site.z+b.z,name:b.name})):[];
  if(['clear','foundation','copy','eraseOld'].includes(j.phase)){
   let done=0;
   while(j.cursor<cells.length&&done++<BATCH){
    const b=cells[j.cursor],now=nameAt(b.x,b.y,b.z);
    if(j.phase==='clear'){
     if(now===b.name&&natural(now))game.level.setBlock(b.x,b.y,b.z,S('air'));
     else if(now!=='air'&&now!==b.name){reason='Área alterada; manutenção pausada';return;}
    }else if(j.phase==='foundation'){
     if(now!==b.name){
      if(!natural(now)){reason='Fundação modificada; manutenção pausada';return;}
      game.level.setBlock(b.x,b.y,b.z,S(b.name));
     }
    }else if(j.phase==='copy'){
     if(now!==b.name){
      if(!natural(now)){reason='Destino modificado; manutenção pausada';return;}
      game.level.setBlock(b.x,b.y,b.z,S(b.name));
     }
    }else if(now===b.name)game.level.setBlock(b.x,b.y,b.z,S('air'));
    j.cursor++;
   }
   if(j.cursor>=cells.length){
    j.cursor=0;
    j.phase=j.phase==='clear'?'foundation':j.phase==='foundation'?(j.moving?'copy':'saveNew'):
     j.phase==='copy'?'saveNew':'saveOld';
    persist();
   }else if(j.cursor%144===0)persist();
   return;
  }
  busy=true;
  void game.saveWorld().then(()=>{
   busy=false;
   if(j.phase==='saveNew'&&j.moving){j.phase='eraseOld';j.cursor=0;persist();return;}
   if(j.moving){
    const entry=state.completed.find(s=>siteId(s)===siteId(j.site));
    if(entry){entry.y=j.targetY;entry.elevated=false;}
   }else{
    const entry=state.completed.find(s=>siteId(s)===siteId(j.site));
    if(entry)entry.elevated=false; // Fully founded and tree-free at same Y.
   }
   state.caredSites=[...(state.caredSites||[]),siteId({...j.site,y:j.targetY})];
   state.siteCare=null;persist();release();repaired++;
   reason='Terreno corrigido e salvo: '+j.site.kind;
  }).catch(()=>{busy=false;reason='Falha ao salvar o mundo; tentativa protegida'});
 }
 function tick(){
  ticks++;
  if(!parked()||!canStart()){release();return;}
  if(state.siteCare){if(ticks%4===0)step();return;}
  if(ticks%40!==0)return;
  const next=state.completed.find(s=>!(state.caredSites||[]).includes(siteId(s))&&
   !(state.careBlocked||[]).includes(siteId(s)));
  if(!next){release();reason='Todas as estruturas verificadas';return;}
  const job=survey(next);
  if(job){state.siteCare=job;persist();}
 }
 function status(){return {active:state.siteCare?{name:state.siteCare.site.kind,
  phase:state.siteCare.phase,done:state.siteCare.cursor,
  total:state.siteCare.phase==='clear'?state.siteCare.clear.length:state.siteCare.phase==='foundation'?state.siteCare.foundation.length:planFor(state.siteCare.site.kind).length,
  sameX:state.siteCare.site.x,sameZ:state.siteCare.site.z}:null,
  repaired,protected:state.careBlocked?.length||0,remaining:state.completed.filter(s=>!(state.caredSites||[]).includes(siteId(s))&&!(state.careBlocked||[]).includes(siteId(s))).length,reason};}
 return {tick,status};
}
