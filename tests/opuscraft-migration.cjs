'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('OpusCraft is pinned and world persistence is owned by the VPS',()=>{
 const build=read('ops/build-opuscraft.sh'),patch=read('ops/patch-opuscraft.mjs'),host=read('ops/opuscraft-host.cjs');
 assert.match(build,/bc0c753f730ef15bc8f8acf093d40797700b87ee/);
 assert.match(build,/npm run build/);
 assert.match(patch,/saveWorldMeta/);
 assert.ok(patch.includes("game.joinWorld({ via: 'relay' }, guestIdentity("));
 assert.match(patch,/gfcHost/);
 assert.match(patch,/gfcJoin/);
 assert.ok(patch.includes("game.joinWorld({ via: 'relay' }, guestIdentity("));
 assert.ok(patch.includes("role === 'host' ? '/__mp' : '/ws?opus=1'"));
 assert.ok(!patch.includes("joinFirstLanWorld(game, identity.joinCode)"));
 assert.match(host,/data','opuscraft','profile/);
 assert.match(host,/g\.saveWorld\(\)/);
 assert.match(host,/attachRelay/);
 assert.match(host,/127\.0\.0\.1/);
});
test('Game joins only as authenticated child; no public hosting through app relay',()=>{
 const server=read('server.cjs');
 assert.match(server,/opusName\(u\)/);
 assert.match(server,/checkSession\(req\)/);
 assert.match(server,/\/api\/opuscraft\/identity/);
 assert.match(server,/\/api\/admin\/opuscraft\/status/);
 assert.match(server,/\['guest','list'\]\.includes\(role\)/);
 assert.match(server,/opusConnections/);
 assert.ok(server.includes("pathname==='/ws'&&new URL(req.url"));

 assert.match(server,/s\.revoked/);
 assert.match(server,/usage\(u\)>=u\.dailyLimit\*60000/);
 assert.match(server,/familyChat/);
 assert.match(server,/m\.text\.trim\(\)\.slice\(0,180\)/);
});
test('PWA displays OpusCraft with family chat and voice overlay',()=>{
 const app=read('public/app.js'),css=read('public/style.css');
 assert.match(app,/\/opuscraft\/index\.html\?gfcJoin=1&v=/);
 assert.match(app,/api\('opuscraft\/status'\)/);
 assert.match(app,/familyChatInput/);
 assert.match(app,/openOpusCraft/);
 assert.match(css,/\.opuscraft-embed/);
 assert.match(css,/\.opuscraft-chat/);
 assert.doesNotMatch(app,/openClassiCube/);
});
