'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('OpusCraft native gameplay is pinned; only exact trusted HTTPS relay origin is patched',()=>{
 const build=read('ops/build-opuscraft.sh'),guard=read('ops/patch-opuscraft-trusted-relay.mjs');
 assert.match(build,/bc0c753f730ef15bc8f8acf093d40797700b87ee/);
 assert.match(build,/npm run build -- --base=\/opuscraft\//);
 assert.match(build,/patch-opuscraft-trusted-relay\.mjs/);
 assert.doesNotMatch(build,/patch-opuscraft-mesh|patch-opuscraft-host-cpu|gfc-family|gfc-npc|gfc-rotor|gfc-leaf|gfc-adaptive/);
 assert.match(guard,/src\/game\/game\.ts/);
 assert.match(guard,/location\.protocol === 'https:'/);
 assert.match(guard,/h === 'gamesforchildren\.escotilhaprodutora\.com'/);
 assert.doesNotMatch(guard,/chunkManager|mesher|simulationDistance|renderDistance|saveWorld/);
});
test('VPS only relays messages; the player generates and saves the world locally',()=>{
 const app=read('public/app.js'),server=read('server.cjs'),relay=read('ops/opuscraft-relay-host.cjs');
 assert.match(relay,/attachRelay\(server,/);
 assert.match(relay,/mode:'player-hosted'/);
 assert.doesNotMatch(relay,/puppeteer|chromium|saveWorld|newWorldMeta/);
 assert.match(server,/launchOpusRelay\(\)/);
 assert.match(server,/\['host','guest','list'\]/);
 assert.match(server,/origin!=='https:\/\/gamesforchildren\.escotilhaprodutora\.com'/);
 assert.match(server,/const auth=checkSession\(req\)/);
 assert.doesNotMatch(server,/launchOpusHost|opuscraft-host\.cjs|__npc\/status|__teleport|__summon|__world-control/);
 assert.doesNotMatch(server,/\/api\/admin\/opuscraft/);
 assert.match(app,/function openOpusCraft/);
 assert.match(app,/opuscraftFrame/);
 assert.doesNotMatch(app,/opusHowTo|opuscraft-players/);
 assert.doesNotMatch(app,/opusPlayersDock|adminMinecraftDashboard|changeOpusWorld|refreshMinecraftDashboard/);
 assert.doesNotMatch(app,/opuscraft\/players|opuscraft\/teleport|admin\/opuscraft/);
});
test('Family text and WebRTC voice remain enabled, but not Minecraft ADM control',()=>{
 const server=read('server.cjs'),app=read('public/app.js');
 assert.match(server,/voice-ready/);assert.match(server,/voicePresence/);
 assert.match(server,/m\.type==='familyChat'/);
 assert.doesNotMatch(app,/familyChatToggle/);
 assert.doesNotMatch(app,/familyChatForm/);
 assert.match(app,/function ensureVoiceDock/);
 assert.match(app,/toggleVoice/);
 assert.match(app,/Zerar minutos/);
});
test('Clean reinstall purges OpusCraft world data but preserves other game profiles',()=>{
 const deploy=read('ops/deploy-opuscraft-vps.sh');
 assert.match(deploy,/OPUSCRAFT_ORIGINAL_PLAYER_RELAY_READY/);
 assert.match(deploy,/rm -rf -- data\/opuscraft/);
 assert.match(deploy,/OPUSCRAFT_DEPLOY_HEALTH_OK/);
 assert.doesNotMatch(deploy,/rm -rf data\/state\.json/);
 assert.doesNotMatch(deploy,/rm -rf data\/state\.json/);
 assert.match(deploy,/trap rollback ERR/);
});
