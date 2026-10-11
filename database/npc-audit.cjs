'use strict';
// Internal IPC contract. Never accept player names, authentication data or raw LLM payloads.
function sanitizeNpcAudit(raw){
 if(!raw||typeof raw!=='object')return null;
 const types=['question','decision','step','error'];
 if(!types.includes(raw.type))return null;
 const text=(v,max=220)=>typeof v==='string'?v.slice(0,max):'';
 const number=(v,max=100000)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.round(v))):0;
 const source=['groq','local'].includes(raw.source)?raw.source:null;
 const action=['build','explore','hide','observe'].includes(raw.action)?raw.action:null;
 const d=raw.details&&typeof raw.details==='object'&&!Array.isArray(raw.details)?raw.details:{};
 let details={};
 if(raw.type==='question')details={
  number:number(d.number),model:text(d.model,100),system:text(d.system,1200),
  input:{playersNearby:number(d.input?.playersNearby,8),blocksBuilt:number(d.input?.blocksBuilt,120),
   hasVisitors:Boolean(d.input?.hasVisitors),
   underwater:Boolean(d.input?.underwater),
   currentGoal:text(d.input?.currentGoal,90),
   needs:Object.fromEntries(['hunger','thirst','energy','oxygen','temperature','health'].map(k=>
    [k,number(d.input?.needs?.[k],100)]))}
 };
 if(raw.type==='decision')details={number:number(d.number),configured:Boolean(d.configured),error:text(d.error,150)||null,goal:text(d.goal,90),reason:text(d.reason,160)};
 if(raw.type==='step')details={
  step:number(d.step),built:number(d.built,10000),cursor:number(d.cursor,10000),
  reason:text(d.reason,50),visitors:number(d.visitors,30),
  health:number(d.health,20),oxygen:number(d.oxygen),thirst:number(d.thirst),hunger:number(d.hunger),goal:text(d.goal,90)
 };
 if(raw.type==='error')details={reason:text(d.reason,150)};
 return {type:raw.type,action,source,details};
}
module.exports={sanitizeNpcAudit};
