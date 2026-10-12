'use strict';
// Real Chromium WebGL2 host regression check (CI only, localhost-only endpoint).
// A headless host must tick the world/network without creating new GPU meshes.
const assert=require('node:assert/strict');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function read(){
 const res=await fetch('http://127.0.0.1:4173/__debug',{signal:AbortSignal.timeout(7000)});
 assert.equal(res.status,200,'private host diagnostics unavailable');
 return res.json();
}
(async()=>{
 const first=await read();
 assert.equal(first.mode,'host','server left host mode');
 assert.equal(first.spawned,true,'world not spawned');
 assert.equal(first.cpuMode,true,'headless VPS optimization is not active');
 assert.equal(first.world?.id,'gamesnavagador-family-world-v2');
 assert.ok(first.loadedChunks>0,'terrain chunks not loaded');
 assert.ok(Number.isFinite(first.meshedSections));
 const start=Number(first.hostTicks||0),mesh=Number(first.meshedSections);
 await sleep(1600);
 const second=await read();
 assert.equal(second.cpuMode,true,'CPU mode switched off');
 assert.ok(Number(second.hostTicks)>start,
  'authoritative 20Hz server ticks stopped while skipping GPU work');
 assert.equal(second.meshedSections,mesh,
  'headless server is still processing unnecessary GPU meshes');
 console.log('OPUSCRAFT_VPS_SIMULATION_ONLY_OK '+JSON.stringify({
  ticksAdvanced:second.hostTicks-start,hostMeshesUnchanged:mesh,
  chunkCount:second.loadedChunks,pendingChunks:second.pendingChunks
 }));
})().catch(error=>{console.error(error);process.exitCode=1});
