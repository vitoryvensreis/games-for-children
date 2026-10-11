'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('No simulated hunger, oxygen, memory queries or AI remains attached to the host',()=>{
 const host=read('ops/opuscraft-host.cjs'),npc=read('ops/gfc-npc.ts');
 for(const s of [host,npc]){
  for(const forbidden of ['GROQ_API_KEY','GEMINI_API_KEY','api.groq.com',
   'generativelanguage.googleapis.com','NPC_QUESTION','NPC_DECISION','NPC_STEP',
   'survivalTick','fallbackAction'])
   assert.ok(!s.includes(forbidden),forbidden);
 }
 assert.match(npc,/installGfcWorldAttractions/);
 assert.match(npc,/resident\.setGameMode\('spectator'\)/);
});
test('Existing world is protected even if a player visits during construction',()=>{
 const a=read('ops/gfc-world-attractions.ts');
 assert.match(a,/Visitantes próximos da obra/);
 assert.match(a,/if\(!OPEN\.has\(current\)\)/);
 assert.match(a,/if\(state\.completed\.some\(s=>Math\.hypot/);
 assert.match(a,/game\.chunks\.setTicket\('gfc-landmarks',null\)/);
 assert.match(a,/Hélice modificada manualmente; não apagar blocos/);
 assert.match(a,/game\.saveWorld\(\)\.then/);
 assert.match(a,/const SAVE_KEY='gfc-family-exploration-landmarks-v1'/);
});
test('Changing the NPC role does not clear historical DB or browser saves',()=>{
 const store=read('database/store.cjs'),patch=read('ops/patch-opuscraft.mjs');
 assert.match(store,/gfc_npc_life_state/);
 assert.match(patch,/gamesnavagador-family-world/);
 assert.match(patch,/await getWorldMeta\(id\)/);
 const familyHost=patch.slice(patch.indexOf("if (params.has('gfcHost'))"),patch.indexOf("} else if (params.has('gfcJoin'))"));
 assert.doesNotMatch(familyHost,/indexedDB\.deleteDatabase|deleteWorld|newWorldMeta\(id.*Date\.now/);
});
