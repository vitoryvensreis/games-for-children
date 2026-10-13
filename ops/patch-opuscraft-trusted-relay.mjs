// Compatibility exception for the authenticated GamesNavagador HTTPS gateway.
// Physics, graphics, world storage, shaders and LAN protocol remain original.
// Upstream restricts public-domain pages to local BroadcastChannel hosting,
// which prevents the platform's already-authenticated websocket gateway.
// The gateway itself enforces exact HTTPS Origin, session and time limits.
import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2];
if(!dir)throw Error('usage: node ops/patch-opuscraft-trusted-relay.mjs <upstream-src>');
const file=path.join(dir,'src/game/game.ts'),old=fs.readFileSync(file,'utf8');
const anchor="  if (h === 'localhost' || h.endsWith('.localhost') || h === '[::1]' || /^127\\./.test(h)) return null;";
const fixed=anchor+"\n  // GamesNavagador's exact-origin HTTPS relay already authenticates players.\n  if (location.protocol === 'https:' && h === 'gamesforchildren.escotilhaprodutora.com') return null;";
if(old.split(anchor).length!==2)throw Error('Upstream relay host guard changed: review before adapting');
fs.writeFileSync(file,old.replace(anchor,fixed));
console.log('OPUSCRAFT_AUTHENTICATED_PUBLIC_RELAY_ENABLED');

// Experimental dedicated-world join uses upstream ClientSession/GUI unchanged.
// The platform must proxy authenticated /__dedicated to the Node service
// before this opt-in path can work. Normal multiplayer remains untouched.
const gameFile=path.join(dir,'src/game/game.ts');
let gameSource=fs.readFileSync(gameFile,'utf8');
const oldTransport="new WebSocketGuestTransport({ latency: this.netLag ?? undefined })";
const dedicatedTransport="new WebSocketGuestTransport({ latency: this.netLag ?? undefined, ...(target.via === 'dedicated' ? { url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/__dedicated` } : {}) })";
const oldTarget="type JoinTarget = { via: 'browser'; lanId: string } | { via: 'relay' };";
if(gameSource.split(oldTarget).length!==2)throw Error('Upstream JoinTarget changed');
gameSource=gameSource.replace(oldTarget,"type JoinTarget = { via: 'browser'; lanId: string } | { via: 'relay' } | { via: 'dedicated' };");
if(gameSource.split(oldTransport).length!==2)throw Error('Upstream guest transport changed; dedicated adaptation needs review');
fs.writeFileSync(gameFile,gameSource.replace(oldTransport,dedicatedTransport));
const mainFile=path.join(dir,'src/main.ts');
let mainSource=fs.readFileSync(mainFile,'utf8');
const oldImport="openToLanOnceSpawned, joinFirstLanWorld, guestModeParam, JoinMultiplayerScreen";
const newImport="openToLanOnceSpawned, joinFirstLanWorld, guestModeParam, guestIdentity, guestName, JoinMultiplayerScreen";
if(mainSource.split(oldImport).length!==2)throw Error('Upstream multiplayer import changed');
mainSource=mainSource.replace(oldImport,newImport);
const oldJoin="  } else if (mp === 'join') {";
if(mainSource.split(oldJoin).length!==2)throw Error('Upstream join bootstrap changed');
mainSource=mainSource.replace(oldJoin,`  } else if (mp === 'dedicated') {
    game.setScreen(new TitleScreen(game, false));
    void game.joinWorld({ via: 'dedicated' }, guestIdentity(game, guestName(), params.get('code') ?? ''));
`+oldJoin);
fs.writeFileSync(mainFile,mainSource);
console.log('OPUSCRAFT_EXPERIMENTAL_DEDICATED_BROWSER_JOIN_ENABLED');

// Present the always-on world as a normal Multiplayer server-list row.
const multiFile=path.join(dir,'src/gui/screens/multiplayer.ts');
let multiSource=fs.readFileSync(multiFile,'utf8');
function patchOnce(from,to){
 if(multiSource.split(from).length!==2)throw Error('Upstream multiplayer UI changed: '+from.slice(0,50));
 multiSource=multiSource.replace(from,to);
}
patchOnce("type Heard = { world: LanWorld; via: 'browser' | 'relay' };",
 "type Heard = { world: LanWorld; via: 'browser' | 'relay' | 'dedicated' };");
patchOnce("const where = e.via === 'browser' ? 'Another window of this browser' : `At ${location.host}`;",
 "const where = e.via === 'dedicated' ? 'Online 24h - Mundo compartilhado' : e.via === 'browser' ? 'Another window of this browser' : `At ${location.host}`;");
patchOnce("const heard: Heard[] = [...mine.map((world) => ({ world, via: 'browser' as const })), ...theirs.map((world) => ({ world, via: 'relay' as const }))];",
 `const family: Heard = { via: 'dedicated', world: { id:'family-dedicated', name:'Mundo da Familia - 24h', host:'GamesNavagador',
  players:0, max:16, protocol:PROTOCOL_VERSION, build:BUILD_ID, code:'ABCD1234' } };
    const heard: Heard[] = [family, ...mine.map((world) => ({ world, via: 'browser' as const })), ...theirs.map((world) => ({ world, via: 'relay' as const }))];`);
patchOnce("s.via === 'browser' || this.codeOk()","s.via === 'dedicated' || s.via === 'browser' || this.codeOk()");
patchOnce("const code = h.via === 'browser' ? (h.world.code ?? '') : this.code;",
 "const code = h.via === 'dedicated' ? (h.world.code ?? '') : h.via === 'browser' ? (h.world.code ?? '') : this.code;");
patchOnce("if (h.via === 'relay' && !this.codeOk()) return;",
 "if (h.via === 'relay' && !this.codeOk()) return;");
patchOnce("h.via === 'browser' ? { via: 'browser', lanId: h.world.id } : { via: 'relay' }",
 "h.via === 'dedicated' ? { via: 'dedicated' } : h.via === 'browser' ? { via: 'browser', lanId: h.world.id } : { via: 'relay' }");
patchOnce("if (mx - this.rowLeft() <= 32 || dbl) this.screen.join(e);",
 "if (mx - this.rowLeft() <= 32 || dbl) this.screen.join(e);");
patchOnce("this.list = this.add(new LanList(this, this.width, 48, this.height - 112));",
 "this.list = this.add(new LanList(this, this.width, 48, this.height - 112));");
fs.writeFileSync(multiFile,multiSource);
console.log('OPUSCRAFT_DEDICATED_NATIVE_MULTIPLAYER_LIST_ROW_OK');
