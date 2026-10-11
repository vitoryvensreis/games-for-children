'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sanitizeNpcAudit}=require('../database/npc-audit.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('audit IPC drops secrets, child names and arbitrary provider output',()=>{
 const safe=sanitizeNpcAudit({type:'question',source:'groq',action:'build',secret:'GROQ_SECRET',
  details:{number:12,model:'openai/gpt-oss-20b',system:'Safe resident prompt',
    input:{playersNearby:2,blocksBuilt:5,hasVisitors:true,child:'KID_PRIVATE'},
    token:'GROQ_SECRET',userEmail:'hidden@example.com'},user:'KID_PRIVATE'});
 assert.equal(safe.type,'question');
 assert.equal(safe.action,'build');
 assert.equal(safe.details.number,12);
 assert.equal(safe.details.model,'openai/gpt-oss-20b');
 assert.equal(safe.details.input.playersNearby,2);
 assert.equal(safe.details.input.blocksBuilt,5);
 assert.ok(!JSON.stringify(safe).includes('KID_PRIVATE'));
 assert.ok(!JSON.stringify(safe).includes('GROQ_SECRET'));
 assert.equal(sanitizeNpcAudit({type:'erase_world'}),null);
 const decision=sanitizeNpcAudit({type:'decision',action:'delete_world',source:'unknown',
  details:{number:1,configured:true,error:'provider unavailable'}});
 assert.equal(decision.action,null);
 assert.equal(decision.source,null);
 assert.equal(decision.details.error,'provider unavailable');
});

test('NPC history uses a separate, bounded indexed MySQL table with 30-day retention',()=>{
 const schema=read('database/migrations/002_npc_audit.sql');
 const store=read('database/store.cjs');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS gfc_npc_audit/i);
 assert.match(schema,/BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY/);
 assert.match(schema,/KEY idx_created \(created_at\)/);
 assert.match(store,/SELECT id,event_type,action,source,details_json,created_at FROM gfc_npc_audit/);
 assert.match(store,/INTERVAL 30 DAY LIMIT 2000/);
 assert.match(store,/Math\.min\(80,Number\(limit\)\)/);
 assert.doesNotMatch(schema,/DELETE FROM game_state|DROP TABLE/i);
});

test('NPC logs flow on existing IPC+admin WebSocket and API stays admin-only',()=>{
 const server=read('server.cjs'),host=read('ops/opuscraft-host.cjs');
 const app=read('public/app.js');
 assert.match(server,/stdio:\['ignore','inherit','inherit','ipc'\]/);
 assert.match(server,/sanitizeNpcAudit\(message\.event\)/);
 assert.match(server,/peer\.user\.role==='admin'/);
 assert.match(server,/pathname==='\/api\/admin\/opuscraft\/npc\/events'/);
 assert.match(server,/if\(u\.role!=='admin'\)return json\(res,403/);
 assert.match(host,/publishNpc\('question',question\)/);
 assert.match(host,/publishNpc\('decision',decision\)/);
 assert.match(host,/publishNpc\('step',snapshot\)/);
 assert.match(host,/npcLastAuditAt>120000/);
 assert.match(app,/m\.type==='npcAudit'&&me\?\.role==='admin'/);
 assert.match(app,/function renderNpcAudit\(/);
 assert.match(app,/admin\/opuscraft\/npc\/events/);
});
