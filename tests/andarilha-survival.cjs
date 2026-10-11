'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {fallbackAction,contextForModel,decide}=require('../ops/opuscraft-npc-brain.cjs');
const {limitedLife}=require('../database/store.cjs');

test('urgent needs prioritize life without predefined house, job or story',()=>{
 assert.equal(fallbackAction(0,{needs:{oxygen:10}}),'surface');
 assert.equal(fallbackAction(0,{needs:{oxygen:90,thirst:10}}),'seek_water');
 assert.equal(fallbackAction(0,{needs:{oxygen:90,thirst:80,hunger:10}}),'seek_food');
 assert.equal(fallbackAction(0,{needs:{oxygen:90,thirst:80,hunger:80,energy:8}}),'rest');
 assert.equal(fallbackAction(0,{needs:{oxygen:90,thirst:80,hunger:80,energy:80,temperature:6}}),'warm_up');
 assert.equal(fallbackAction(0,{needs:{oxygen:90,thirst:80,hunger:80,energy:80,temperature:41}}),'cool_down');
 const source=read('ops/opuscraft-npc-brain.cjs');
 assert.match(source,/nasceu sem história, missão, casa predeterminada ou projeto obrigatório/);
 assert.match(source,/Seu único motivo inicial é continuar viva/);
 assert.doesNotMatch(source,/Dê preferência a construir uma casinha/);
});
test('Groq never receives credentials or child identifiers from world context',async()=>{
 const payload=contextForModel({needs:{oxygen:20,hunger:30},currentGoal:'survive',
  memories:[{kind:'air',detail:'Fiquei submersa'}],
  discoveries:[{x:4,z:5,kind:'water'}],playersNearby:2,
  username:'KID_NAME',GROQ_API_KEY:'SECRET'});
 assert.equal(payload.needs.oxygen,20);
 assert.equal(payload.experiences[0].kind,'air');
 assert.equal(payload.discoveries[0].kind,'water');
 assert.ok(!JSON.stringify(payload).includes('KID_NAME'));
 assert.ok(!JSON.stringify(payload).includes('SECRET'));
 assert.ok(!JSON.stringify(payload).includes('"x"'));
 const out=await decide(payload,0,{key:'',model:'example'});
 assert.equal(out.action,'surface');
});
test('oxygen drops only while head submerged, damages gradually and triggers surfacing',()=>{
 const agent=read('ops/gfc-npc.ts'),host=read('ops/opuscraft-host.cjs');
 assert.match(agent,/resident\.isUnderWater\(\)/);
 assert.match(agent,/vitals\.oxygen=clip\(vitals\.oxygen-7\)/);
 assert.match(agent,/vitals\.health=clip\(vitals\.health-1,0,20\)/);
 assert.match(agent,/vitals\.oxygen=clip\(vitals\.oxygen\+24\)/);
 assert.match(agent,/if\(vitals\.oxygen<35&&resident\.isUnderWater\(\)\)/);
 assert.match(agent,/resident\.input\.jump=true/);
 assert.match(agent,/resident\.moveTo\(safe\.x,safe\.y,safe\.z\)/);
 assert.match(host,/status\.underwater&&status\.needs\?\.oxygen<40\?'surface'/);
});
test('only NPC changes: preserve player world and learn without conjuring food or resources',()=>{
 const agent=read('ops/gfc-npc.ts'),host=read('ops/opuscraft-host.cjs');
 assert.match(agent,/stack\.item\.food/);
 assert.match(agent,/resident\.inventory\.setSlot\(/);
 assert.match(agent,/if\(game\.level\.getState\(x,y,z\)!==0\)/);
 assert.match(agent,/lifeSnapshot,restoreLife,setGoal/);
 assert.match(host,/publishLife\(result\.life\)/);
 assert.match(host,/NPC_MEMORY_RESTORE/);
 assert.match(host,/userDataDir:PROFILE/);
 assert.doesNotMatch(host,/rmSync\(PROFILE/);
});
test('NPC memory is bounded, sanitized and independent from game_state and world IndexedDB',()=>{
 const migration=read('database/migrations/003_npc_life_state.sql');
 const store=read('database/store.cjs');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS gfc_npc_life_state/);
 assert.doesNotMatch(migration,/DROP|DELETE|UPDATE game_state/);
 const raw={version:1,vitals:{hunger:55,thirst:20,energy:75,oxygen:10,temperature:17,health:12},
  currentGoal:'Encontrar água',goalReason:'Sede',livedSeconds:500,deaths:1,
  experiences:Array.from({length:80},()=>({kind:'test',detail:'record',at:4})),
  discoveries:Array.from({length:50},()=>({x:0,z:0,kind:'water'})),
  safe:{x:10,y:66,z:20},token:'NEVER_SAVE',playerName:'KID_PRIVATE'};
 const safe=limitedLife(raw);
 assert.equal(safe.experiences.length,25);
 assert.equal(safe.discoveries.length,12);
 assert.equal(safe.vitals.oxygen,10);
 assert.equal(safe.deaths,1);
 assert.ok(!JSON.stringify(safe).includes('NEVER_SAVE'));
 assert.ok(!JSON.stringify(safe).includes('KID_PRIVATE'));
 assert.match(store,/gfc_npc_life_state/);
 assert.match(store,/renameSync\(tmp,file\)/);
});
