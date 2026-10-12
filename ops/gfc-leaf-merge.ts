// Conservative 2x2 greedy rectangles for fully exposed cube-leaf faces.
// Geometry only. Does not read or change the actual world/blocks/physics.
// All candidate positions must pass the caller's material, light and visibility
// checks; the caller marks exactly the cells covered by the emitted rectangle.
export const LEAF_FACE_AXES: ReadonlyArray<readonly [number,number]> =
 [[0,2],[0,2],[0,1],[0,1],[2,1],[2,1]];
export type LeafMerge = {width:number;height:number;axisU:number;axisV:number};
export function mergeFoliageFace(
 x:number,y:number,z:number,dir:number,
 can:(x:number,y:number,z:number)=>boolean,
 mark:(x:number,y:number,z:number)=>void,
 maxSpan=2
):LeafMerge{
 const axes=LEAF_FACE_AXES[dir];
 if(!axes||x<0||x>=16||y<0||y>=16||z<0||z>=16)
  throw Error('Invalid section leaf face');
 const base=[x,y,z],u=axes[0],v=axes[1];
 const span=Math.max(1,Math.min(2,Math.floor(maxSpan)));
 let width=1,height=1;
 const at=(du:number,dv:number):[number,number,number]=>{
  const p=[...base];p[u]+=du;p[v]+=dv;
  return [p[0],p[1],p[2]];
 };
 // First grow horizontally. Never cross a chunk/section boundary.
 while(width<span&&base[u]+width<16){
  if(!can(...at(width,0)))break;
  width++;
 }
 // Then add only whole rows of identical, visible, equally lit faces.
 while(height<span&&base[v]+height<16){
  let valid=true;
  for(let i=0;i<width;i++)if(!can(...at(i,height))){valid=false;break}
  if(!valid)break;
  height++;
 }
 for(let j=0;j<height;j++)for(let i=0;i<width;i++)mark(...at(i,j));
 return {width,height,axisU:u,axisV:v};
}
