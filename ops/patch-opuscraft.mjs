import fs from 'node:fs';
import path from 'node:path';
// This patch applies only to the audited upstream commit in the deploy workflow.
const root=process.argv[2];
if(!root)throw Error('Usage: node ops/patch-opuscraft.mjs <opuscraft-src>');
function patch(file,find,replace){
 const full=path.join(root,file),s=fs.readFileSync(full,'utf8');
 if(!s.includes(find)||s.indexOf(find)!==s.lastIndexOf(find))throw Error('Upstream changed; refusing to patch '+file);
 fs.writeFileSync(full,s.replace(find,replace));
}
patch('src/main.ts',
 "import { openToLanOnceSpawned, joinFirstLanWorld, guestModeParam, JoinMultiplayerScreen } from './gui/screens/multiplayer';",
 "import { openToLanOnceSpawned, joinFirstLanWorld, guestIdentity, guestModeParam, JoinMultiplayerScreen } from './gui/screens/multiplayer';");
patch('src/main.ts',
 "import { getWorldMeta } from './storage/worldStore';",
 "import { getWorldMeta, saveWorldMeta } from './storage/worldStore';");
patch('src/main.ts',
 "  if (params.has('seed') || params.has('quick')) {",
 `  if (params.has('gfcHost')) {
    // VPS-owned persistent IndexedDB profile, reused across automatic restarts.
    const id = 'gamesnavagador-family-world';
    let meta = await getWorldMeta(id);
    if (!meta) {
      meta = newWorldMeta(id, 'Mundo da Familia', 'gamesnavagador-family-2026', 'creative', 'peaceful', false, true);
      await saveWorldMeta(meta);
    }
    await game.startWorld(meta);
    openToLanOnceSpawned(game, 'creative');
  } else if (params.has('gfcJoin')) {
    // Never take a player identity or a join code from child-controlled query parameters.
    const response = await fetch('/api/opuscraft/identity', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Entre na sua conta GamesNavagador para jogar.');
    const identity = await response.json() as { playerName: string; joinCode: string };
    if (!/^[A-Za-z0-9_]{3,16}$/.test(identity.playerName)) throw new Error('Identidade de jogador invalida');
    sessionStorage.setItem('mc-mp-name', identity.playerName);
    game.setScreen(new TitleScreen(game, false));
    // One server-owned family world, never a LAN search or manual join-code form.
    // The upstream LAN list is intended for ad-hoc browser hosts and may be blocked
    // by production reverse proxies. Always connect directly to our private relay.
    await game.joinWorld({ via: 'relay' }, guestIdentity(game, identity.playerName, identity.joinCode));
  } else if (params.has('seed') || params.has('quick')) {`);
patch('src/net/joinCode.ts',
 "export function newJoinCode(): string {\n  const b = new Uint8Array(JOIN_CODE_LENGTH);",
 "export function newJoinCode(): string {\n  if (new URLSearchParams(location.search).has('gfcHost')) return 'GFC2026X';\n  const b = new Uint8Array(JOIN_CODE_LENGTH);");
patch('src/net/transport/webSocket.ts',
 "return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/__mp?role=${role}`;",
 `// The headless VPS host keeps using the local relay. Family devices use
  // /ws, which is already supported by the site's production reverse proxy.
  const endpoint = role === 'host' ? '/__mp' : '/ws?opus=1';
  const separator = endpoint.includes('?') ? '&' : '?';
  return (loc.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + loc.host + endpoint + separator + 'role=' + role;`);
// Static files are mounted behind the authenticated GamesNavagador iframe.
console.log('OpusCraft family host / guest integration applied');
