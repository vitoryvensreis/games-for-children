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
patch('src/storage/worldStore.ts',
 "const DB_NAME = 'mcreplica';",
 `let DB_NAME = 'mcreplica';
export function setWorldNamespace(userId: string): void {
 if (dbp) throw new Error('World database already open: cannot change accounts');
 if (!/^[a-f0-9-]{20,50}$/i.test(userId)) throw new Error('Invalid family profile');
 DB_NAME = 'mcreplica-profile-' + userId;
}`);
patch('src/main.ts',
 "import { openToLanOnceSpawned, joinFirstLanWorld, guestModeParam, JoinMultiplayerScreen } from './gui/screens/multiplayer';",
 "import { openToLanOnceSpawned, joinFirstLanWorld, guestIdentity, guestModeParam, JoinMultiplayerScreen } from './gui/screens/multiplayer';");
patch('src/main.ts',
 "  const canvas = document.getElementById('gl') as HTMLCanvasElement;",
 `  // Shared phones must not share solo worlds across different child accounts.
  // Keep the original 'mcreplica' database for the VPS headless family host.
  if (!params.has('gfcHost')) {
    const r = await fetch('/api/me', { credentials:'same-origin', cache:'no-store' });
    if (!r.ok) throw Error('Entre novamente na sua conta GamesNavagador');
    const auth = await r.json() as { user?:{id:string} };
    if (!auth.user?.id) throw Error('Conta familiar sem identificador');
    setWorldNamespace(auth.user.id);
  }
  const canvas = document.getElementById('gl') as HTMLCanvasElement;`);
patch('src/main.ts',
 "  installScreens(game);",
 `  installScreens(game);
  (window as any).__gfcFamilyActions = { preflight: checkFamilyRelay, prepare: () => prepareFamilyClient(game) };
  if (!params.has('gfcHost')) {
    let accessLost=false;
    setInterval(async () => {
      if (accessLost)return;
      try {
        const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
        if(!r.ok)throw Error('Sessao familiar encerrada');
        const data=await r.json() as {user?:{role:string;dailyLimit:number;usedSeconds:number}};
        if(data.user?.role==='child'&&data.user.usedSeconds>=data.user.dailyLimit*60)
         throw Error('Tempo de jogo encerrado pelo responsavel');
      }catch{
        accessLost=true;
        try{if(game.inWorld)await game.leaveWorld()}catch{}
        // The game's own leaveWorld() stops its internal tick clock safely.
        const panel=document.createElement('div');
        panel.textContent='Acesso encerrado pelo responsavel. Volte ao GamesNavagador.';
        panel.style.cssText='position:fixed;z-index:999;inset:0;background:#0c1930;color:white;display:grid;place-items:center;padding:24px;text-align:center;font:700 19px system-ui';
        document.body.appendChild(panel);
      }
    },15000);
  }`);
patch('src/main.ts',
 "import { getWorldMeta } from './storage/worldStore';",
 "import { getWorldMeta, saveWorldMeta, setWorldNamespace } from './storage/worldStore';\nimport { installGfcNpc } from './gfc-npc';\nimport { checkFamilyRelay, prepareFamilyClient } from './gfc-family-client';");
patch('src/main.ts',
 "  if (params.has('seed') || params.has('quick')) {",
 `  if (params.has('gfcHost')) {
    // VPS-owned persistent IndexedDB profile, reused across automatic restarts.
    const id = 'gamesnavagador-family-world-v3';
    let meta = await getWorldMeta(id);
    if (!meta) {
      meta = newWorldMeta(id, 'Mundo da Familia - Exploracao', 'gamesnavagador-exploration-clean-2026-v3', 'creative', 'peaceful', false, true);
      await saveWorldMeta(meta);
    }
    game.opts.renderDistance = 2; // Dedicated host simulates chunks; it does not need far-field graphics.
    await game.startWorld(meta);
    game.opts.username = 'Andarilha'; // This real host avatar is the autonomous resident.
    game.player.profileName = 'Andarilha';
    installGfcNpc(game);
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
    prepareFamilyClient(game);
    await game.joinWorld({ via: 'relay' }, guestIdentity(game, identity.playerName, identity.joinCode));
  } else if (params.has('seed') || params.has('quick')) {`);

