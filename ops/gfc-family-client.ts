// Family-only graphics limits. Called when a player explicitly joins multiplayer;
// personal single-player worlds keep their own options and IndexedDB data.
import type { Game } from './game/game';
import { FamilyAdaptiveQuality } from './gfc-adaptive-quality';

export function prepareFamilyClient(game: Game): void {
  // Per-session overrides. Revert without changing a child's saved solo options.
  const previous={
    renderDistance:game.opts.renderDistance,simulationDistance:game.opts.simulationDistance,
    graphics:game.opts.graphics,fancy:game.opts.fancy,clouds:game.opts.clouds,
    particles:game.opts.particles,entityShadows:game.opts.entityShadows,
    smoothLighting:game.opts.smoothLighting,maxFps:game.opts.maxFps
  };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (matchMedia('(pointer: coarse)').matches && innerWidth < 1100);
  const quality=new FamilyAdaptiveQuality(mobile,Math.min(game.opts.maxFps,mobile?60:60),
    ()=>{if((window as any).__gfcFamilySession===true&&game.mode==='client')game.resize()});
  // Full native OpusCraft graphics are now the default. Lighter profiles remain
  // optional if the actual device cannot sustain the original resolution.
  quality.setMode('original');
  (window as any).__gfcQuality=quality;
  (window as any).__gfcRestoreVideo=()=>{
    quality.stop();
    if((window as any).__gfcQuality===quality)delete (window as any).__gfcQuality;
    Object.assign(game.opts,previous);
    (window as any).__gfcFamilySession=false;
    (window as any).__gfcFamilyJoining=false;
    game.resize();
  };
  (window as any).__gfcFamilySession = true;
  (window as any).__gfcFamilyJoining = true;
  // The relay supports up to eight native OpusCraft chunks in multiplayer.
  // Keep a sensible first-join distance; allow closer native max on capable PCs.
  // Use a new key so obsolete 2-chunk preferences cannot silently persist.
  let requested=mobile?4:6;
  try{
    const stored=Number(localStorage.getItem('gfc-family-native-view-distance-v1'));
    if(Number.isInteger(stored)&&stored>=3&&stored<=(mobile?6:8))requested=stored;
  }catch{}
  game.opts.renderDistance=Math.max(3,Math.min(mobile?6:8,requested));
  // All other graphics, fog, textures, animations and FPS use the native
  // game options. Do not force fast leaves, remove clouds or cut frame rate.
}

// Test exactly the authenticated public relay route, not the unrelated lobby WS.
export async function checkFamilyRelay(): Promise<void> {
  const statusResponse = await fetch('/api/opuscraft/status', {
    credentials: 'same-origin', cache: 'no-store'
  });
  if (!statusResponse.ok) throw Error('Nao foi possivel consultar o servidor da familia.');
  const status = await statusResponse.json() as { ready?: boolean; error?: string };
  if (!status.ready) throw Error(status.error || 'O servidor da familia ainda esta iniciando.');

  await new Promise<void>((resolve, reject) => {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') +
      location.host + '/ws?opus=1&role=list';
    let socket: WebSocket;
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(Error('O servidor nao respondeu. Tente novamente.')), 6500);
    try {
      socket = new WebSocket(url);
      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data));
          if (message?.t === 'worlds' && Array.isArray(message.worlds) && message.worlds.length)
            finish();
          else finish(Error('O mundo familiar ainda nao apareceu no servidor.'));
        } catch { finish(Error('Resposta inesperada da conexao multiplayer.')); }
      };
      socket.onerror = () => finish(Error('Falha na conexao multiplayer. Verifique a rede.'));
      socket.onclose = () => finish(Error('O servidor encerrou a conexao antes do mapa.'));
    } catch { finish(Error('Este navegador nao conseguiu abrir o multiplayer.')); }
  });
}
