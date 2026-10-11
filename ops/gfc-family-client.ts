// Family-only graphics limits. Called when a player explicitly joins multiplayer;
// personal single-player worlds keep their own options and IndexedDB data.
import type { Game } from './game/game';

export function prepareFamilyClient(game: Game): void {
  (window as any).__gfcFamilySession = true;
  (window as any).__gfcFamilyJoining = true;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (matchMedia('(pointer: coarse)').matches && innerWidth < 1100);
  game.opts.renderDistance = mobile ? 3 : 4;
  game.opts.simulationDistance = Math.min(game.opts.simulationDistance, 2);
  game.opts.graphics = 0;
  game.opts.fancy = false;
  game.opts.clouds = 0;
  game.opts.particles = 2;
  game.opts.entityShadows = false;
  game.opts.smoothLighting = false;
  game.opts.maxFps = Math.min(game.opts.maxFps, 60);
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
