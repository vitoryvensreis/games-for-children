'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('OpusCraft game build is the EXACT pinned original, without patched gameplay',()=>{
 const build=read('ops/build-opuscraft.sh');
 assert.match(build,/bc0c753f730ef15bc8f8acf093d40797700b87ee/);
 assert.match(build,/npm run build -- --base=\/opuscraft\//);
 assert.doesNotMatch(build,/patch-opuscraft|gfc-family|gfc-npc|gfc-rotor|gfc-leaf|gfc-adaptive/);
});
test('VPS only relays messages; the player generates and saves the world locally',()=>{
 const app=read('public/app.js'),server=read('server.cjs'),relay=read('ops/opuscraft-relay-host.cjs');
 assert.match(relay,/attachRelay\(server,/);
 assert.match(relay,/mode:'player-hosted'/);
 assert.doesNotMatch(relay,/puppeteer|chromium|saveWorld|newWorldMeta/);
 assert.match(server,/launchOpusRelay\(\)/);
 assert.match(server,/\['host','guest','list'\]/);
 assert.doesNotMatch(server,/launchOpusHost|opuscraft-host\.cjs|__npc\/status|__teleport|__summon|__world-control/);
 assert.doesNotMatch(server,/\/api\/admin\/opuscraft/);
 assert.match(app,/Open to LAN/);
 assert.match(app,/Start LAN World/);
 assert.match(app,/Multiplayer/);
 assert.doesNotMatch(app,/opusPlayersDock|adminMinecraftDashboard|changeOpusWorld|refreshMinecraftDashboard/);
 assert.doesNotMatch(app,/opuscraft\/players|opuscraft\/teleport|admin\/opuscraft/);
});
test('Family text and WebRTC voice remain enabled, but not Minecraft ADM control',()=>{
 const server=read('server.cjs'),app=read('public/app.js');
 assert.match(server,/voice-ready/);assert.match(server,/voicePresence/);
 assert.match(server,/m\.type==='familyChat'/);
 assert.match(app,/familyChatToggle/);
 assert.match(app,/familyChatForm/);
 assert.match(app,/renderFamilyChat\(\)/);
 assert.match(app,/toggleVoice/);
 assert.match(app,/Zerar minutos/);
});
test('Cleanup only removes old family host; keeps user backups and other game profiles',()=>{
 const deploy=read('ops/deploy-opuscraft-vps.sh');
 assert.match(deploy,/OPUSCRAFT_ORIGINAL_PLAYER_RELAY_READY/);
 assert.match(deploy,/data\/opuscraft\/profile-v3/);
 assert.match(deploy,/OPUSCRAFT_DEPLOY_HEALTH_OK/);
 assert.doesNotMatch(deploy,/rm -rf data\/opuscraft\/backups/);
 assert.doesNotMatch(deploy,/rm -rf data\/state\.json/);
 assert.match(deploy,/trap rollback ERR/);
});
