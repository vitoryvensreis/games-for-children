'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {HeadlessTicker,TICK_MS}=require('../ops/opuscraft-headless/ticker.cjs');
function fakeClock(){
 let time=0,id=0;
 const tasks=new Map();
 return {now:()=>time,schedule:(fn,delay)=>{const n=++id;tasks.set(n,{fn,at:time+delay});return n},
  cancel:n=>tasks.delete(n),advance:ms=>{time+=ms;let n=0;
   while(n++<20){const due=[...tasks].find(([,v])=>v.at<=time);if(!due)break;
    tasks.delete(due[0]);due[1].fn();}},pending:()=>tasks.size};
}
test('scheduler ticks every 50 ms and saves when stopped',()=>{
 const c=fakeClock();let ticks=0,saves=0;
 const t=new HeadlessTicker({tick:()=>ticks++,save:()=>saves++,now:c.now,schedule:c.schedule,cancel:c.cancel});
 assert.equal(TICK_MS,50);assert.equal(t.start(),true);assert.equal(t.start(),false);
 c.advance(50);assert.equal(ticks,1);
 c.advance(50);assert.equal(ticks,2);
 assert.equal(t.stop(),true);assert.equal(saves,1);assert.equal(c.pending(),0);
 assert.equal(t.stop(),false);
});
test('stall does not execute unbounded catch-up ticks',()=>{
 const c=fakeClock();let ticks=0;
 const t=new HeadlessTicker({tick:()=>ticks++,now:c.now,schedule:c.schedule,cancel:c.cancel});
 t.start();c.advance(10000);assert.equal(ticks,1);
 c.advance(50);assert.equal(ticks,2);t.stop();
});
test('fatal tick error stops scheduler and attempts snapshot',()=>{
 const c=fakeClock();let saves=0,errors=0;
 const t=new HeadlessTicker({tick:()=>{throw Error('bad tick')},save:()=>saves++,
  onError:()=>errors++,now:c.now,schedule:c.schedule,cancel:c.cancel});
 t.start();c.advance(50);
 assert.equal(t.status().running,false);assert.equal(saves,1);assert.equal(errors,1);
 assert.equal(c.pending(),0);
});
