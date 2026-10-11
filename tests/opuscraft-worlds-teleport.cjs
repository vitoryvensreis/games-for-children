'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Native OpusCraft title, singleplayer and family server in multiplayer',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),app=read('public/app.js');
 assert.match(patch,/Servidor da Familia - Entrar/);
 assert.match(patch,/enterFamilyServer/);
 assert.match(patch,/WorldList/);
 assert.match(patch,/backupToVps/);
 assert.match(patch,/restoreFromVps/);
 assert.match(patch,/spectator/);
 assert.match(patch,/adventure/);
 // The catalog launches the native title; the family server is selected in multiplayer.
 assert.match(app,/opuscraft\/index\.html\?v=/);
 assert.doesNotMatch(app,/opuscraft\/index\.html\?gfcJoin=1&v=/);
 assert.doesNotMatch(app,/if\(!status\.ready\)/);
 assert.match(patch,/await actions\.preflight\(\)/);
 assert.match(patch,/actions\.prepare\(\)/);
 assert.match(app,/g\?\.mode==='client'&&g\.inWorld&&g\.spawned/);
 assert.match(app,/opuscraftJoinAlert/);
 assert.match(app,/opusPlayersToggle/);
 assert.match(app,/api\('opuscraft\/teleport','POST'/);
});
test('Teleport is authenticated, limited and same-world, and host uses native teleport packet',()=>{
 const server=read('server.cjs'),host=read('ops/opuscraft-host.cjs');
 assert.match(server,/pathname==='\/api\/opuscraft\/players'/);
 assert.match(server,/pathname==='\/api\/opuscraft\/teleport'/);
 assert.match(server,/current-\(lastOpusTeleport\.get\(u\.id\)\|\|0\)<6000/);
 assert.match(server,/from\.dimension!==to\.dimension/);
 assert.match(server,/p\.role==='guest'&&p\.ws\.readyState===1/);
 assert.match(host,/url\.pathname==='\/__players'/);
 assert.match(host,/url\.pathname==='\/__teleport'/);
 assert.match(host,/me\.player\.level!==friend\.player\.level/);
 assert.match(host,/me\.teleportTo\(p\.x,p\.y,p\.z,p\.yaw,p\.pitch\)/);
});
test('Solo worlds have account-scoped VPS export/restore and retain local native autosave',()=>{
 const patch=read('ops/patch-opuscraft.mjs'),server=read('server.cjs'),transfer=read('ops/gfc-world-backup.ts'),build=read('ops/build-opuscraft.sh');
 assert.match(build,/gfc-world-backup\.ts/);
 assert.match(patch,/private mode: 'survival'/);
 assert.match(transfer,/exportWorld\(world\.id\)/);
 assert.match(transfer,/importWorld\(await file\.blob\(\)\)/);
 assert.match(server,/opusBackupDir\(u\)/);
 assert.match(server,/64\*1024\*1024/);
 assert.match(server,/400\*1024\*1024/);
 assert.match(server,/Buffer\.concat\(chunks\)/);
 assert.ok(server.includes("path.join(DATA,'opuscraft','backups')"));
 assert.match(patch,/\/api\/me/);
});
