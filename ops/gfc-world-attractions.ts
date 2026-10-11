// Family world attractions, placed only in surveyed, unmodified loaded terrain.
// This file never uses networking, AI, privileged commands or a second Minecraft world.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';
import { installGroundRelocation } from './gfc-ground-relocation';

type Kind='names'|'windmill'|'pinwheels'|'castle'|'village'|'garden'|'watchtower';
type Block={x:number;y:number;z:number;name:string};
type Site={kind:Kind;x:number;y:number;z:number;elevated?:boolean};
type Work={site:Site;cursor:number};
type State={version:1;searchRevision:number;anchor:{x:number;z:number};completed:Site[];work:Work|null;attempts:number;phase:number;relocation?:any;movedKinds?:Kind[];blockedKinds?:Kind[]};
const KINDS:Kind[]=['names','windmill','pinwheels','castle','village','garden','watchtower'];
const SEARCH_REVISION=3;
const SAVE_KEY='gfc-family-exploration-landmarks-v1';
const LAND=['grass_block','dirt','coarse_dirt','podzol','stone','sand','gravel','snow_block'];
const OPEN=new Set(['air','short_grass','tall_grass','grass','fern','large_fern','dead_bush',
 'dandelion','poppy','cornflower','oxeye_daisy','snow','moss_carpet','blue_orchid','allium']);
