'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {limitedLife}=require('../database/store.cjs');
const {sanitizeNpcAudit}=require('../database/npc-audit.cjs');
test('Safe clearing is restricted to natural terrain and avoids existing structures',()=>{
 const agent=read('ops/gfc-npc.ts');
 assert.match(agent,/const NATURAL=/);
 assert.match(agent,/const DIGGABLE=/);
 assert.match(agent,/safeSite\(x,y,z,r\)/);
 assert.match(agent,/if\(!NATURAL\.test\(n\)\)return false/);
 assert.match(agent,/if\(!allowed\)/);
 assert.match(agent,/p\.state='blocked'/);
 assert.match(agent,/blockedReason='protected_or_unknown_block:'/);
 assert.match(agent,/nearby_construction_detected/);
 assert.match(agent,/guestNear\(p\.x,p\.z,siteSizes\[p\.kind\]\+5\)/);
 assert.match(agent,/if\(distance\(x,z,start\.x,start\.z\)<44\)return false/);
 assert.match(agent,/for\(let dx=-r-3;dx<=r\+3;dx\+\+\)/);
 assert.match(agent,/if\(task\.name==='air'\&\&name==='air'\)/);
 assert.doesNotMatch(agent,/dropWorld|deleteWorld|removeWorld|resetWorld/);
});
test('Construction memory persists project cursor and completed sites separately from world IndexedDB',()=>{
 const state={version:2,role:'world_architect',
  project:{kind:'castle',style:'stone',title:'Castelo',reason:'Muralhas',x:200,y:69,z:55,
   cursor:127,placed:80,skipped:12,startedAt:5000,state:'building',blockedReason:''},
  queue:null,completed:[{kind:'windmill',title:'Moinho',x:180,y:70,z:24,placed:220}],
  placedTotal:300,searchCursor:12,blockedSites:[],apiKey:'SECRET'};
 const safe=limitedLife(state);
 assert.equal(safe.version,2);
 assert.equal(safe.project.cursor,127);
 assert.equal(safe.completed[0].kind,'windmill');
 assert.equal(safe.completed[0].x,180);
 assert.equal(safe.apiKey,undefined);
 assert.ok(!JSON.stringify(safe).includes('SECRET'));
 assert.equal(limitedLife({...state,project:{...state.project,kind:'destroy_everything'}}).project,null);
 const db=read('database/store.cjs'),host=read('ops/opuscraft-host.cjs');
 assert.match(db,/gfc_npc_life_state/);
 assert.match(db,/renameSync\(tmp,file\)/);
 assert.match(host,/publishLife\(result\.life\)/);
 assert.match(host,/NPC_MEMORY_RESTORE/);
 assert.match(host,/userDataDir:PROFILE/);
});
test('Audit stores sanitized Gemini model and blueprint progress, not user or key information',()=>{
 const item=sanitizeNpcAudit({type:'decision',source:'gemini',action:'build',details:{
  project:'castle',goal:'Construir um castelo',reason:'Expandir região',accepted:true,
  key:'SECRET',name:'KID_ABC'}});
 assert.equal(item.source,'gemini');
 assert.equal(item.details.project,'castle');
 assert.equal(item.details.accepted,true);
 assert.ok(!JSON.stringify(item).includes('SECRET'));
 assert.ok(!JSON.stringify(item).includes('KID_ABC'));
 const store=read('database/store.cjs'),ui=read('public/app.js');
 assert.match(store,/\['gemini','groq','local'\]/);
 assert.match(ui,/Andarilha — Arquiteta do Universo/);
 assert.match(ui,/npc\.project\.progress/);
});
