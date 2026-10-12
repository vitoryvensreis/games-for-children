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
