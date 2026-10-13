'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createChunkDemand}=require('../ops/opuscraft-headless/chunk-demand.cjs');
test('bounded requests prioritize the player chunk and do not overwrite chunks',()=>{
 const loaded=new Set(),generated=[];
 const d=createChunkDemand({isLoaded:(x,z)=>loaded.has(x+','+z),
  generate:(x,z)=>{loaded.add(x+','+z);generated.push([x,z])},maxPending:9});
 assert.equal(d.requestAround(0,0,1),9);
 assert.equal(d.requestAround(0,0,1),0);
 assert.equal(d.stats().pending,9);
 assert.equal(d.pump(),true);
 assert.deepEqual(generated,[[0,0]]);
 assert.equal(d.stats().pending,8);
 assert.equal(d.requestAround(0,0,1),0);
 assert.throws(()=>d.requestAround(NaN,0),/Invalid/);
});
test('failed generation remains pending rather than silently deleting a request',()=>{
 const d=createChunkDemand({isLoaded:()=>false,generate:()=>{throw Error('generate failed')}});
 d.requestAround(-1,-1,0);
 assert.throws(()=>d.pump(),/generate failed/);
 assert.equal(d.stats().pending,1);
});
