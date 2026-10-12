// Applied only to the pinned audited upstream source by ops/build-opuscraft.sh.
// No world/inventory file is migrated and no personal singleplayer mesh changes.
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
if(!root)throw Error('Usage: node ops/patch-opuscraft-mesh.mjs <opuscraft-src>');
function patch(file,find,replace){
 const full=path.join(root,file),old=fs.readFileSync(full,'utf8');
 if(old.indexOf(find)<0||old.indexOf(find)!==old.lastIndexOf(find))
  throw Error('Upstream changed; refusing mesher patch in '+file);
 fs.writeFileSync(full,old.replace(find,replace));
}
patch('src/render/mesher.ts',
 "import { MIN_Y } from '../world/constants';",
 "import { MIN_Y } from '../world/constants';\nimport { mergeFoliageFace } from './gfc-leaf-merge';");
patch('src/render/mesher.ts',
 "  fancy: boolean;\n  /** the dimension has constant ambient light",
 "  fancy: boolean;\n  foliageMerge?: boolean;\n  /** the dimension has constant ambient light");
patch('src/world/chunkManager.ts',
 "      const input = this.world.buildMeshInput(c.cx, si, c.cz, this.smoothLighting, this.fancyLeaves);\n      if (!input) continue;",
 "      const input = this.world.buildMeshInput(c.cx, si, c.cz, this.smoothLighting, this.fancyLeaves);\n      if (!input) continue;\n      input.foliageMerge = (window as any).__gfcFamilySession === true && (window as any).__game?.mode === 'client';");
patch('src/render/mesher.ts',
 "  const blocks = input.blocks;\n  // positions relative to the section origin",
 "  const blocks = input.blocks;\n  const foliageMask = input.foliageMerge && !input.fancy && !input.smooth ? new Uint8Array(16 * 16 * 16 * 6) : null;\n  // positions relative to the section origin");
patch('src/render/mesher.ts',
 "        const drawModel = (m: BakedModel) => {\n          const ao = useAO && m.ao;",
 [
 "        const drawModel = (m: BakedModel) => {",
 "          const ao = useAO && m.ao;",
 "          // Only six fully cullable, axis-aligned cube faces are eligible.",
 "          // Slabs, glass, animated objects and custom models stay unchanged.",
 "          const leafCube = !!foliageMask && !!(f & F_LEAVES) &&",
 "            m.quads.length === 6 && m.quads.every(q =>",
 "              q.full && q.flush && q.aligned && q.cull === q.dir);",
 "          const faceIndex = (cx:number,cy:number,cz:number,dir:number) =>",
 "            (((cy * 16 + cz) * 16 + cx) * 6 + dir);"
 ].join('\n'));
patch('src/render/mesher.ts',
 "              if (occludes(st, n, q.cull)) continue;\n            }\n            emitQuad(w, q, x, y, z, ox, oy, oz, tint, ao, 255, i);",
 [
 "              if (occludes(st, n, q.cull)) continue;",
 "            }",
 "            if (leafCube && q.cull >= 0) {",
 "              const dir=q.cull;",
 "              if (foliageMask![faceIndex(x,y,z,dir)]) continue;",
 "              const faceLight=flatLight(pidx(x+DX[dir],y+DY[dir],z+DZ[dir]));",
 "              const valid=(cx:number,cy:number,cz:number):boolean=>{",
 "                if(cx<0||cx>=16||cy<0||cy>=16||cz<0||cz>=16)return false;",
 "                if(foliageMask![faceIndex(cx,cy,cz,dir)])return false;",
 "                if(blocks[pidx(cx,cy,cz)]!==st)return false;",
 "                const ni=pidx(cx+DX[dir],cy+DY[dir],cz+DZ[dir]);",
 "                if(occludes(st,blocks[ni],dir)||flatLight(ni)!==faceLight)return false;",
 "                return tintFor(st,(cz+PAD)*PS+(cx+PAD),cy)===tint;",
 "              };",
 "              const mark=(cx:number,cy:number,cz:number):void=>{",
 "                foliageMask![faceIndex(cx,cy,cz,dir)]=1;",
 "              };",
 "              const rect=mergeFoliageFace(x,y,z,dir,valid,mark);",
 "              if(rect.width>1||rect.height>1){",
 "                const pos=new Float32Array(q.pos);",
 "                for(let k=0;k<4;k++){",
 "                  const pu=k*3+rect.axisU,pv=k*3+rect.axisV;",
 "                  if(pos[pu]>0.5)pos[pu]+=rect.width-1;",
 "                  if(pos[pv]>0.5)pos[pv]+=rect.height-1;",
 "                }",
 "                // UVs stretch over at most 2 leaves. No atlas bleeding.",
 "                emitQuad(w,{...q,pos},x,y,z,ox,oy,oz,tint,false,255,i);",
 "                continue;",
 "              }",
 "            }",
 "            emitQuad(w, q, x, y, z, ox, oy, oz, tint, ao, 255, i);"
 ].join('\n'));
patch('src/render/mesher.ts',
 "        if (!models) continue;\n        const b = BLOCKS[STATE_BLOCK[st]];",
 [
 "        if (!models) continue;",
 "        // Skip fully covered plain solid cubes without internal geometry.",
 "        // Require ALL six neighbor faces opaque: identical to the normal",
 "        // occlusion test, but avoids 6 model/tint/lighting/vertex calls.",
 "        if (input.foliageMerge && (f & F_OPAQUE) &&",
 "            !(f & (F_WATER | F_LAVA)) && models.variants.length===1 &&",
 "            !models.multipart && !models.randomParts &&",
 "            models.variants[0].quads.length===6 &&",
 "            models.variants[0].quads.every(q=>q.cull>=0 && q.full && q.flush) &&",
 "            [0,1,2,3,4,5].every(d=>{",
 "              const n=blocks[pidx(x+DX[d],y+DY[d],z+DZ[d])];",
 "              return !!((FACE_OCC[n] >> (d^1)) & 1);",
 "            }))continue;",
 "        const b = BLOCKS[STATE_BLOCK[st]];"
 ].join('\n'));
console.log('Family-only foliage mesher / covered-cube skip applied');
