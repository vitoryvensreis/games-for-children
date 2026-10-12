'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('The former AI monitor has been removed from the family interface',()=>{
 const ui=read('public/app.js'),host=read('ops/opuscraft-host.cjs');
 assert.doesNotMatch(ui,/Monitor da Andarilha|Andarilha — Sobrevivência|Pergunta enviada à Groq/);
 assert.doesNotMatch(ui,/refreshNpcAudit\(\)|function renderNpcAudit\(/);
 assert.doesNotMatch(host,/publishNpc\(|NPC_QUESTION|NPC_DECISION|NPC_STEP|decide\(/);
 assert.match(ui,/Exploração da Família — V3/);
 assert.doesNotMatch(ui,/Construções do mapa|opusLandmarksList/);
});
test('Old audit records remain archived but cannot trigger provider requests',()=>{
 const schema=read('database/migrations/002_npc_audit.sql');
 const store=read('database/store.cjs'),host=read('ops/opuscraft-host.cjs');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS gfc_npc_audit/i);
 assert.match(store,/SELECT id,event_type,action,source,details_json,created_at FROM gfc_npc_audit/);
 assert.doesNotMatch(host,/GROQ_API_KEY|GEMINI_API_KEY|fetch\('https:\/\/api\.groq\.com/);
});
