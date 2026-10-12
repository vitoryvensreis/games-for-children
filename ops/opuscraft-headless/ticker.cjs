'use strict';
/**
 * Node-only deterministic tick scheduler for an eventual upstream Level host.
 * Inject the adapter, never import browser Game/Renderer here. Experimental.
 */
const {performance}=require('node:perf_hooks');
const TICK_MS=50;
class HeadlessTicker{
 constructor({tick,save=()=>{},now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onError=()=>{}}={}){
  if(typeof tick!=='function'||typeof save!=='function')throw Error('tick/save callbacks required');
  this.tick=tick;this.save=save;this.now=now;this.schedule=schedule;this.cancel=cancel;this.onError=onError;
  this.running=false;this.handle=null;this.next=0;this.ticks=0;this.overruns=0;this.lastError=null;
 }
 start(){
  if(this.running)return false;
  this.running=true;this.next=this.now()+TICK_MS;this._queue();return true;
 }
 _queue(){
  if(!this.running)return;
  this.handle=this.schedule(()=>this._pump(),Math.max(0,this.next-this.now()));
  this.handle?.unref?.();
 }
 _pump(){
  if(!this.running)return;
  this.handle=null;
  const started=this.now();
  try{this.tick();this.ticks++}
  catch(error){
   this.lastError=error;this.running=false;
   try{this.onError(error)}finally{this._save()}return;
  }
  if(this.now()-started>TICK_MS)this.overruns++;
  // Skip backlog after CPU stalls; never execute unbounded catch-up ticks.
  this.next=Math.max(this.next+TICK_MS,this.now()+1);
  this._queue();
 }
 _save(){
  try{this.save()}catch(err){this.lastError=err;this.onError(err)}
 }
 stop(){
  if(!this.running)return false;
  this.running=false;
  if(this.handle!==null)this.cancel(this.handle);
  this.handle=null;this._save();return true;
 }
 status(){return {running:this.running,ticks:this.ticks,overruns:this.overruns,
  lastError:this.lastError?String(this.lastError.message||this.lastError):null}}
}
module.exports={HeadlessTicker,TICK_MS};
