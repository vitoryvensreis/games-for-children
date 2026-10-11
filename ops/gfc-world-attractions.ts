// Family world attractions, placed only in surveyed, unmodified loaded terrain.
// This file never uses networking, AI, privileged commands or a second Minecraft world.
import type { Game } from './game/game';
import { S, blockOf } from './world/block';

type Kind='names'|'windmill'|'castle'|'village'|'garden'|'watchtower';
type Block={x:number;y:number;z:number;name:string};
type Site={kind:Kind;x:number;y:number;z:number};
type Work={site:Site;cursor:number};
type State={version:1;anchor:{x:number;z:number};completed:Site[];work:Work|null;attempts:number;phase:number};
const KINDS:Kind[]=['names','windmill','castle','village','garden','watchtower'];
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
 names:{w:15,d:4,h:19},windmill:{w:8,d:9,h:22},castle:{w:14,d:14,h:20},
 village:{w:13,d:13,h:13},garden:{w:9,d:9,h:7},watchtower:{w:6,d:6,h:19}
};
function shape(kind:Kind):Block[]{
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
     if(GLYPHS[char]?.[y]?.[x]==='1')put(col+x,baseY+4-y,-1,color);
    col+=4;
   }
  };
  write('CAIQUE',10,'light_blue_concrete');
  write('CAUA',3,'lime_concrete');
  // Tilde over the last A of CAUÃ, aligned to the top-right name glyph.
  put(4,9,-1,'lime_concrete');put(5,10,-1,'lime_concrete');put(6,9,-1,'lime_concrete');
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
  put(0,10,-5,'oak_log'); // Rotor arms animate separately on the host.
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
 const anchor={x:Math.floor(game.player.x),z:Math.floor(game.player.z)};
 const key=SAVE_KEY+':'+String(game.meta?.id||'family');
 const fresh=():State=>({version:1,anchor,completed:[],work:null,attempts:0,phase:0});
 let saved:State=fresh();
 try{
  const data=JSON.parse(localStorage.getItem(key)||'null');
  if(data?.version===1&&Array.isArray(data.completed)&&data.anchor&&
    Math.abs(data.anchor.x-anchor.x)<5&&Math.abs(data.anchor.z-anchor.z)<5){
   saved={version:1,anchor,completed:data.completed.filter((x:any)=>KINDS.includes(x?.kind)&&
    Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.z)).slice(0,10),
    work:data.work?.site&&KINDS.includes(data.work.site.kind)?
      {site:data.work.site,cursor:0}:null,
    attempts:Number.isFinite(data.attempts)?data.attempts:0,phase:Number.isFinite(data.phase)?data.phase:0};
  }
 }catch{}
 const state=saved;
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state))}catch{}};
 let ticks=0,blocked='',finishedPending=false,spinnerFrame=0;
 const siteFor=(kind:Kind,tries:number)=>{
  const dir:[[number,number],[number,number],[number,number],[number,number],
   [number,number],[number,number],[number,number],[number,number]]=
   [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
  const n=tries%dir.length,ring=Math.floor(tries/dir.length);
  const rad=[36,48,60,74,88,105,122,140][ring%8];
  const [dx,dz]=dir[n];
  return {x:anchor.x+Math.round(dx*rad),z:anchor.z+Math.round(dz*rad)};
 };
 const nameAt=(x:number,y:number,z:number)=>blockOf(game.level.getState(x,y,z)).name;
 const surface=(x:number,z:number):number|null=>{
  if(!game.level.world.isLoaded(x,z))return null;
  const y=game.level.motionBlockingHeight(x,z);
  if(y<40||y>165)return null;
  if(!LAND.includes(nameAt(x,y-1,z)))return null;
  if(!OPEN.has(nameAt(x,y,z)))return null;
  return y;
 };
 function siteAllowed(kind:Kind,x:number,y:number,z:number):boolean{
  const {w,d,h}=dims[kind];
  if(Math.hypot(x-anchor.x,z-anchor.z)<30)return false;
  if(state.completed.some(s=>Math.hypot(s.x-x,s.z-z)<36))return false;
  if(game.server && [...game.server.sessions.values()].some(s=>s.state==='play'&&s.player&&
   Math.hypot(s.player.x-x,s.player.z-z)<22))return false;
  let maxY=y,minY=y;
  // Survey every footprint column + 2 block buffer for artificial walls or trees.
  for(let xx=x-w-2;xx<=x+w+2;xx++)for(let zz=z-d-2;zz<=z+d+2;zz++){
   const fy=surface(xx,zz);
   if(fy===null)return false;
   minY=Math.min(minY,fy);maxY=Math.max(maxY,fy);
   if(maxY-minY>2)return false;
   // Presence of structures, trees, unknown vegetation or artificial roofs
   // disqualifies the site before any block is placed.
   for(let yy=fy;yy<=fy+h;yy++){
    if(!OPEN.has(nameAt(xx,yy,zz)))return false;
   }
  }
  return true;
 }
 function trySelect(){
  const kind=KINDS.find(k=>!state.completed.some(s=>s.kind===k));
  if(!kind||state.work)return;
  const {x,z}=siteFor(kind,state.attempts++);
  const y=surface(x,z);
  if(y!==null&&siteAllowed(kind,x,y,z)){
   state.work={site:{kind,x,y,z},cursor:0};
   blocked='';persist();
  }
 }
 function buildBatch(){
  const w=state.work;if(!w||finishedPending)return;
  const plan=shape(w.site.kind),s=w.site;
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
    state.completed.push({...w.site});state.work=null;blocked='';finishedPending=false;
    persist();
   }).catch(()=>{finishedPending=false;blocked='Falha ao salvar estrutura';});
  }
 }
 const arms=(frame:number)=>{
  const out=new Set<string>();
  for(let t=1;t<=4;t++)for(const [dx,dy] of (frame===0?
   [[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[-1,1],[1,-1],[-1,-1]])){
   if(t>3&&frame===1)continue;
   out.add((dx*t)+','+(dy*t));
  }
  return out;
 };
 function animate(){
  const mill=state.completed.find(s=>s.kind==='windmill');
  if(!mill||!game.level.world.isLoaded(mill.x,mill.z))return;
  const front=mill.z-6,cy=mill.y+10;
  const before=arms(spinnerFrame),after=arms(1-spinnerFrame);
  // Only operate on our rotor frame, and stop permanently if any player alters it.
  for(const p of new Set([...before,...after])){
   const [dx,dy]=p.split(',').map(Number),x=mill.x+dx,y=cy+dy;
   if(!game.level.world.isLoaded(x,front))return;
   const n=nameAt(x,y,front),expected=before.has(p)?'white_wool':'air';
   if(n!==expected)return;
  }
  for(const p of new Set([...before,...after])){
   const [dx,dy]=p.split(',').map(Number),x=mill.x+dx,y=cy+dy;
   const expected=after.has(p)?'white_wool':'air';
   if(nameAt(x,y,front)!==expected)game.level.setBlock(x,y,front,S(expected));
  }
  spinnerFrame=1-spinnerFrame;
 }
 function tick(){
  if(!game.inWorld||game.mode!=='host'||!game.spawned)return;
  ticks++;
  if(ticks%4===0&&state.work)buildBatch();
  if(ticks%40===0&&!state.work&&state.completed.length<KINDS.length)trySelect();
  if(ticks%40===0)animate();
  if(ticks%200===0)persist();
 }
 function status(){
  const w=state.work;
  return {role:'landmark_builder',hiddenHost:true,aiEnabled:false,
   placedAttractions:state.completed.length,totalAttractions:KINDS.length,
   attractions:state.completed.map(s=>({name:s.kind,x:s.x,y:s.y,z:s.z})),
   building:w?{name:w.site.kind,done:w.cursor,total:shape(w.site.kind).length}:null,
   blocked,searches:state.attempts,windmillAnimated:state.completed.some(s=>s.kind==='windmill')};
 }
 function destination(){return state.completed.find(s=>s.kind==='names')||
   state.completed.at(-1)||state.work?.site||null;}
 return {tick,status,destination};
}
