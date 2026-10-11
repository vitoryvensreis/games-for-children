'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {normalizeAction,fallbackAction,parseAction,decide}=require('../ops/opuscraft-npc-brain.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Groq plans survival goals with bounded safe actions and no private player data',async()=>{
 assert.equal(normalizeAction('seek_water'),'seek_water');
 assert.equal(normalizeAction('surface'),'surface');
 assert.equal(normalizeAction('remove_blocks'),null);
 assert.equal(parseAction('{"action":"hide","goal":"stay alive","reason":"avoid danger"}'),'hide');
 assert.equal(parseAction('{"action":"delete_everything"}'),null);
 const local=await decide({needs:{oxygen:18}},0,{key:''});
 assert.equal(local.action,'surface');
 assert.equal(local.source,'local');
 assert.equal(local.configured,false);
 assert.equal(fallbackAction(2),'explore');
 const groq=await decide({playersNearby:1,needs:{oxygen:90,thirst:55},
  currentGoal:'continuar viva',memories:[{kind:'water',detail:'encontrei um rio'}]},12,
  {key:'test',fetcher:async(url,opt)=>{
   assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
   assert.equal(opt.headers.Authorization,'Bearer test');
   assert.ok(!opt.body.includes('KID_'));
   const payload=JSON.parse(opt.body);
   assert.equal(payload.model,'openai/gpt-oss-20b');
   assert.equal(payload.response_format.json_schema.strict,true);
   assert.ok(payload.response_format.json_schema.schema.properties.action.enum.includes('surface'));
   assert.ok(payload.messages[1].content.includes('oxygen'));
   return {ok:true,json:async()=>({choices:[{message:{content:'{"action":"seek_water","goal":"Encontrar água","reason":"Tenho sede"}'}}]})};
  }});
 assert.equal(groq.action,'seek_water');
 assert.equal(groq.goal,'Encontrar água');
 assert.equal(groq.reason,'Tenho sede');
 assert.equal(groq.source,'groq');
 const rejected=await decide({},3,{key:'test',fetcher:async()=>({
  ok:true,json:async()=>({choices:[{message:{content:'{"action":"destroy"}'}}]})
 })});
 assert.equal(rejected.source,'local');
});

test('Agent changes only empty blocks at a fixed small blueprint and builds in existing family world',()=>{
 const agent=read('ops/gfc-npc.ts'),patch=read('ops/patch-opuscraft.mjs'),build=read('ops/build-opuscraft.sh');
 assert.match(agent,/game\.level\.getState\(x,y,z\)!==0/);
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
 assert.match(agent,/\['explore','hide','seek_food','seek_shelter'\]\.includes\(action\)/);
 assert.match(agent,/distance\(x,z,anchor\.x,anchor\.z\)>16\)continue/);
 assert.match(agent,/kids\.some\(p=>distance\(p\.x,p\.z,x,z\)<18\)\)continue/);
 assert.match(agent,/if\(move\(x,z\)\)\{roamMoves\+\+;return true;/);
 assert.match(agent,/now-lastPlotSearch>=18000/);
 assert.match(agent,/for\(let checked=0;checked<4;checked\+\+\)/);
 assert.match(agent,/nextPlotCandidate\+\+%candidates\.length/);
 assert.match(agent,/plotSearchChecked:nextPlotCandidate/);
 assert.match(agent,/roamMoves,lastMoveOk/);
 assert.match(agent,/game\.level\.getState\(x,y,z\)!==0/);
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

test('Headless host refreshes OpusCraft code after deploy but retains family IndexedDB',()=>{
 const host=read('ops/opuscraft-host.cjs');
 const build=read('ops/build-opuscraft.sh');
 assert.ok(build.includes('GFC-BUILD-ID.txt'));
 assert.ok(host.includes("relative==='index.html'||relative==='GFC-BUILD-ID.txt'?'no-store, max-age=0'"));
 assert.ok(host.includes("readFileSync(path.join(SITE,'GFC-BUILD-ID.txt')"));
 assert.ok(host.includes('gfcHost=1&build='));
 assert.ok(host.includes('userDataDir:PROFILE'));
 assert.ok(!host.includes('rmSync(PROFILE'));
});

test('NPC uses the native player movement/physics tick instead of teleporting',()=>{
 const agent=read('ops/gfc-npc.ts'),patch=read('ops/patch-opuscraft.mjs');
 assert.match(agent,/function drive\(\):void/);
 assert.match(agent,/inp\.forward=true/);
 assert.match(agent,/resident\.yaw\+=/);
 assert.match(agent,/walkingTicks,walkedBlocks:/);
 assert.match(agent,/walkingTo:waypoint/);
 assert.match(agent,/resident\.swing\(\)/);
 assert.match(agent,/if\(!waypoint&&lastAction!=='build'&&lastAction!=='rest'&&driveTicks%120===0\)roam\(\)/);
 assert.doesNotMatch(agent,/resident\.moveTo\(/);
 assert.ok(patch.includes("(window as any).__gfcNpc?.drive?.()"));
 assert.ok(patch.includes("this.server?.receive();"));
 assert.ok(patch.includes("this.level.tick();"));
 assert.match(agent,/distance\(p\.x,p\.z,plot!\.x,plot!\.z\)<4/);
});

test('Groq decisions and every execution have private audit entries without tokens or names',()=>{
 const host=read('ops/opuscraft-host.cjs');
 const brain=read('ops/opuscraft-npc-brain.cjs');
 const agent=read('ops/gfc-npc.ts');
 assert.match(brain,/NPC_SYSTEM_PROMPT/);
 assert.match(host,/NPC_QUESTION/);
 assert.match(host,/NPC_DECISION/);
 assert.match(host,/NPC_STEP/);
 assert.match(host,/system:NPC_SYSTEM_PROMPT,input/);
 assert.match(host,/reason:result\.buildReason/);
 assert.match(agent,/buildCursor:nextBlock,buildReason:lastBuildReason/);
 assert.match(agent,/lastBuildReason='visitor_in_build_area'/);
 assert.match(agent,/lastBuildReason='blueprint_finished'/);
 assert.match(agent,/lastBuildReason='existing_block_preserved'/);
 assert.match(agent,/lastBuildReason='placed_block'/);
 assert.doesNotMatch(host,/JSON\.stringify\(process\.env\)/);
});

test('Building plans must not force purposeless roaming between building actions',()=>{
 const agent=read('ops/gfc-npc.ts');
 assert.match(agent,/if\(!waypoint&&lastAction!=='build'&&lastAction!=='rest'&&driveTicks%120===0\)roam\(\)/);
 assert.match(agent,/if\(paused\)waypoint=null/);
 assert.match(agent,/if\(lastAction!=='build'&&driveTicks%20===0\)roam\(\)/);
});
