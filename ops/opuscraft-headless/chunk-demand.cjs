'use strict';
// Bounded terrain demand scheduler. Original upstream generator still does the
// actual generation; scheduling never overwrites already loaded columns.
// WARNING: generate() is synchronous, worker-thread offload is still pending.
function createChunkDemand({isLoaded,generate,maxPending=256}){
 if(typeof isLoaded!=='function'||typeof generate!=='function'||!Number.isInteger(maxPending)||maxPending<1)
  throw Error('Invalid chunk demand configuration');
 const pending=new Map();
 const key=(x,z)=>x+','+z;
 function requestAround(x,z,radius=1){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isInteger(radius)||radius<0||radius>3)
   throw Error('Invalid chunk demand position/radius');
  const cx=Math.floor(x/16),cz=Math.floor(z/16);
  let added=0;
  for(let ring=0;ring<=radius;ring++){
   for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
    const nx=cx+dx,nz=cz+dz,k=key(nx,nz);
    if(isLoaded(nx,nz)||pending.has(k))continue;
    if(pending.size>=maxPending)return added;
    pending.set(k,[nx,nz]);added++;
   }
  }
  return added;
 }
 function pump(){
  const first=pending.entries().next().value;
  if(!first)return false;
  const [k,[cx,cz]]=first;
  if(isLoaded(cx,cz)){pending.delete(k);return false}
  // Leave request queued if original engine throws so it can be diagnosed;
  // do not silently lose terrain or spin through retries in one tick.
  generate(cx,cz);
  pending.delete(k);
  return true;
 }
 return {requestAround,pump,stats:()=>({pending:pending.size}),clear:()=>pending.clear()};
}
module.exports={createChunkDemand};
