'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {normalizeAction,fallbackAction,parseAction,decide}=require('../ops/opuscraft-npc-brain.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Grok is constrained to four non-destructive actions',async()=>{
 assert.equal(normalizeAction('build'),'build');
 assert.equal(normalizeAction('remove_blocks'),null);
 assert.equal(parseAction('{"action":"hide"}'),'hide');
 assert.equal(parseAction('{"action":"delete_everything"}'),null);
 const local=await decide({playersNearby:2},0,{key:''});
 assert.deepEqual(local,{action:'build',source:'local',configured:false});
 assert.equal(fallbackAction(2),'explore');
 const grok=await decide({playersNearby:1},12,{key:'test',fetcher:async(url,opt)=>{
  assert.equal(url,'https://api.x.ai/v1/responses');
  assert.equal(opt.headers.Authorization,'Bearer test');
  assert.ok(!opt.body.includes('KID_'));
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"action":"observe"}'}]}]})};
 }});
 assert.equal(grok.action,'observe');
 assert.equal(grok.source,'grok');
 const rejected=await decide({},3,{key:'test',fetcher:async()=>({
  ok:true,json:async()=>({output_text:'{"action":"destroy"}'})
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