patch('src/gui/screens/multiplayer.ts',
 "    this.list = this.add(new LanList(this, this.width, 48, this.height - 112));",
 `    // This family server is always shown, independent of LAN discovery.
    this.list = this.add(new LanList(this, this.width, 48, this.height - 142));
    this.add(new Button(cx - 100, this.height - 79, 200, 20, 'Servidor da Familia - Entrar', () => void this.enterFamilyServer()));`);
patch('src/gui/screens/multiplayer.ts',
 "  private nameOk(): boolean {",
 `  private async enterFamilyServer(): Promise<void> {
    try {
      const actions = (window as any).__gfcFamilyActions;
      if (!actions) throw Error('Menu familiar indisponivel.');
      await actions.preflight();
      const r = await fetch('/api/opuscraft/identity', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw Error('Acesso da familia encerrado. Faca login novamente.');
      const identity = await r.json() as { playerName:string; joinCode:string };
      if (!/^[A-Za-z0-9_]{3,16}$/.test(identity.playerName)) throw Error('Identidade invalida');
      this.closeLists();
      actions.prepare();
      await this.game.joinWorld({ via: 'relay' }, guestIdentity(this.game, identity.playerName, identity.joinCode));
      (window as any).__gfcFamilyJoining = false;
    } catch (error) {
      (window as any).__gfcRestoreVideo?.();
      (window as any).__gfcFamilyJoining = false;
      this.game.setScreen(this);
      window.alert('Nao foi possivel entrar no Servidor da Familia: ' + String(error));
    }
  }
  private nameOk(): boolean {`);
patch('src/gui/screens/menus.ts',
 "import { WorldMeta, listWorlds, saveWorldMeta, deleteWorld } from '../../storage/worldStore';",
 "import { WorldMeta, listWorlds, saveWorldMeta, deleteWorld } from '../../storage/worldStore';\nimport { backupToVps, restoreFromVps } from '../../gfc-world-backup';");
patch('src/gui/screens/menus.ts',
 "    this.playBtn = this.add(new Button(cx - 154, this.height - 52, 150, 20, 'Play Selected World',",
 `    this.add(new Button(cx - 154, this.height - 77, 150, 20, 'Backup na VPS', () => {
      const selected = this.list.selected;
      if (selected) void backupToVps(selected).then(saved=>{if(saved)window.alert('Backup salvo na VPS')}).catch(e=>window.alert(String(e)));
    }));
    this.add(new Button(cx + 4, this.height - 77, 150, 20, 'Restaurar da VPS', () => {
      void restoreFromVps().then(()=>{
       this.all=null;
       this.game.setScreen(this);
      }).catch(e=>window.alert(String(e)));
    }));
    this.playBtn = this.add(new Button(cx - 154, this.height - 52, 150, 20, 'Play Selected World',`);
patch('src/gui/screens/menus.ts',
 "    this.list = this.add(new WorldList(this, this.width, 48, this.height - 112));",
 "    this.list = this.add(new WorldList(this, this.width, 48, this.height - 142));");

patch('src/gui/screens/menus.ts',
 "  creative: \"Create, build, and explore without limits. You can fly, have endless materials, and can't be hurt by monsters\",",
 "  creative: \"Create, build, and explore without limits. You can fly, have endless materials, and can't be hurt by monsters\",\n  adventure: 'Explore maps with limited block interactions',\n  spectator: 'Observe and fly through the world without building',");
patch('src/gui/screens/menus.ts',
 "  private mode: 'survival' | 'hardcore' | 'creative' = 'survival';",
 "  private mode: 'survival' | 'hardcore' | 'creative' | 'adventure' | 'spectator' = 'survival';");
patch('src/gui/screens/menus.ts',
 "      this.mode = recreate.hardcore ? 'hardcore' : recreate.gameMode === 'creative' ? 'creative' : 'survival';",
 "      this.mode = recreate.hardcore ? 'hardcore' : recreate.gameMode === 'creative' || recreate.gameMode === 'adventure' || recreate.gameMode === 'spectator' ? recreate.gameMode : 'survival';");
