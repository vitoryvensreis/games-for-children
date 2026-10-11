'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {normalizeAction,fallbackAction,parseAction,decide}=require('../ops/opuscraft-npc-brain.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('GroqCloud is constrained to four non-destructive actions',async()=>{
 assert.equal(normalizeAction('build'),'build');
 assert.equal(normalizeAction('remove_blocks'),null);
 assert.equal(parseAction('{"action":"hide"}'),'hide');
 assert.equal(parseAction('{"action":"delete_everything"}'),null);
 const local=await decide({playersNearby:2},0,{key:''});
 assert.deepEqual(local,{action:'build',source:'local',configured:false});
 assert.equal(fallbackAction(2),'explore');
 const groq=await decide({playersNearby:1},12,{key:'test',fetcher:async(url,opt)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(opt.headers.Authorization,'Bearer test');
  assert.ok(!opt.body.includes('KID_'));
  const payload=JSON.parse(opt.body);
  assert.equal(payload.model,'openai/gpt-oss-20b');
  assert.equal(payload.response_format.json_schema.strict,true);
  assert.deepEqual(payload.response_format.json_schema.schema.properties.action.enum,['build','explore','hide','observe']);
  return {ok:true,json:async()=>({choices:[{message:{content:'{"action":"observe"}'}}]})};
 }});
 assert.equal(groq.action,'observe');
 assert.equal(groq.source,'groq');
 const rejected=await decide({},3,{key:'test',fetcher:async()=>({
  ok:true,json:async()=>({choices:[{message:{content:'{"action":"destroy"}'}}]})
 })});
 assert.equal(rejected.source,'local');
});
test('Agent changes only empty blocks at a fixed small blueprint and builds in existing family world',()=>{
 const agent=read('ops/gfc-npc.ts'),patch=read('ops/patch-opuscraft.mjs'),build=read('ops/build-opuscraft.sh');
 assert.match(agent,/if\(old!==0\)return/);
 assert.match(agent,/game\.level\.setBlock\(x,y,z,S\(block\.block\)\)/);
 assert.match(agent,/Math\.abs\(fy-y\)>1/);
 assert.match(agent,/Math\.random\(\)<0\.12/);
 assert.match(agent,/ENCOUNTER_COOLDOWN/);
 assert.match(patch,/installGfcNpc\(game\)/);
 assert.match(patch,/game\.opts\.username = 'Andarilha'/);
 assert.match(patch,/getWorldMeta\(id\)/);
 assert.match(build,/cp "\$REPO_ROOT\/ops\/gfc-npc\.ts" src\/gfc-npc\.ts/);
});

test('Agent keeps roaming safely if no buildable plot exists',()=>{
 const agent=read('ops/gfc-npc.ts');
 // The plot finder must include nearby and cardinal candidates, without overwriting blocks.
 assert.match(agent,/for\(const radius of \[12,16,20,24,32,40\]\)/);
 assert.match(agent,/function roam\(\):boolean/);
 assert.match(agent,/if\(!plot && action!=='observe'\)\{\s*\/\/[^\n]*\n\s*roam\(\)/);
 assert.match(agent,/distance\(x,z,start\.x,start\.z\)>16\)continue/);
 assert.match(agent,/kids\.some\(p=>distance\(p\.x,p\.z,x,z\)<18\)\)continue/);
 assert.match(agent,/if\(move\(x,z\)\)\{roamMoves\+\+;return true;/);
 assert.match(agent,/now-lastPlotSearch>=18000/);
 assert.match(agent,/for\(let checked=0;checked<4;checked\+\+\)/);
 assert.match(agent,/nextPlotCandidate\+\+%candidates\.length/);
 assert.match(agent,/plotSearchChecked:nextPlotCandidate/);
 assert.match(agent,/roamMoves,lastMoveOk/);
 assert.match(agent,/if\(old!==0\)return/);
});

test('NPC API and visit authorization are restricted to current administrator session',()=>{
 const server=read('server.cjs'),host=read('ops/opuscraft-host.cjs'),app=read('public/app.js');
 assert.match(server,/pathname==='\/api\/admin\/opuscraft\/npc\/visit'/);
 assert.match(server,/u\.role!=='admin'/);
 assert.match(server,/opusConnections\].some\(p=>p\.user\.id===u\.id/);
 assert.match(host,/url\.pathname==='\/__npc\/visit'/);
 assert.match(host,/\^ADM_/);
 assert.match(app,/me\?\.role==='admin'\?/);
 assert.match(app,/api\('admin\/opuscraft\/npc\/visit','POST'/);
});
