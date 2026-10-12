// GamesNavagador V2: a permanent planned family town, not a search for rare
// natural clearings. This module only runs on the NEW VPS-owned family world ID.
// Its seven blueprints are the same as the previous world (especially the sign).
import type { Game } from './game/game';
import { S, blockOf } from './world/block';
import { installGfcChunkWarmup } from './gfc-chunk-warmup';
import { installGfcDrySiteRepair } from './gfc-v2-dry-site-repair';

export type FamilyKind = 'names'|'windmill'|'pinwheels'|'castle'|'village'|'garden'|'watchtower';
export type FamilyBlock = {x:number;y:number;z:number;name:string};
export type FamilySite = {kind:FamilyKind;x:number;y:number;z:number;elevated:boolean};
type Phase = 'survey'|'clear'|'foundation'|'build';
type Job = {kind:FamilyKind;x:number;z:number;y:number;phase:Phase;cursor:number;high:number};
type State = {version:2;anchor:{x:number;z:number};completed:FamilySite[];job:Job|null};
const KEY='gfc-planned-family-v2';
const PAD=5;
const SCAN=110;
const MIN_Y=34;
const BUDGET=2200;
const BUILD_BUDGET=420;
// All positions are predetermined relative to the saved spawn point. None of
// the seven sites overlaps any other site's padded building footprint.
const TOWN:ReadonlyArray<{kind:FamilyKind;dx:number;dz:number}>=[
 {kind:'names',dx:0,dz:36},          // Text faces spawn. PRIORITY #1.
 {kind:'castle',dx:0,dz:-66},
 {kind:'village',dx:56,dz:-54},
 {kind:'windmill',dx:-57,dz:39},
 {kind:'pinwheels',dx:57,dz:40},
 {kind:'garden',dx:-54,dz:-53},
 {kind:'watchtower',dx:80,dz:-6}
];
type Area={x0:number;x1:number;z0:number;z1:number;w:number;d:number;maxBlock:number};
const naturalGround=new Set(['grass_block','dirt','coarse_dirt','podzol','stone','sand','gravel','moss_block',
 'snow_block','mud','clay','mycelium','terracotta','deepslate','tuff','granite','diorite','andesite']);