patch('src/gui/screens/menus.ts',
 "      const modes: ('survival' | 'hardcore' | 'creative')[] = ['survival', 'hardcore', 'creative'];",
 "      const modes: ('survival' | 'hardcore' | 'creative' | 'adventure' | 'spectator')[] = ['survival', 'creative', 'adventure', 'spectator', 'hardcore'];");
patch('src/gui/screens/menus.ts',
 "      this.mode === 'creative' ? 'creative' : 'survival',",
 "      this.mode === 'hardcore' ? 'survival' : this.mode,");
patch('src/gui/screens/menus.ts',
 "      hardcore ? false : this.cheats,",
 "      hardcore ? false : this.mode === 'spectator' || this.cheats,");
// Only the VPS host has an NPC driver. Run it after keyboard input is read,
// immediately before native player physics, so guests see real walking frames.
patch('src/game/game.ts',
 "      this.server?.receive();\n      this.level.tick();",
 "      this.server?.receive();\n      (window as any).__gfcNpc?.drive?.();\n      this.level.tick();");
// Small iPhones and the software-rendered VPS may need extra time to finish
// receiving terrain. Keep the session alive instead of ejecting the child mid-load.
patch('src/net/config.ts',
 "export const TIMEOUT_TICKS = 30 * 20;",
 "export const TIMEOUT_TICKS = 120 * 20;");
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
 `    client?.receive();
    if (this.mode === 'client' && this.inWorld && this.spawned &&
        (window as any).__gfcFamilySession === true && this.chunks &&
        this.ticks % 70 === 0 && this.chunks.renderDistance < this.opts.renderDistance) {
      this.chunks.renderDistance++;
      this.renderer.renderDistance = this.chunks.renderDistance;
      this.chunks.refreshRadius();
    }
    if (!this.inWorld) return client?.sendTick();`);
// Apply the lower pixel ratio as soon as a real multiplayer connection begins,
// then restore the exact solo framebuffer and options on returning to the title.
patch('src/game/game.ts',
 "    this.mode = 'client';\n    this.joinedWith = me.code;",
 "    this.mode = 'client';\n    if ((window as any).__gfcFamilySession === true) this.resize();\n    this.joinedWith = me.code;");
patch('src/game/game.ts',
 "    if (!c) return false;\n    this.client = null;\n    this.guestPoem = null;\n    this.mode = 'single';\n    this.clock.stop();",
 "    if (!c) return false;\n    this.client = null;\n    this.guestPoem = null;\n    this.mode = 'single';\n    (window as any).__gfcRestoreVideo?.();\n    this.clock.stop();");

// Native OpusCraft framebuffer by default. Optional family performance modes
// can downscale without touching world geometry or singleplayer settings.
patch('src/game/game.ts',
 "    const dpr = window.devicePixelRatio || 1;",
 `    const native = window.devicePixelRatio || 1;
    const family = (window as any).__gfcFamilySession === true && this.mode === 'client';
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const ratio = family ? (mobile ? 0.52 : 0.55) : 1;
    const maxW = family && (window as any).__gfcQuality?.status?.().mode !== 'original' ? (mobile ? 720 : 900) : 8192;
    const dpr = Math.min(native * ratio, maxW / Math.max(1,window.innerWidth));`);

// Family guests default to exact native 1x DPR. Explicit optional presets
// alone enable dynamic resolution; solo and the host retain native behavior.
patch('src/game/game.ts',
 "    const ratio = family ? (mobile ? 0.52 : 0.55) : 1;",
 "    const ratio = family ? ((window as any).__gfcQuality?.status?.().scale ?? (mobile ? 0.52 : 0.55)) : 1;");
// Hook AFTER a completed frame, without a separate timer or any extra render.
// Samples pause during hidden tabs, loading, and heavy chunk streaming.
patch('src/game/game.ts',
 "    this.frameTimeMs = performance.now() - t0;",
 `    this.frameTimeMs = performance.now() - t0;
    if (this.mode === 'client' && (window as any).__gfcFamilySession === true)
      (window as any).__gfcQuality?.sample(performance.now(), this.fps,
        this.inWorld && this.spawned, this.chunks?.pendingGen?.() ?? 0, document.hidden);`);


// Static files are mounted behind the authenticated GamesNavagador iframe.
console.log('OpusCraft family host / guest integration applied');
