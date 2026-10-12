'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const test=require('node:test');
test('Dedicated VPS host stops unseen meshes but keeps chunk generation and lighting',()=>{
 const p=read('ops/patch-opuscraft-host-cpu.mjs');
 assert.match(p,/__gfcDedicatedHost = true/);
 assert.match(p,/this\.chunks\.dedicatedHeadlessHost =/);
 assert.match(p,/this\.mode === 'host' && this\.spawned/);
 assert.match(p,/this\.meshList = \[\]/);
 assert.match(p,/this\.pool\.pump\(\)/);
 assert.match(p,/this\.dedicatedHeadlessHost \? null : this\.nextMeshJob\(\)/);
 assert.match(p,/!this\.dedicatedHeadlessHost && dx \* dx/);
 assert.match(p,/if \(\(window as any\)\.__gfcDedicatedHost === true\) return 2/);
 assert.doesNotMatch(p,/client\.receive|client\.sendTick|deleteWorld|removeChunk|setBlock/);
});
test('No simulation rate changes or network shortcuts, no skipped autosaves',()=>{
 const p=read('ops/patch-opuscraft-host-cpu.mjs');
 assert.match(p,/if \(\+\+this\.autosaveTimer >= 6000\)/);
 assert.match(p,/void this\.saveWorld\(\)/);
 assert.match(p,/if \(this\.chunks\.dedicatedHeadlessHost\)/);
 assert.doesNotMatch(p,/setTimeout|setInterval|TIMEOUT_TICKS|doDaylightCycle|randomTicks\.tickAround|server\?\.tick\(\)/);
 const build=read('ops/build-opuscraft.sh');
 assert.match(build,/patch-opuscraft-host-cpu\.mjs/);
 assert.ok(build.indexOf('patch-opuscraft-mesh.mjs')<build.indexOf('patch-opuscraft-host-cpu.mjs'));
});
test('Host mode diagnostic is private; ADM distinguishes CPU mode from device FPS',()=>{
 const host=read('ops/opuscraft-host.cjs'),npc=read('ops/gfc-npc.ts'),
  ui=read('public/app.js');
 assert.match(host,/url\.pathname==='\/__debug'/);
 assert.match(host,/cpuMode:g\?\.chunks\?\.dedicatedHeadlessHost===true/);
 assert.match(host,/meshedSections:g\?\.chunks\?\.stats\?\.meshes/);
 assert.match(npc,/simulationOnly:game\.chunks\.dedicatedHeadlessHost===true/);
 assert.match(npc,/workerMaxConcurrent:game\.pool\?\.maxInflight/);
 assert.match(ui,/m\.simulationOnly\?'Somente simulação/);
 assert.match(ui,/npc\.performance\.simulationOnly\?'Somente simulação/);
});