export function installGfcFamilyTown(game:Game,planFor:(kind:FamilyKind)=>FamilyBlock[]){
 const world=String(game.meta?.id||'');
 const key=KEY+':'+world;
 const spawn={x:Math.floor(game.player.x),z:Math.floor(game.player.z)};
 let saved:State|null=null;
 try{
  const raw=JSON.parse(localStorage.getItem(key)||'null');
  if(raw?.version===2&&raw.anchor&&Array.isArray(raw.completed)&&
    raw.completed.every((s:any)=>TOWN.some(p=>p.kind===s.kind)&&Number.isFinite(s.x)&&Number.isFinite(s.y))&&
    (!raw.job||TOWN.some(p=>p.kind===raw.job.kind)))
   saved=raw;
 }catch{}
 const state:State=saved||{version:2,anchor:spawn,completed:[],job:null};
 // Never derive the layout from a moving host after the first load.
 const origin=state.anchor;
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state))}catch{}};
 const nameAt=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const visitors=()=>game.server?[...game.server.sessions.values()].filter(
  s=>s.state==='play'&&s.player&&!s.player.removed):[];
 const empty=()=>visitors().length===0;
 const release=()=>game.chunks.setTicket('gfc-family-city',null);
 let ticks=0,busy=false,reason='Preparando o bairro da família',savedCount=state.completed.length;
 let warmup:ReturnType<typeof installGfcChunkWarmup>|null=null;
 let dryRepair:ReturnType<typeof installGfcDrySiteRepair>|null=null;
 function area(job:Job):Area{
  const b=planFor(job.kind);
  const xs=b.map(p=>p.x),zs=b.map(p=>p.z);
  const x0=job.x+Math.min(...xs)-PAD,x1=job.x+Math.max(...xs)+PAD;
  const z0=job.z+Math.min(...zs)-PAD,z1=job.z+Math.max(...zs)+PAD;
  return {x0,x1,z0,z1,w:x1-x0+1,d:z1-z0+1,maxBlock:Math.max(...b.map(p=>p.y))};
 }
 const loaded=(a:Area)=>{
  for(let x=a.x0>>4;x<=a.x1>>4;x++)
   for(let z=a.z0>>4;z<=a.z1>>4;z++)
    if(!game.level.world.isLoaded(x*16,z*16))return false;
  return true;
 };
 function floorY(x:number,z:number):number{
  // The heightmap is often a tree canopy. Find REAL stone/dirt below leaves,
  // without relying on a naturally open construction plot.
  const top=Math.min(210,game.level.world.heightAt(x,z));
  for(let y=top;y>=MIN_Y;y--)if(naturalGround.has(nameAt(x,y,z)))return y;
  return 63;
 }
 function newJob(){
  const next=TOWN.find(p=>!state.completed.some(s=>s.kind===p.kind));
  if(!next){reason='Bairro pronto: 7 construções salvas e permanentes';release();return}
  const job:Job={kind:next.kind,x:origin.x+next.dx,z:origin.z+next.dz,
   y:0,phase:'survey',cursor:0,high:0};
  state.job=job;persist();
 }
 function changePhase(job:Job,phase:Phase){
  if(busy)return;
  busy=true;reason='Salvando '+job.kind+' antes da próxima etapa';
  void game.saveWorld().then(()=>{
   job.phase=phase;job.cursor=0;persist();busy=false;
   reason='Preparando '+job.kind+': '+phase;
  }).catch(e=>{busy=false;reason='Falha no salvamento: '+String(e).slice(0,80)});
 }
 function finish(job:Job){
  if(busy)return;
  busy=true;reason='Salvando a construção '+job.kind;
  void game.saveWorld().then(()=>{
   if(!state.completed.some(s=>s.kind===job.kind))
    state.completed.push({kind:job.kind,x:job.x,y:job.y,z:job.z,elevated:false});
   savedCount=state.completed.length;
   state.job=null;persist();release();busy=false;
   reason='Construção salva: '+job.kind;
  }).catch(e=>{busy=false;reason='Não foi possível salvar '+job.kind+': '+String(e).slice(0,70)});
 }
 function tick(){
  ticks++;
  if(!game.inWorld||!game.spawned||!empty()||busy){
   if(!empty()){release();warmup?.tick();dryRepair?.tick();}
   return;
  }
  // Never preload chunks while constructing buildings or with visitors online.
  if(!state.job&&state.completed.length===TOWN.length){
   release();
   // Fix submersed attractions FIRST. The optional cache must never delay
   // correcting buildings below sea level, and neither writes while kids play.
   if(!dryRepair)dryRepair=installGfcDrySiteRepair(game,state.completed,planFor,()=>{
    savedCount=state.completed.length;persist();
   });
   const maintenance=dryRepair.status();
   if(maintenance.completed+maintenance.blocked<maintenance.total){
    dryRepair.tick();return;
   }
   if(!warmup)warmup=installGfcChunkWarmup(game,origin,state.completed);
   warmup.tick();return;
  }
  if(!state.job)newJob();
  const job=state.job;if(!job)return;
  const a=area(job);
  // One short-lived chunk ticket follows the construction crew and is dropped
  // after each committed building to avoid keeping a giant area simulated.
  game.chunks.setTicket('gfc-family-city',[job.x>>4,job.z>>4,3]);
  if(!loaded(a)){reason='Carregando setores do lote '+job.kind;return}
  if(job.phase==='survey'){
   const heights:number[]=[];
   // A robust median is a better flat pad altitude than tree canopy peaks.
   for(let x=a.x0;x<=a.x1;x+=3)for(let z=a.z0;z<=a.z1;z+=3)heights.push(floorY(x,z));
   heights.sort((a,b)=>a-b);
   job.y=Math.max(72,Math.min(160,heights[Math.floor(heights.length/2)]+1));
   job.high=Math.min(224,Math.max(job.y+a.maxBlock+18,
    ...[a.x0,a.x1,job.x].flatMap(x=>[a.z0,a.z1,job.z].map(z=>game.level.world.heightAt(x,z)+6))));
   job.cursor=0;job.phase='clear';persist();
   reason='Desmatando e aplainando '+job.kind;
   return;
  }
  if(job.phase==='clear'){
   const height=job.high-job.y+1,total=a.w*a.d*height;
   let inspected=0,changed=0;
   while(job.cursor<total&&inspected++<BUDGET&&changed<BUILD_BUDGET){
    const index=job.cursor++,column=Math.floor(index/height),dy=index%height;
    const x=a.x0+Math.floor(column/a.d),z=a.z0+column%a.d,y=job.y+dy;
    const old=nameAt(x,y,z);
    // New world is explicitly disposable; clear BOTH trunks and leaves,
    // excess cliffs, flowers, water, stone, and floating generated debris.
    if(old!=='air'){game.level.setBlock(x,y,z,S('air'));changed++}
   }
   reason='Limpando árvores e relevo: '+Math.floor(100*job.cursor/total)+'%';
   if(job.cursor>=total)changePhase(job,'foundation');
   return;
  }
  if(job.phase==='foundation'){
   const depth=job.y-MIN_Y,total=a.w*a.d*depth;
   let inspected=0,changed=0;
   while(job.cursor<total&&inspected++<BUDGET&&changed<BUILD_BUDGET){
    const index=job.cursor++,col=Math.floor(index/depth),down=index%depth;
    const x=a.x0+Math.floor(col/a.d),z=a.z0+col%a.d,y=job.y-1-down;
    const current=nameAt(x,y,z);
    if(down===0){if(current!=='grass_block'){game.level.setBlock(x,y,z,S('grass_block'));changed++}continue}
    // Fill only until the first real natural supporting block. Skip deep caves.
    if(current!=='air'&&current!=='water'&&current!=='lava'){
     job.cursor=(col+1)*depth;
     continue;
    }
    game.level.setBlock(x,y,z,S('stone'));changed++;
   }
   reason='Criando fundação plana: '+Math.floor(100*job.cursor/total)+'%';
   if(job.cursor>=total)changePhase(job,'build');
   return;
  }
  const b=planFor(job.kind);
  let n=0;
  while(job.cursor<b.length&&n++<BUILD_BUDGET){
   const p=b[job.cursor++];
   const x=job.x+p.x,y=job.y+p.y,z=job.z+p.z;
   if(nameAt(x,y,z)!==p.name)game.level.setBlock(x,y,z,S(p.name));
  }
  reason='Construindo '+job.kind+': '+Math.floor(100*job.cursor/b.length)+'%';
  if(job.cursor>=b.length)finish(job);
 }
 function status(){
  const w=state.job;
  return {role:'landmark_builder',hiddenHost:true,aiEnabled:false,
   version:2,mode:'planned_city',placedAttractions:state.completed.length,
   totalAttractions:TOWN.length,
   attractions:state.completed.map(s=>({name:s.kind,x:s.x,y:s.y,z:s.z,ready:true})),
   building:w?{name:w.kind,x:w.x,y:w.y,z:w.z,
    done:w.phase==='build'?w.cursor:0,total:planFor(w.kind).length,phase:w.phase}:null,
   blocked:reason,searches:0,surveyed:0,rejected:0,waiting:0,
   drySiteRepair:dryRepair?.status()||{version:1,completed:0,total:7,blocked:0,active:null,reason:'Aguardando cache do mundo'},
   prewarm:warmup?.status()||{active:false,savedWindows:0,totalWindows:0,savedChunks:0,reason:'Aguardando 7 construções'},
   terrainSearch:null,terrainCare:{active:null,repaired:savedCount,
    protected:0,remaining:TOWN.length-state.completed.length,reason},
   signRepair:'O letreiro é a primeira atração do bairro',registryRecoveryRequired:false};
 }
 function destination(requested?:string){
  const site=requested?state.completed.find(s=>s.kind===requested):state.completed[0];
  return site?{kind:site.kind,x:site.x,y:site.y,z:site.z}:null;
 }
 function recoverNear(_kind:FamilyKind,_px:number,_py:number,_pz:number){return {ok:false,error:'Novo mundo planejado: os registros são automáticos'};}
 return {tick,status,destination,recoverNear};
}
