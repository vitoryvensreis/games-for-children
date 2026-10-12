'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),url=require('node:url');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('V3 production uses original OpusCraft mesher; old experimental reducer is archived',()=>{
 const patch=read('ops/patch-opuscraft-mesh.mjs'),build=read('ops/build-opuscraft.sh');
 assert.doesNotMatch(build,/node "\$REPO_ROOT\/ops\/patch-opuscraft-mesh\.mjs"/);
 assert.doesNotMatch(build,/cp "\$REPO_ROOT\/ops\/gfc-leaf-merge\.ts"/);
 assert.match(patch,/foliageMerge/);
 // Historical mesher tests stay available for analysis, but its code must
 // never enter production while diagnosing blank/wrong voxel geometry.
});
test('Greedy leaf faces group a 2x2 shell without missing or duplicating faces',async()=>{
 const {mergeFoliageFace}=await import(url.pathToFileURL(path.join(__dirname,'..','ops/gfc-leaf-merge.ts')).href);
 const covered=new Set(),can=(x,y,z)=>x>=4&&x<=5&&y===8&&z>=3&&z<=4&&!covered.has(x+','+y+','+z);
 const mark=(x,y,z)=>{const k=x+','+y+','+z;assert.ok(!covered.has(k),'duplicate face '+k);covered.add(k)};
 const a=mergeFoliageFace(4,8,3,1,can,mark);
 assert.deepEqual([a.width,a.height,a.axisU,a.axisV],[2,2,0,2]);
 assert.equal(covered.size,4);
 for(const k of ['4,8,3','4,8,4','5,8,3','5,8,4'])assert.ok(covered.has(k));
});
test('Greedy leaf masks respect boundaries, direction and dissimilar material or lighting',async()=>{
 const {mergeFoliageFace}=await import(url.pathToFileURL(path.join(__dirname,'..','ops/gfc-leaf-merge.ts')).href);
 let visited=0;
 const corner=mergeFoliageFace(15,15,15,3,()=>true,()=>visited++);
 assert.equal(corner.width,1);assert.equal(corner.height,1);assert.equal(visited,1);
 const marked=[];
 const blocked=(x,y,z)=>x===2&&z===2&&y===10;
 const face=mergeFoliageFace(2,10,2,4,blocked,(x,y,z)=>marked.push([x,y,z]));
 assert.equal(face.width,1);
 assert.equal(face.height,1);
 assert.deepEqual(marked,[[2,10,2]]);
 assert.throws(()=>mergeFoliageFace(-1,2,3,1,()=>true,()=>{}));
});
