'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),url=require('node:url'),fs=require('node:fs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const load=()=>import(url.pathToFileURL(path.join(__dirname,'..','ops/gfc-adaptive-quality.ts')).href);
test('Mobile and desktop presets stay within bounded safe resolutions',async()=>{
 const {qualityPreset,FamilyAdaptiveQuality}=await load();
 assert.deepEqual(['auto','performance','balanced','quality'].map(x=>qualityPreset(x,true)),
  [0.52,0.44,0.56,0.68]);
 assert.deepEqual(['auto','performance','balanced','quality'].map(x=>qualityPreset(x,false)),
  [0.55,0.45,0.60,0.75]);
 for(const mobile of [true,false]){
  const changes=[],c=new FamilyAdaptiveQuality(mobile,mobile?24:30,x=>changes.push(x));
  assert.equal(c.status().mode,'auto');
  assert.equal(c.status().targetFps,mobile?24:30);
  assert.equal(c.setMode('quality',10000),true);
  assert.equal(c.status().scale,mobile?0.68:0.75);
  assert.equal(c.setMode('bad',10000),false);
  assert.equal(c.setMode('performance',14000),true);
  assert.equal(c.status().scale,mobile?0.44:0.45);
  assert.equal(changes.length,2);
  c.stop();
  assert.equal(c.setMode('auto',20000),false);
 }
});
test('Native OpusCraft mode restores full resolution independently on desktop and mobile',async()=>{
 const {FamilyAdaptiveQuality,qualityPreset}=await load();
 for(const mobile of [false,true]){
  const updates=[],q=new FamilyAdaptiveQuality(mobile,60,s=>updates.push(s));
  assert.equal(qualityPreset('original',mobile),1);
  assert.equal(q.setMode('original',1000),true);
  assert.equal(q.status().mode,'original');
  assert.equal(q.status().scale,1);
  for(let i=0;i<20;i++)q.sample(1500+i*3000,2,true,0,false);
  assert.equal(q.status().scale,1,'original must not downscale on transient FPS drops');
  q.setMode('performance',75000);
  assert.ok(q.status().scale<1);
  q.setMode('original',80000);
  assert.equal(q.status().scale,1);
  assert.ok(updates.includes(1));
 }
 const client=read('ops/gfc-family-client.ts'),patch=read('ops/patch-opuscraft.mjs');
 assert.match(client,/quality\.setMode\('original'\)/);
 assert.match(client,/gfc-family-native-view-distance-v1/);
 assert.doesNotMatch(patch,/CHUNKS_PER_TICK = 3/);
 assert.doesNotMatch(patch,/this\.ticks % 70 === 0/);
});

test('Auto drops only after repeated low FPS; recovers more slowly after sustained high FPS',async()=>{
 const {FamilyAdaptiveQuality}=await load();
 const changes=[],c=new FamilyAdaptiveQuality(false,30,x=>changes.push(x));
 const sample=(t,fps,queued=0,hidden=false,ready=true)=>c.sample(t,fps,ready,queued,hidden);
 sample(1000,10);sample(5000,10);sample(10000,17);sample(13000,16);
 assert.equal(c.status().scale,0.55);
 sample(16000,18);
 assert.equal(c.status().scale,0.51);
 assert.deepEqual(changes,[0.51]);
 for(const t of [19000,22000,25000,28000,31000])sample(t,30);
 assert.equal(c.status().scale,0.51);
 sample(34000,30);
 assert.equal(c.status().scale,0.54);
 assert.deepEqual(changes,[0.51,0.54]);
});
test('Streaming, hidden tabs and load do not trigger false downscaling',async()=>{
 const {FamilyAdaptiveQuality}=await load();
 const changes=[],c=new FamilyAdaptiveQuality(true,24,x=>changes.push(x));
 for(let i=0;i<12;i++)c.sample(10000+i*3000,5,true,15,false);
 assert.equal(c.status().scale,0.52);
 assert.match(c.status().pausedReason,/chunks/);
 for(let i=0;i<6;i++)c.sample(48000+i*3000,4,true,0,true);
 assert.equal(c.status().scale,0.52);
 for(let i=0;i<6;i++)c.sample(70000+i*3000,3,false,0,false);
 assert.equal(c.status().scale,0.52);
 assert.equal(changes.length,0);
});
test('Manual override is local to a session; auto restores; solo video stays separate',async()=>{
 const {FamilyAdaptiveQuality}=await load();
 const changes=[],c=new FamilyAdaptiveQuality(true,24,x=>changes.push(x));
 c.setMode('quality',10000);
 for(let i=1;i<=14;i++)c.sample(10000+i*3000,2);
 assert.equal(c.status().scale,0.68);
 c.setMode('auto',65000);
 assert.equal(c.status().scale,0.52);
 c.stop();
 const client=read('ops/gfc-family-client.ts'),patch=read('ops/patch-opuscraft.mjs'),ui=read('public/app.js');
 assert.match(client,/quality\.stop\(\)/);
 assert.match(client,/delete \(window as any\)\.__gfcQuality/);
 assert.match(client,/Object\.assign\(game\.opts,previous\)/);
 assert.match(patch,/__gfcQuality\?\.status\?\.\(\)\.scale/);
 assert.match(patch,/__gfcQuality\?\.sample\(performance\.now\(\), this\.fps/);
 assert.match(patch,/this\.mode === 'client'/);
 assert.match(ui,/id="opusQualityMode"/);
 assert.match(ui,/id="opusQualityStatus"/);
 assert.match(ui,/ctrl\?\.setMode\?\.\(qualityMode\.value\)/);
});
