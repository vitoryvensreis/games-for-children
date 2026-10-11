// Family windmill visuals: continuously rotating decorative meshes.
// No block mutations per frame, no terrain meshing and no AI calls.
import type { Game } from './game/game';
import type { Renderer, Camera } from './render/renderer';
import { PoseStack } from './render/entityRenderer';
import { S } from './world/block';

type Rotor={name:'windmill'|'pinwheels';x:number;y:number;z:number;ready:boolean};
export function installGfcRotors(game:Game):void{
 if(new URLSearchParams(location.search).has('gfcHost'))return;
 let rotors:Rotor[]=[];
 let pending=false;
 const pose=new PoseStack();
 async function load(){
  if(pending||(window as any).__gfcFamilySession!==true||game.mode!=='client'||!game.inWorld)return;
  pending=true;
  try{
   const response=await fetch('/api/opuscraft/landmarks',{
    credentials:'same-origin',cache:'no-store'});
   if(response.ok){
    const result=await response.json();
    rotors=Array.isArray(result.attractions)?result.attractions.filter((s:any)=>
      (s.name==='windmill'||s.name==='pinwheels')&&s.ready&&
      [s.x,s.y,s.z].every(Number.isFinite)).map((s:any)=>({
       name:s.name,x:s.x,y:s.y,z:s.z,ready:true})).slice(0,2):[];
   }
  }catch{}finally{pending=false}
 }
 void load();
 const refresh=setInterval(()=>void load(),15000);
 // Render in exactly the same view/projection as native mobs and blocks.
 // Four narrow, fully 3D wool blades are transformed every animation frame.
 (window as any).__gfcRotorRender=(r:Renderer,cam:Camera)=>{
  if(!rotors.length||game.mode!=='client'||!game.spawned)return;
  const b=r.batch;
  b.lightB=240;b.lightS=240;
  const time=performance.now()*0.00013*360;
  for(const rotor of rotors){
   if(Math.hypot(rotor.x-cam.x,rotor.z-cam.z)>88)continue;
   const hubs=rotor.name==='windmill'?[0]:[-5,0,5];
   const centerY=rotor.y+(rotor.name==='windmill'?10.5:7.5);
   const centerZ=rotor.z+(rotor.name==='windmill'?-5.6:-2.6);
   const length=rotor.name==='windmill'?4.0:2.0;
   const material=S(rotor.name==='windmill'?'white_wool':'red_wool');
   for(const dx of hubs){
    for(let arm=0;arm<4;arm++){
     pose.reset();
     pose.translate(rotor.x+dx+0.5-cam.x,centerY-cam.y,centerZ-cam.z);
     pose.rotZ(time+arm*90);
     // The pivot stays fixed; the blades rotate continuously rather
     // than relocating real blocks in four-frame steps.
     pose.translate(-0.33,0.2,-0.12);
     pose.scale(0.66,length,0.28);
     r.items.renderBlockState(b,pose,material);
    }
   }
  }
 };
 // This module is loaded only in the family client frame. The timer cannot
 // influence the persistent headless host or children’s individual worlds.
 window.addEventListener('pagehide',()=>{clearInterval(refresh);
  delete (window as any).__gfcRotorRender;},{once:true});
}
