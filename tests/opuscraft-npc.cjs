'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {decide,parsePlan,localPlan,KINDS,STYLES}=require('../ops/opuscraft-npc-brain.cjs');
test('Gemini chooses exactly one validated project and sends no arbitrary execution commands',async()=>{
 assert.ok(KINDS.includes('village'));
 assert.ok(KINDS.includes('castle'));
 assert.ok(KINDS.includes('cave'));
 assert.ok(KINDS.includes('portal'));
 assert.equal(parsePlan('{"kind":"destroy","style":"stone","title":"x"}'),null);
 assert.equal(parsePlan('{"kind":"castle","style":"stone","title":"Castelo","reason":"Novo marco"}').kind,'castle');
 let calls=0;
 const chosen=await decide({completed:[{kind:'castle',title:'Obra concluída'}],numberCompleted:1},0,{
  key:'UNIT_TEST_KEY',fetcher:async(url,opt)=>{
   calls++;
   assert.match(url,/generativelanguage.googleapis.com\/v1beta\/models\/gemini-3.5-flash-lite:generateContent/);
   assert.equal(opt.headers['x-goog-api-key'],'UNIT_TEST_KEY');
   const body=JSON.parse(opt.body);
   assert.equal(body.generationConfig.responseMimeType,'application/json');
   assert.deepEqual(body.generationConfig.responseSchema.required,['kind','style','title','reason']);
   assert.equal(body.contents[0].parts[0].text.includes('UNIT_TEST_KEY'),false);
   return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({
    kind:'windmill',style:'medieval',title:'Moinho do Vale',reason:'Nova paisagem'
   })}]}}]})};
  }});
 assert.equal(calls,1);
 assert.equal(chosen.source,'gemini');
 assert.equal(chosen.kind,'windmill');
 assert.equal(chosen.title,'Moinho do Vale');
});
test('Gemini failure yields a single safe local idea, without API secrets',async()=>{
 const output=await decide({completed:[]},0,{key:'SENSITIVE',fetcher:async()=>({
  ok:false,status:429,json:async()=>({error:{status:'RESOURCE_EXHAUSTED',message:'confidential'}})
 })});
 assert.equal(output.source,'local');
 assert.equal(output.configured,true);
 assert.ok(!JSON.stringify(output).includes('SENSITIVE'));
 assert.ok(!JSON.stringify(output).includes('confidential'));
 assert.ok(KINDS.includes(output.kind));
 assert.ok(STYLES.includes(output.style));
 assert.ok(KINDS.includes(localPlan({completed:[]}).kind));
});
test('Game registers only one architect with real block-by-block world changes',()=>{
 const agent=read('ops/gfc-npc.ts'),host=read('ops/opuscraft-host.cjs'),
  patch=read('ops/patch-opuscraft.mjs'),build=read('ops/build-opuscraft.sh');
 assert.match(agent,/function createProject\(data:any\)/);
 assert.match(agent,/if\(project\|\|queue\)return false/);
 assert.match(agent,/game\.level\.setBlock\(x,y,z,desired\)/);
 assert.match(agent,/p\.cursor\+\+/);
 assert.match(agent,/if\(!allowed\)/);
 assert.match(agent,/project=null;lastReason='project_completed'/);
 assert.match(agent,/game\.level\.world\.isLoaded\(x,z\)/);
 assert.match(agent,/function safeSite\(/);
 assert.match(agent,/function safeSiteForWork\(/);
 assert.match(patch,/installGfcNpc\(game\)/);
 assert.match(build,/cp "\$REPO_ROOT\/ops\/gfc-npc\.ts" src\/gfc-npc\.ts/);
 assert.match(host,/npcTimer=setInterval\(\(\)=>void tickNpc\(\),1000\)/);
 assert.match(host,/!status\.project&&!status\.nextProjectQueued/);
 assert.match(host,/NPC_QUESTION/);
 assert.match(host,/NPC_DECISION/);
 assert.match(host,/NPC_STEP/);
 assert.match(host,/userDataDir:PROFILE/);
});
test('Administrator may visit the active project; children cannot invoke visit',()=>{
 const server=read('server.cjs'),agent=read('ops/gfc-npc.ts'),app=read('public/app.js');
 assert.match(agent,/\^ADM_/);
 assert.match(agent,/s\.teleportTo\(/);
 assert.match(server,/pathname==='\/api\/admin\/opuscraft\/npc\/visit'/);
 assert.match(server,/if\(u\.role!=='admin'\)/);
 assert.match(app,/api\('admin\/opuscraft\/npc\/visit','POST'/);
});