const GLYPHS:Record<string,string[]>={
 C:['111','100','100','100','111'],
 A:['010','101','111','101','101'],
 I:['111','010','010','010','111'],
 Q:['111','101','101','111','001'],
 U:['101','101','101','101','111'],
 E:['111','100','110','100','111']
};
const dims:Record<Kind,{w:number;d:number;h:number}> = {
 names:{w:14,d:2,h:19},windmill:{w:4,d:6,h:19},pinwheels:{w:8,d:4,h:12},castle:{w:11,d:11,h:18},
 village:{w:11,d:11,h:10},garden:{w:7,d:7,h:4},watchtower:{w:6,d:6,h:19}
};
function shape(kind:Kind,legacyMirrored=false):Block[]{
 const out=new Map<string,Block>();
 const put=(x:number,y:number,z:number,name:string)=>out.set(x+','+y+','+z,{x,y,z,name});
 const rect=(x0:number,x1:number,z0:number,z1:number,y:number,name:string)=>{
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)put(x,y,z,name);
 };
 const house=(xx:number,zz:number,r:number)=>{
  rect(xx-r,xx+r,zz-r,zz+r,0,'cobblestone');
  for(let y=1;y<=4;y++)for(let x=xx-r;x<=xx+r;x++)for(let z=zz-r;z<=zz+r;z++){
   if(x!==xx-r&&x!==xx+r&&z!==zz-r&&z!==zz+r)continue;
   if(z===zz-r&&x===xx&&y<=2)continue;
   const windows=y===3&&(x===xx||z===zz);
   put(x,y,z,windows?'glass':'oak_planks');
  }
  rect(xx-r-1,xx+r+1,zz-r-1,zz+r+1,5,'spruce_planks');
  for(let x=xx-r;x<=xx+r;x++)for(let z=zz-r;z<=zz+r;z++)
   if((Math.abs(x-xx)===r||Math.abs(z-zz)===r)&&(x+z)%2===0)put(x,6,z,'spruce_slab');
 };
 if(kind==='names'){
  // Giant two-line marquee with the exact names CAIQUE / CAUÃ in block pixels.
  rect(-14,14,-2,2,0,'stone_bricks');
  for(let x=-14;x<=14;x++)for(let y=2;y<=16;y++)put(x,y,0,'black_concrete');
  for(let x=-14;x<=14;x++){put(x,1,0,'gold_block');put(x,17,0,'gold_block');}
  for(let y=1;y<=17;y++){put(-14,y,0,'gold_block');put(14,y,0,'gold_block');}
  const write=(letters:string,baseY:number,color:string)=>{
   const width=letters.length*4-1;
   let col=-Math.floor(width/2);
   for(const char of letters){
    for(let y=0;y<5;y++)for(let x=0;x<3;x++)
     if(GLYPHS[char]?.[y]?.[x]==='1')put(legacyMirrored?col+x:-(col+x),baseY+4-y,-1,color);
    col+=4;
   }
  };
  write('CAIQUE',10,'light_blue_concrete');
  write('CAUA',3,'lime_concrete');
  // Tilde over the last A of CAUÃ, aligned to the top-right name glyph.
  const tildeX=legacyMirrored?1:-1;
  put(tildeX*4,9,-1,'lime_concrete');
  put(tildeX*5,10,-1,'lime_concrete');
  put(tildeX*6,9,-1,'lime_concrete');
  for(let x=-13;x<=13;x+=2){put(x,18,0,'glowstone');}
 }else if(kind==='windmill'){
  rect(-3,3,-3,3,0,'stone_bricks');
  for(let y=1;y<=14;y++)for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
   if(Math.abs(x)!==3&&Math.abs(z)!==3)continue;
   if(z===-3&&x===0&&y<=2)continue;
   put(x,y,z,(y===7&&(x===0||z===0))?'glass':'oak_planks');
  }
  rect(-4,4,-4,4,15,'spruce_planks');
  rect(-3,3,-3,3,16,'spruce_planks');
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)put(x,17,z,'spruce_planks');
  put(0,10,-5,'oak_log'); // Rotating arms are actual blocks replicated to visitors.
  for(let t=1;t<=4;t++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
   put(dx*t,10+dy*t,-6,'white_wool');
 }else if(kind==='pinwheels'){
  // Three small wind-driven toys, each with its own real moving block blades.
  rect(-8,8,-4,4,0,'moss_block');
  for(const x of [-5,0,5]){
   for(let y=1;y<=9;y++)put(x,y,0,'oak_fence');
   put(x,7,-2,'oak_log');
   for(let t=1;t<=2;t++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    put(x+dx*t,7+dy*t,-3,'red_wool');
  }
 }else if(kind==='castle'){
  rect(-9,9,-9,9,0,'stone_bricks');
  for(let y=1;y<=10;y++)for(let x=-9;x<=9;x++)for(let z=-9;z<=9;z++){
   if(Math.abs(x)!==9&&Math.abs(z)!==9)continue;
   if(z===-9&&Math.abs(x)<=1&&y<=4)continue;
   put(x,y,z,'stone_bricks');
  }
  for(const xx of [-9,9])for(const zz of [-9,9]){
   for(let y=1;y<=14;y++)for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)
    if(Math.abs(dx)===2||Math.abs(dz)===2)put(xx+dx,y,zz+dz,'cobblestone');
   rect(xx-2,xx+2,zz-2,zz+2,15,'stone_bricks');
   for(let dx=-2;dx<=2;dx+=2)for(let dz=-2;dz<=2;dz+=2)
    put(xx+dx,16,zz+dz,'stone_bricks');
  }
  house(0,2,3);
  for(let x=-8;x<=8;x+=2){put(x,11,-9,'stone_bricks');put(x,11,9,'stone_bricks');}
  for(let z=-8;z<=8;z+=2){put(-9,11,z,'stone_bricks');put(9,11,z,'stone_bricks');}
 }else if(kind==='village'){
  rect(-11,11,-2,2,0,'dirt_path');
  rect(-2,2,-11,11,0,'dirt_path');
  for(const [x,z] of [[-6,-6],[6,-6],[-6,6],[6,6]])house(x,z,3);
  rect(-1,1,-1,1,1,'cobblestone');
  for(let y=2;y<=4;y++)for(const [x,z] of [[-1,-1],[-1,1],[1,-1],[1,1]])
   put(x,y,z,'oak_fence');
  rect(-1,1,-1,1,5,'spruce_planks');
  for(const [x,z] of [[-11,0],[11,0],[0,-11],[0,11]])put(x,1,z,'lantern');
 }else if(kind==='garden'){
  rect(-7,7,-7,7,0,'moss_block');
  for(let x=-7;x<=7;x++)for(let z=-7;z<=7;z++){
   if(Math.abs(x)===7||Math.abs(z)===7)put(x,1,z,'oak_fence');
   else if(x===0||z===0)put(x,1,z,'stone_bricks');
   else if((x*7+z*3)%7===0)put(x,1,z,'dandelion');
   else if((x+z)%5===0)put(x,1,z,'poppy');
  }
  for(const [x,z] of [[-7,-7],[7,-7],[-7,7],[7,7]])put(x,2,z,'lantern');
 }else{
  rect(-5,5,-5,5,0,'stone_bricks');
  for(let y=1;y<=15;y++)for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++){
   if(Math.abs(x)!==5&&Math.abs(z)!==5)continue;
   if(z===-5&&x===0&&y<=2)continue;
   put(x,y,z,'cobblestone');
  }
  rect(-6,6,-6,6,16,'stone_bricks');
  for(let x=-6;x<=6;x+=2){put(x,17,-6,'stone_bricks');put(x,17,6,'stone_bricks');}
  for(let z=-6;z<=6;z+=2){put(-6,17,z,'stone_bricks');put(6,17,z,'stone_bricks');}
 }
 return [...out.values()].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x);
}
export function installGfcWorldAttractions(game:Game){
 // Generate each immutable blueprint once instead of reconstructing thousands
 // of blocks five times a second and on every admin status request.
 const plans=new Map<Kind,Block[]>(KINDS.map(kind=>[kind,shape(kind)]));
 const planFor=(kind:Kind)=>plans.get(kind)!;
 // Version 1 wrote the letters on the north side of the sign in the wrong
 // world-X order. Keep the exact previous foreground as a repair whitelist.
 const oldSign=shape('names',true).filter(b=>b.z===-1);
 const newSign=planFor('names').filter(b=>b.z===-1);
 const anchor={x:Math.floor(game.player.x),z:Math.floor(game.player.z)};
 const key=SAVE_KEY+':'+String(game.meta?.id||'family');
 const fresh=():State=>({version:1,searchRevision:SEARCH_REVISION,anchor,completed:[],work:null,attempts:0,phase:0});
 let saved:State=fresh();
 try{
  const data=JSON.parse(localStorage.getItem(key)||'null');
  if(data?.version===1&&Array.isArray(data.completed)&&data.anchor&&
    Math.abs(data.anchor.x-anchor.x)<5&&Math.abs(data.anchor.z-anchor.z)<5){
   saved={version:1,searchRevision:SEARCH_REVISION,anchor,completed:data.completed.filter((x:any)=>KINDS.includes(x?.kind)&&
    Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.z)).slice(0,10),
    work:data.work?.site&&KINDS.includes(data.work.site.kind)?
      {site:data.work.site,cursor:0}:null,
    // Migration: previous search exhaustively scanned and pushed the cursor
    // many kilometres away. Restart its *search*, not the family world.
    attempts:data.searchRevision===SEARCH_REVISION&&Number.isFinite(data.attempts)?Math.max(0,Math.floor(data.attempts)):0,
    phase:Number.isFinite(data.phase)?data.phase:0,
    relocation:data.relocation?.kind&&KINDS.includes(data.relocation.kind)&&
      ['fill','copy','saveNew','erase','saveOld'].includes(data.relocation.phase)?data.relocation:null,
    movedKinds:Array.isArray(data.movedKinds)?data.movedKinds.filter((k:any)=>KINDS.includes(k)):[],
    blockedKinds:Array.isArray(data.blockedKinds)?data.blockedKinds.filter((k:any)=>KINDS.includes(k)):[]};
  }
 }catch{}
 const state=saved;
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state))}catch{}};
 let ticks=0,blocked='',finishedPending=false;
 let surveyed=0,rejected=0,waiting=0,firstCandidateAt=0;
 let pending:{kind:Kind;x:number;z:number}|null=null;
 const visitors=()=>game.server?[...game.server.sessions.values()].filter(
   session=>session.state==='play'&&session.player&&!session.player.removed):[];
 const parked=()=>visitors().length===0;
 const grounding=installGroundRelocation(game,state,planFor,persist,parked,
   ()=>signRepairStatus==='Corrigido');
 const siteFor=(kind:Kind,tries:number)=>{
  // Rotate ALL compass directions instead of searching a single narrow ray.
  // Forest at the spawn can otherwise reject every candidate indefinitely.
  const dir:[number,number][]=[[1,0],[0,1],[-1,0],[0,-1],
    [1,1],[-1,1],[1,-1],[-1,-1]];
  const probe=tries%256,turn=probe%8,ring=Math.floor(probe/8);
  const i=KINDS.indexOf(kind);
  const [dx,dz]=dir[turn],radius=44+(ring*13)+i*9;
  const sideways=(Math.floor(probe/8)%3-1)*9;
  return {x:anchor.x+dx*radius+(dz?sideways:0),
    z:anchor.z+dz*radius+(dx?-sideways:0)};
 };
 const nameAt=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const surface=(x:number,z:number):number|null=>{
  if(!game.level.world.isLoaded(x,z))return null;
  // Heightmap lookup is O(1); motionBlockingHeight() scanned hundreds of
  // world blocks per column, thousands of times during a single survey.
  const top=game.level.world.heightAt(x,z);
  if(top<40||top>170)return null;
  // Descend through low flowers/grass/snow. Trees, buildings, liquids and
  // any unfamiliar material disqualify this column rather than get cleared.
  for(let y=top;y>=top-5;y--){
   const here=nameAt(x,y,z),floor=nameAt(x,y-1,z);
   if(LAND.includes(floor)&&OPEN.has(here))return y;
   if(!OPEN.has(here))return null;
  }
  return null;
 };
 function siteAllowed(kind:Kind,x:number,y:number,z:number):number|null{
  const {w,d,h}=dims[kind];
  if(Math.hypot(x-anchor.x,z-anchor.z)<32)return null;
  if(state.completed.some(s=>Math.hypot(s.x-x,s.z-z)<39))return null;
  if(visitors().some(v=>Math.hypot(v.player!.x-x,v.player!.z-z)<26))return null;
  let minY=y,maxY=y;
  const x0=x-w-1,x1=x+w+1,z0=z-d-1,z1=z+d+1;
  // Coarse check: reject trees, buildings and cliffs without scanning
  // every vertical block in every column.
  for(let xx=x0;xx<=x1;xx+=3)for(let zz=z0;zz<=z1;zz+=3){
   const fy=surface(xx,zz);
   if(fy===null)return null;
   minY=Math.min(minY,fy);maxY=Math.max(maxY,fy);
   if(maxY-minY>5)return null;
  }
  const ground:number[]=[];
  for(let xx=x0;xx<=x1;xx++)for(let zz=z0;zz<=z1;zz++){
   const fy=surface(xx,zz);
   if(fy===null)return null;
   ground.push(fy);
   minY=Math.min(minY,fy);maxY=Math.max(maxY,fy);
   if(maxY-minY>5)return null;
  }
  // Check the actual construction volume *after* maxY is known.
  // Never overlook a raised roof just because that column was visited first.
  let index=0;
  for(let xx=x0;xx<=x1;xx++)for(let zz=z0;zz<=z1;zz++){
   const fy=ground[index++];
   for(let yy=Math.max(fy,maxY);yy<=maxY+h;yy++){
    if(!OPEN.has(nameAt(xx,yy,zz)))return null;
   }
  }
  return maxY;
 }
 function trySelect(){
  const kind=KINDS.find(k=>!state.completed.some(s=>s.kind===k));
  if(!kind||state.work||!parked())return;
  if(!pending||pending.kind!==kind){
   const site=siteFor(kind,state.attempts);
   pending={kind,...site};
   firstCandidateAt=Date.now();
   // Keep the same candidate long enough for the worker to generate its
   // chunks; changing tickets every two seconds starved the loading queue.
   game.chunks.setTicket('gfc-landmarks',[site.x>>4,site.z>>4,2]);
   blocked='Carregando região da próxima atração';
   return;
  }
  const {x,z}=pending,{w,d}=dims[kind];
  // Check every intersected chunk, including the far border.
  // Sampling at eight-block intervals could miss an unloaded outer chunk.
  let ready=true;
  for(let cx=(x-w-1)>>4;cx<=((x+w+1)>>4);cx++)
   for(let cz=(z-d-1)>>4;cz<=((z+d+1)>>4);cz++)
    if(!game.level.world.isLoaded(cx*16,cz*16))ready=false;
  if(!ready){
     waiting++;
     if(Date.now()-firstCandidateAt>45000){
      pending=null;state.attempts++;game.chunks.setTicket('gfc-landmarks',null);
      blocked='Região indisponível, tentando outra área';
     }else blocked='Aguardando carregar terreno';
     return;
  }
  surveyed++;
  const y=surface(x,z);
  const normal=y!==null?siteAllowed(kind,x,y,z):null;
  // Never create another floating platform as a fallback. Survey more
  // natural ground instead; existing elevated builds are migrated separately.
  const platformY=normal;
  pending=null;state.attempts++;
  if(platformY!==null){
   state.work={site:{kind,x,y:platformY,z,elevated:false},cursor:0};
   blocked='';persist();
  }else{
   rejected++;
   game.chunks.setTicket('gfc-landmarks',null);
   blocked='Terreno não aprovado; procurando clareira ou região acima da floresta';
  }
 }
 function buildBatch(){
  const w=state.work;if(!w||finishedPending)return;
  const plan=planFor(w.site.kind),s=w.site;
  const max=6;let steps=0;
  while(steps<max&&w.cursor<plan.length){
   const b=plan[w.cursor],x=s.x+b.x,y=s.y+b.y,z=s.z+b.z;
   if(!game.level.world.isLoaded(x,z)){blocked='Aguardando setor do mapa';return;}
   if(game.server && [...game.server.sessions.values()].some(g=>g.state==='play'&&g.player&&
      Math.hypot(g.player.x-s.x,g.player.z-s.z)<Math.max(dims[s.kind].w,dims[s.kind].d)+3)){
    blocked='Visitantes próximos da obra';return;
   }
   const current=nameAt(x,y,z);
   if(current===b.name){w.cursor++;steps++;continue;}
   if(!OPEN.has(current)){blocked='Bloco existente protegido: '+current;return;}
   game.level.setBlock(x,y,z,S(b.name));
   w.cursor++;steps++;
  }
  if(w.cursor>=plan.length){
   finishedPending=true;
   // Save actual blocks before committing a completed-site marker.
   void game.saveWorld().then(()=>{
    state.completed.push({...w.site});state.work=null;state.attempts=0;blocked='';finishedPending=false;
    game.chunks.setTicket('gfc-landmarks',null);
    persist();
   }).catch(()=>{finishedPending=false;blocked='Falha ao salvar estrutura';});
  }
 }
 let signRepairCursor=0,signRepairStatus='Aguardando',signRepairSaving=false;
 function repairOriginalMarquee(){
  const sign=state.completed.find(site=>site.kind==='names');
  if(!sign||!parked()||signRepairSaving)return;
  const fixedKey=key+':marquee-direction-v2:'+sign.x+':'+sign.z;
  if(localStorage.getItem(fixedKey)==='1'){signRepairStatus='Corrigido';return;}
  game.chunks.setTicket('gfc-sign-maintenance',[sign.x>>4,sign.z>>4,1]);
  if(!game.level.world.isLoaded(sign.x-14,sign.z-1)||
     !game.level.world.isLoaded(sign.x+14,sign.z)) {
   signRepairStatus='Carregando área do letreiro';return;
  }
  // Verify this is our existing billboard, not someone's construction.
  if(nameAt(sign.x-14,sign.y+1,sign.z)!=='gold_block'||
     nameAt(sign.x,sign.y+12,sign.z)!=='black_concrete'){
   signRepairStatus='Letreiro alterado: não modificar';
   game.chunks.setTicket('gfc-sign-maintenance',null);
   return;
  }
  const pos=(b:Block)=>b.x+','+b.y+','+b.z;
  const old=new Map(oldSign.map(b=>[pos(b),b.name]));
  const next=new Map(newSign.map(b=>[pos(b),b.name]));
  const changes=[...new Set([...old.keys(),...next.keys()])]
   .map(code=>{
    const [x,y,z]=code.split(',').map(Number);
    return {x,y,z,was:old.get(code)||'air',now:next.get(code)||'air'};
   }).filter(b=>b.was!==b.now);
  // Never repair a hand-modified letter or any unrelated placed block.
  // A partial update after a crash is fine: accept only old/new pixels.
  if(changes.some(b=>{
   const actual=nameAt(sign.x+b.x,sign.y+b.y,sign.z+b.z);
   return actual!==b.was&&actual!==b.now;
  })){
   signRepairStatus='Letreiro alterado manualmente: protegido';
   game.chunks.setTicket('gfc-sign-maintenance',null);
   return;
  }
  for(let n=0;n<16&&signRepairCursor<changes.length;n++,signRepairCursor++){
   const b=changes[signRepairCursor];
   if(nameAt(sign.x+b.x,sign.y+b.y,sign.z+b.z)!==b.now)
    game.level.setBlock(sign.x+b.x,sign.y+b.y,sign.z+b.z,S(b.now));
  }
  if(signRepairCursor<changes.length){signRepairStatus='Corrigindo letras';return;}
  // Persist blocks first, then mark maintenance complete. The old
  // original world/seed remain unchanged, save failure allows retry.
  signRepairStatus='Salvando correção';
  signRepairCursor=0;
  signRepairSaving=true;
  void game.saveWorld().then(()=>{
    signRepairSaving=false;
    localStorage.setItem(fixedKey,'1');
    signRepairStatus='Corrigido';
    game.chunks.setTicket('gfc-sign-maintenance',null);
  }).catch(()=>{signRepairSaving=false;signRepairStatus='Falha ao salvar letras';});
 }
 let rotorSaving=false;
 const rotorReady=(site:Site)=>localStorage.getItem(key+':3d-rotor:'+site.kind+':'+site.x+':'+site.z)==='1';
 function retireVoxelBlades(){
  if(!parked()||rotorSaving||state.relocation)return;
  const site=state.completed.find(s=>
   (s.kind==='windmill'||s.kind==='pinwheels')&&!rotorReady(s));
  if(!site)return;
  game.chunks.setTicket('gfc-rotor-cleanup',[site.x>>4,site.z>>4,1]);
  if(!game.level.world.isLoaded(site.x,site.z))return;
  const isMill=site.kind==='windmill';
  const offsets=isMill?[0]:[-5,0,5];
  const y=site.y+(isMill?10:7),front=site.z+(isMill?-6:-3);
  const wool=isMill?'white_wool':'red_wool';
  const touched:{x:number;y:number;z:number}[]=[];
  for(const off of offsets)for(let dx=-4;dx<=4;dx++)
   for(let dy=-4;dy<=4;dy++){
    if(!isMill&&(Math.abs(dx)>3||Math.abs(dy)>3))continue;
    const x=site.x+off+dx,z=front,py=y+dy;
    if(!game.level.world.isLoaded(x,z))return;
    const name=nameAt(x,py,z);
    if(name===wool)touched.push({x,y:py,z});
    else if(name!=='air'){ // A changed rotor belongs to the player now.
     blocked='Hélice modificada manualmente; não apagar blocos';
     game.chunks.setTicket('gfc-rotor-cleanup',null);return;
    }
   }
  for(const b of touched)game.level.setBlock(b.x,b.y,b.z,S('air'));
  rotorSaving=true;
  void game.saveWorld().then(()=>{
   rotorSaving=false;
   localStorage.setItem(key+':3d-rotor:'+site.kind+':'+site.x+':'+site.z,'1');
   game.chunks.setTicket('gfc-rotor-cleanup',null);
  }).catch(()=>{rotorSaving=false;blocked='Falha ao salvar substituição da hélice'});
 }
 function tick(){
  if(!game.inWorld||game.mode!=='host'||!game.spawned)return;
  ticks++;
  // Chunk generation and block updates compete with kids joining the server.
  // Suspend optional attractions whenever the multiplayer is occupied.
  if(!parked()){
   if(pending){
    pending=null;
    game.chunks.setTicket('gfc-landmarks',null);
   }
   if(state.work)game.chunks.setTicket('gfc-landmarks',null);
   game.chunks.setTicket('gfc-sign-maintenance',null);
   game.chunks.setTicket('gfc-rotor-cleanup',null);
   blocked='Atrações pausadas enquanto a família joga';
  }
  if(ticks%40===0&&state.work&&parked()){
   const s=state.work.site;game.chunks.setTicket('gfc-landmarks',[s.x>>4,s.z>>4,2]);
  }
  if(ticks%4===0&&state.work&&parked())buildBatch();
  if(ticks%60===0&&!state.work&&state.completed.length<KINDS.length&&parked())trySelect();
  // No more world-block swapping during gameplay: rotor motion is now
  // client-side 3D animation. Only retire old blades while the host is idle.
  if(ticks%80===0)retireVoxelBlades();
  if(ticks%40===0&&parked())repairOriginalMarquee();
  grounding.tick();
  if(ticks%200===0)persist();
 }
 function status(){
  const w=state.work;
  return {role:'landmark_builder',hiddenHost:true,aiEnabled:false,
   placedAttractions:state.completed.length,totalAttractions:KINDS.length,
   attractions:state.completed.map(s=>({name:s.kind,x:s.x,y:s.y,z:s.z,
    ready:(s.kind==='windmill'||s.kind==='pinwheels')?rotorReady(s):true})),
   building:w?{name:w.site.kind,x:w.site.x,y:w.site.y,z:w.site.z,
    done:w.cursor,total:planFor(w.site.kind).length,elevated:!!w.site.elevated}:null,
   blocked,searches:state.attempts,surveyed,rejected,waiting,
   terrainSearch:pending?{kind:pending.kind,x:pending.x,z:pending.z}:null,
   signRepair:signRepairStatus,grounding:grounding.status(),
   windmillAnimated:state.completed.some(s=>s.kind==='windmill'),
   pinwheelsAnimated:state.completed.some(s=>s.kind==='pinwheels')};
 }
 function destination(requested?:string){
  // Only actual, completed or active landmarks: never trust client
  // coordinates or arbitrary positions supplied through an API.
  if(requested){
   if(!KINDS.includes(requested as Kind))return null;
   return state.completed.find(s=>s.kind===requested)||
    (state.work?.site.kind===requested?state.work.site:null);
  }
  return state.completed.find(s=>s.kind==='names')||
   state.completed.at(-1)||state.work?.site||null;
 }
 return {tick,status,destination};
}
