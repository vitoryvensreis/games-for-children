'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {HeadlessWorld,chunkKey}=require('../ops/opuscraft-headless/world.cjs');
function withWorld(fn){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'opus-headless-'));
 try{return fn(directory)}finally{fs.rmSync(directory,{recursive:true,force:true})}
}
test('world persists block edits and revision between process instances',()=>withWorld(directory=>{
 const a=new HeadlessWorld({directory,seed:123}).load();
 assert.equal(a.status().revision,0);
 a.applyBlock('player-1',{x:0,y:64,z:0,block:7});
 assert.equal(a.flush(),true);
 const b=new HeadlessWorld({directory,seed:999}).load();
 assert.equal(b.status().seed,123);
 assert.equal(b.getChunk(0,0).blocks[0].block,7);
 assert.equal(b.status().revision,1);
}));
test('negative coordinates belong to correct chunks',()=>{
 assert.equal(chunkKey(-1,-16),'-1,-1');
 assert.equal(chunkKey(16,0),'1,0');
});
test('invalid input is rejected without mutation',()=>withWorld(directory=>{
 const w=new HeadlessWorld({directory}).load();
 assert.throws(()=>w.applyBlock('p',{x:0.5,y:2,z:0,block:1}));
 assert.throws(()=>w.applyBlock('p',{x:0,y:2,z:0,block:-1}));
 assert.equal(w.status().revision,0);
}));
test('corrupt snapshot never resets a world silently',()=>withWorld(directory=>{
 fs.writeFileSync(path.join(directory,'world.json'),'not valid json');
 assert.throws(()=>new HeadlessWorld({directory}).load());
 assert.equal(fs.readFileSync(path.join(directory,'world.json'),'utf8'),'not valid json');
}));
test('no browser runtime or rendering dependency',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../ops/opuscraft-headless/world.cjs'),'utf8');
 assert.doesNotMatch(code,/require\(['"](?:puppeteer|playwright|@sparticuz)/);
 assert.doesNotMatch(code,/document\.|window\.|WebGLRenderingContext/);
});
