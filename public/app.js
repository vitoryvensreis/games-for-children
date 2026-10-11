const ico=n=>'<svg class="icon" aria-hidden="true"><use href="/icons.svg#'+n+'"></use></svg>';
const $=s=>document.querySelector(s),app=$('#app');let me=null,ws=null,room=null,familyMessages=[],voiceOnline=[],iceQueues=new Map(),turnReady=null,frame=null,myId=null,peerId=null,voiceStream=null,connections=new Map(),remoteAudio=new Map(),adminTimer=null,wsRetry=null,heartbeatTimer=null,muted=false,desiredLane=1,inputSeq=0,lastLaneInput=0,iceServers=[{urls:'stun:stun.l.google.com:19302'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const box=s=>'<div class="app">'+s+'</div>',renderTop=()=>'<div class="top"><span class="brand">'+ico('gamepad')+' GamesForChildren</span><div class="row"><span class="pill">'+esc(me?.name)+'</span><button class="ghost" id="logout">Sair</button></div></div>';
function notify(msg){const n=$('#toast');n.textContent=msg;n.style.display='block';setTimeout(()=>n.style.display='none',3500)}
async function api(p,method='GET',body){const r=await fetch('/api/'+p,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const j=await r.json();if(!r.ok)throw Error(j.error||'Erro');return j}
function bindLogout(){const b=$('#logout');if(b)b.onclick=async()=>{await api('logout','POST');stopVoice();ws?.close();me=null;login();ensureVoiceDock()}}
function login(){app.innerHTML=box('<section class="panel narrow stack"><div class="art" style="text-align:center;color:#7956ed;font-size:40px">'+ico('gamepad')+'</div><h1 style="text-align:center">Bem-vindo ao clube!</h1><p class="muted" style="text-align:center">Jogos, desafios e aventuras em família.</p><div class="row" style="justify-content:center"><button type="button" class="success" id="tabKid">Sou jogador</button><button type="button" class="ghost" id="tabParent">Sou responsável</button></div><form id="login" class="stack"><label id="nameLabel">Nome do jogador<input id="user" autocomplete="username" required placeholder="Nome cadastrado"></label><label>Senha ou PIN<input id="pass" type="password" autocomplete="current-password" required placeholder="Seu código de acesso"></label><button id="loginButton">Entrar no jogo '+ico('gamepad')+'</button></form><p id="loginHint" class="hint">O responsável cadastra seu perfil uma vez. Depois, o aparelho mantém sua sessão até o responsável desconectar ou ela expirar.</p></section>');let parent=false;const setMode=x=>{parent=x;$('#tabKid').className=x?'ghost':'success';$('#tabParent').className=x?'success':'ghost';$('#nameLabel').firstChild.textContent=x?'Nome do administrador':'Nome do jogador';$('#user').placeholder=x?'Administrador':'Nome cadastrado';$('#user').value=x?'Administrador':'';$('#loginButton').textContent=x?'Entrar no painel dos pais':'Entrar no jogo';$('#loginHint').textContent=x?'Use a senha de administrador definida quando o servidor foi configurado. Nunca compartilhe essa senha com as crianças.':'O responsável cadastra seu perfil uma vez. Depois, o aparelho mantém sua sessão até o responsável desconectar ou ela expirar.'};$('#tabKid').onclick=()=>setMode(false);$('#tabParent').onclick=()=>setMode(true);$('#login').onsubmit=async e=>{e.preventDefault();try{const x=await api('login','POST',{name:$('#user').value,password:$('#pass').value});me=x.user;connect();home();ensureVoiceDock()}catch(err){notify(err.message)}}}
function send(m){if(ws?.readyState===1){ws.send(JSON.stringify(m));return true}notify('Sem conexão ao servidor de jogo. Aguarde a reconexão.');return false}
function connect(){if(!me)return;if(!heartbeatTimer){api('heartbeat','POST').catch(()=>{});heartbeatTimer=setInterval(()=>{if(me)api('heartbeat','POST').catch(()=>{});else{clearInterval(heartbeatTimer);heartbeatTimer=null}},15000)}api('voice/config').then(c=>{iceServers=c.iceServers||iceServers;turnReady=!!c.turnConfigured;const st=$('#voiceTurnStatus');if(st)st.textContent=turnReady?'Rede de áudio preparada com TURN.':'Aviso técnico: TURN ainda não configurado; algumas redes móveis podem bloquear chamadas.'}).catch(()=>{});if(ws){ws.onclose=null;ws.onerror=null;ws.close()}const socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');ws=socket;socket.onopen=()=>{if(ws!==socket)return;clearTimeout(wsRetry);const label=$('#connectionStatus');if(label)label.textContent='Conectado';if(room)send({type:'join',code:room.code});};socket.onmessage=async e=>{if(ws!==socket)return;const m=JSON.parse(e.data);if(m.type==='hello'){myId=m.id;send({type:'lobby'});if(voiceStream){send({type:'voice-ready'});send({type:'peers'})}ensureVoiceDock()}
if(m.type==='lobby')renderLobby(m.rooms);

if(m.type==='logout'){me=null;room=null;stopVoice();login();ensureVoiceDock();notify('Acesso encerrado pelo administrador')}
if(m.type==='voiceBlocked'){stopVoice();notify('O administrador desligou o chat de voz')}
if(m.type==='familyChat'){familyMessages.push(m);familyMessages=familyMessages.slice(-60);renderFamilyChat()}
if(m.type==='voicePresence'){voiceOnline=m.items||[];updateVoiceDock()}
if(m.type==='roomState'){const previous=room?.code;room=m;if(previous!==m.code){desiredLane=1;inputSeq=0;lastLaneInput=0;frame=null}if(m.mode==='player'||(me?.role==='child')){if(m.game==='pong'){if(previous!==m.code||!$('#pongCanvas'))pong()}else if(previous!==m.code||!$('#road'))race();else updateRaceStatus()}else{if(m.game==='pong'){if(previous!==m.code||!$('#pongCanvas'))pong()}else if(previous!==m.code||!$('#road'))spectate();else updateRaceStatus()}send({type:'peers'})}
if(m.type==='frame'&&room?.code===m.roomCode||m.type==='frame'&&room?.game==='race'&&m.game!=='pong'&&room){frame=m;if(room?.game==='pong')drawPongFrame(m);if(room?.mode==='spectator')renderSpectatorScore(m);const el=$('#clock');if(el)el.textContent=m.remaining+'s';const mine=m.players.find(p=>p.id===me?.id);if(mine){if(Number.isInteger(mine.ackSeq)&&mine.ackSeq===inputSeq)desiredLane=mine.lane;const points=$('#points');if(points)points.textContent=mine.score} }
if(m.type==='finished'){const lines=m.ranking.map((p,i)=>(i+1)+'º '+p.name+' — '+p.score+' pontos').join(' | ');notify('Fim da corrida! '+lines);const el=$('#finish');if(el){el.textContent=lines;el.style.display='flex'}}
if(m.type==='error')notify(m.message);
if(m.type==='notice')notify(m.text);
if(m.type==='notice'&&me?.role==='admin'){notify(m.text);if(Notification.permission==='granted')new Notification('GamesForChildren',{body:m.text})}
if(m.type==='adminUpdate'&&me?.role==='admin')refreshAdmin();
if(m.type==='npcAudit'&&me?.role==='admin')appendNpcAudit(m.event);
if(m.type==='peers'){for(const p of m.items)if(p.id!==myId)maybeCall(p)}
if(m.type==='peerLeft')hangupPeer(m.id);
if(m.type==='voiceReady'&&voiceStream)maybeCall({id:m.id,name:m.name});
if(m.type==='signal')handleSignal(m);
};socket.onerror=()=>{if(ws!==socket)return;const label=$('#connectionStatus');if(label)label.textContent='Falha na conexão em tempo real'};socket.onclose=()=>{if(ws!==socket)return;for(const id of [...connections.keys()])hangupPeer(id);updateVoiceDock();const label=$('#connectionStatus');if(label)label.textContent='Reconectando...';if(me){clearTimeout(wsRetry);wsRetry=setTimeout(()=>{if(me)connect()},2500)}}}
function renderLobby(rooms){const el=$('#availableRooms');if(!el)return;rooms=rooms.filter(r=>r.game==='pong');el.innerHTML=rooms.length?rooms.map(r=>'<div class="lobby-room"><div><strong>'+esc(r.host)+'</strong><span> criou Pong Neon</span></div><button data-room="'+esc(r.code)+'">Entrar</button></div>').join(''):'<p class="hint">Nenhuma partida aguardando. Crie uma e convide um amigo!</p>';el.querySelectorAll('button').forEach(b=>b.onclick=()=>send({type:'join',code:b.dataset.room}))}
function home(){pongCanvasObserver?.disconnect();pongCanvasObserver=null;ensureVoiceDock();stopSnake();cancelAnimationFrame(pongRaf);pongPadDirection=0;if(!me)return login();if(me.role==='admin')return admin();room=null;cancelAnimationFrame(drawId);app.innerHTML=box(renderTop()+'<p id="connectionStatus" class="hint">'+(ws?.readyState===1?'Conectado':'Conectando...')+'</p><h1>Escolha sua aventura</h1><div class="grid"><div class="game-card game-card--cover card-pong"><span class="art">'+ico('gamepad')+'</span><h2>Pong Neon</h2><p class="sub">Controle sua raquete e não deixe a bola passar.</p><div class="row"><button data-game="pong" data-solo="true">Sozinho</button><button class="success" data-game="pong" data-solo="false">Em dupla</button></div></div><div class="game-card game-card--cover card-snake"><span class="art">'+ico('star')+'</span><h2>Cobrinha Colorida</h2><p class="sub">Pegue as estrelas e cresça!</p><button id="snakeSolo">Jogar sozinho</button></div><div class="game-card game-card--cover card-minecraft"><span class="art">'+ico('gamepad')+'</span><h2>OpusCraft</h2><p class="sub">Explore o mundo familiar permanente com animais, construções e inventário — OpusCraft.</p><button id="openOpusCraft" class="success">Jogar OpusCraft</button></div></div><section class="panel" style="margin-top:18px"><h2>Partidas de Pong disponíveis</h2><div id="availableRooms">Procurando partidas...</div><details><summary>Entrar pelo código</summary><div class="row"><input id="code" maxlength="6" placeholder="Código"><button id="join">Entrar</button></div></details></section>');bindLogout();app.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>send({type:'create',game:b.dataset.game,solo:b.dataset.solo==='true'}));$('#snakeSolo').onclick=snake;$('#openOpusCraft').onclick=openOpusCraft;$('#join').onclick=()=>send({type:'join',code:$('#code').value.toUpperCase()});send({type:'lobby'})}

async function verifyOpuscraftWebSocket(){
 // Probe the exact public WebSocket route. A normal game-lobby socket replies
 // with {type:'hello'}, while the actual OpusCraft relay must send {t:'worlds'}.
 const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws?opus=1&role=list';
 const timeoutMs=7000;
 for(let attempt=0;attempt<2;attempt++){
  try{
   return await new Promise((resolve,reject)=>{
    let socket,complete=false;
    const finish=(error)=>{
     if(complete)return;
     complete=true;clearTimeout(timer);
     if(socket&&socket.readyState<2)socket.close(1000,'preflight');
     error?reject(error):resolve(true);
    };
    const timer=setTimeout(()=>finish(new Error('O servidor não respondeu ao WebSocket da família.')),timeoutMs);
    try{
     socket=new WebSocket(url);
     socket.onmessage=event=>{
      let message;
      try{message=JSON.parse(event.data)}catch{finish(new Error('O proxy retornou dados incompatíveis com OpusCraft.'));return}
      if(message?.t==='worlds'&&Array.isArray(message.worlds)){
       if(message.worlds.length)finish();
       else finish(new Error('O servidor multiplayer ainda não anunciou o mundo da família.'));
      }else finish(new Error('A rota WebSocket está conectando ao serviço errado, não ao OpusCraft.'));
     };
     socket.onerror=()=>finish(new Error('Não foi possível conectar ao WebSocket multiplayer da VPS.'));
     socket.onclose=()=>finish(new Error('O WebSocket multiplayer foi encerrado antes de receber o mundo.'));
    }catch(error){finish(new Error('Este navegador não conseguiu abrir o WebSocket do jogo.'))}
   });
  }catch(error){
   if(attempt===1)throw error;
   await new Promise(resolve=>setTimeout(resolve,850));
  }
 }
}
async function openOpusCraft(){
 if(!me)return login();
 // O bloqueio de orientação só funciona em navegadores que permitem fullscreen.
 // Fazemos a tentativa no gesto de clique, antes de qualquer await.
 const fullscreen=async()=>{
  try{
   if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen({navigationUI:'hide'});
   if(screen.orientation?.lock)await screen.orientation.lock('landscape');
  }catch(e){console.info('Este navegador pede para girar manualmente:',e?.name||e)}
 };
 void fullscreen();
 try{
  const status=await api('opuscraft/status');
  if(!status.available){notify('Os arquivos do OpusCraft ainda não foram instalados.');return}
  // O menu e os mundos individuais funcionam mesmo se o servidor familiar estiver reiniciando.
  if(room){send({type:'leave'});room=null}
  stopSnake();cancelAnimationFrame(pongRaf);cancelAnimationFrame(drawId);
  app.innerHTML='<main class="opuscraft-embed" id="cubeRoot" aria-label="OpusCraft em tela horizontal">'+
  '<iframe id="opuscraftFrame" src="/opuscraft/index.html?v='+encodeURIComponent(status.clientVersion||'live')+'&t='+Date.now()+'" title="OpusCraft — mundo da família" allow="fullscreen; gamepad" referrerpolicy="same-origin"></iframe>'+
  '<button id="opuscraftBack" class="opuscraft-exit" aria-label="Voltar à biblioteca">'+ico('left')+' Sair</button>'+
  '<div id="opuscraftRotate" class="opuscraft-rotate" aria-live="polite"><strong>Vire o celular na horizontal</strong><p>Assim você consegue ver o mundo e os controles.</p><button id="opuscraftTryLandscape">Ativar tela horizontal</button></div>'+
  '<section class="opuscraft-players" id="opusPlayersDock" hidden><button id="opusPlayersToggle" type="button">👥 Jogadores / Teleporte</button><div id="opusPlayersPanel" hidden><h3>Família no mesmo mundo</h3><div id="opusPlayersList" role="status"></div>'+ (me?.role==='admin'?'<div class="opus-player"><div><strong>🌿 Andarilha</strong><small>Personagem autônoma do servidor</small></div><button id="opusNpcVisit" type="button">Ir até ela</button></div>':'')+'</div></section>'+ 
  '<section class="opuscraft-chat"><button id="familyChatToggle" type="button">💬 Conversar</button><div id="familyChatPanel" hidden><h3>Conversa da família</h3><div id="familyChatHistory" role="log" aria-live="polite"></div><form id="familyChatForm"><input id="familyChatInput" maxlength="180" autocomplete="off" placeholder="Mensagem para a família"><button type="submit">Enviar</button></form></div></section></main>';
  const gameFrame=$('#opuscraftFrame');
  gameFrame.addEventListener('load',()=>{
   // The launch button remains focused in the parent document on desktops.
   // Hand input control to the same-origin ClassiCube iframe after its navigation.
   if(window.matchMedia('(pointer:fine)').matches){
    try{gameFrame.contentWindow.focus();gameFrame.contentDocument?.getElementById('gl')?.focus({preventScroll:true})}catch{}
   }
  });
  const root=$('#cubeRoot'),overlay=$('#opuscraftRotate');
  const playersDock=$('#opusPlayersDock'),playersPanel=$('#opusPlayersPanel'),playersList=$('#opusPlayersList');
  let rosterBusy=false;
  async function showFamilyPlayers(){
   if(rosterBusy||playersPanel.hidden||playersDock.hidden)return;
   rosterBusy=true;
   try{
    const result=await api('opuscraft/players');
    if(!playersList.isConnected)return;
    const meInWorld=result.players.find(p=>p.self);
    if(!meInWorld){playersList.textContent='Você ainda está entrando no servidor da família.';return}
    const same=result.players.filter(p=>!p.self&&p.dimension===meInWorld.dimension);
    playersList.innerHTML=same.length?same.map(p=>'<div class="opus-player"><div><strong>'+esc(p.name)+'</strong><small> X '+p.x+' • Y '+p.y+' • Z '+p.z+'</small></div><button type="button" data-tp="'+esc(p.id)+'">Ir até</button></div>').join(''):'Nenhum outro jogador conectado nesta dimensão.';
    for(const btn of playersList.querySelectorAll('button[data-tp]')){
     btn.onclick=async()=>{
      btn.disabled=true;
      try{await api('opuscraft/teleport','POST',{to:btn.dataset.tp});notify('Teleporte realizado!')}
      catch(e){notify(e.message)}
      finally{btn.disabled=false}
     };
    }
   }catch(e){if(playersList.isConnected)playersList.textContent='Jogadores indisponíveis: '+e.message}
   finally{rosterBusy=false}
  }
  const npcVisit=$('#opusNpcVisit');
  if(npcVisit)npcVisit.onclick=async()=>{
   npcVisit.disabled=true;
   try{
    const status=await api('admin/opuscraft/npc');
    if(!status.ready)throw Error('A personagem ainda está preparando o seu cantinho.');
    await api('admin/opuscraft/npc/visit','POST',{});
    notify('Você foi até a Andarilha!');
   }catch(e){notify(e.message)}
   finally{npcVisit.disabled=false}
  };
  $('#opusPlayersToggle').onclick=()=>{
   playersPanel.hidden=!playersPanel.hidden;
   if(!playersPanel.hidden)void showFamilyPlayers();
  };
  const modeTimer=setInterval(()=>{
   if(!gameFrame.isConnected){clearInterval(modeTimer);return}
   let mode='';
   try{mode=gameFrame.contentWindow?.__game?.mode||''}catch{}
   const active=mode==='client';
   playersDock.hidden=!active;
   if(!active)playersPanel.hidden=true;
  },1300);
  const rosterTimer=setInterval(()=>void showFamilyPlayers(),6000);

  const sync=()=>{const portrait=window.innerHeight>window.innerWidth&&window.matchMedia('(pointer: coarse)').matches;root.classList.toggle('needs-landscape',portrait);overlay.hidden=!portrait;};
  sync();window.addEventListener('resize',sync);screen.orientation?.addEventListener?.('change',sync);
  $('#opuscraftTryLandscape').onclick=()=>{void fullscreen();sync()};
  $('#familyChatToggle').onclick=()=>{const panel=$('#familyChatPanel');panel.hidden=!panel.hidden;renderFamilyChat();if(!panel.hidden)$('#familyChatInput').focus()};
  $('#familyChatForm').onsubmit=e=>{e.preventDefault();const input=$('#familyChatInput'),message=input.value.trim();if(message&&send({type:'familyChat',text:message})){input.value='';input.blur()}};
  renderFamilyChat();
  $('#opuscraftBack').onclick=async()=>{clearInterval(modeTimer);clearInterval(rosterTimer);window.removeEventListener('resize',sync);screen.orientation?.removeEventListener?.('change',sync);try{screen.orientation?.unlock?.()}catch{};try{if(document.fullscreenElement)await document.exitFullscreen()}catch{};home()};
 }catch(e){console.warn('OpusCraft:',e);notify('Não foi possível abrir o OpusCraft: '+e.message)}
}
function renderFamilyChat(){
 const el=$('#familyChatHistory');if(!el)return;
 el.innerHTML=familyMessages.slice(-45).map(m=>'<p><strong>'+esc(m.name)+'</strong> '+esc(m.text)+'</p>').join('')||'<p>Converse com os jogadores autorizados da família.</p>';
 el.scrollTop=el.scrollHeight;
}
let pongPadDirection=0,pongLocalY=.5,pongLastSend=0,pongRaf=0,pongRender=null,pongVisual=null,pongCanvasObserver=null;
function pong(){
 cancelAnimationFrame(pongRaf);pongCanvasObserver?.disconnect();pongCanvasObserver=null;pongRender=null;pongVisual=null;pongPadDirection=0;pongLocalY=.5;
 app.innerHTML='<main class="mini-game pong-game"><header class="mini-header"><button id="back" class="ghost" aria-label="Voltar à biblioteca">'+ico('left')+'</button><div class="mini-title"><small>ARCADE</small><strong>PONG NEON</strong></div><div class="mini-time">'+ico('clock')+' <b id="clock">60s</b></div><button id="voice" aria-label="Ativar voz">'+ico('mic')+'</button><button id="mute" disabled aria-label="Silenciar">Silenciar</button></header><div class="mini-stage pong-stage"><canvas id="pongCanvas" width="360" height="560" aria-label="Pong: arraste ou use os botões para mover a raquete"></canvas><div class="pong-score" id="pongLiveScore">0 <span>:</span> 0</div><div class="pong-serve" id="pongServe" hidden>PREPARE-SE</div><div id="waiting" class="mini-overlay"><div class="wait-card"><span class="wait-label">PONG MULTIPLAYER</span><h2>Esperando seu rival</h2><p>Compartilhe a sala</p><b>'+esc(room.code)+'</b></div></div><div id="finish" class="mini-overlay" style="display:none"></div></div><footer class="pong-controls"><button id="pongUp" aria-label="Subir raquete">'+ico('up')+' SUBIR</button><span>Arraste na quadra ou use os botões</span><button id="pongDown" aria-label="Descer raquete">'+ico('down')+' DESCER</button></footer><div id="voiceStatus" class="mini-voice-status">Microfone desligado</div></main>';
 $('#back').onclick=()=>{cancelAnimationFrame(pongRaf);pongCanvasObserver?.disconnect();pongCanvasObserver=null;pongPadDirection=0;send({type:'leave'});room=null;home()};
 $('#voice').onclick=toggleVoice;$('#mute').onclick=toggleMute;
 const canvas=$('#pongCanvas'),stage=canvas.parentElement;
 // Use an exact 360:560 CSS box; object-fit letterboxing would desynchronise taps and collisions.
 const fitPong=()=>{if(!canvas.isConnected)return;const scale=Math.min(stage.clientWidth/360,stage.clientHeight/560);if(scale>0){canvas.style.width=Math.floor(360*scale)+'px';canvas.style.height=Math.floor(560*scale)+'px'}};
 fitPong();if(typeof ResizeObserver!=='undefined'){pongCanvasObserver=new ResizeObserver(fitPong);pongCanvasObserver.observe(stage)}
 const setPaddle=y=>{if(room?.mode==='spectator')return;pongLocalY=Math.max(.13,Math.min(.87,y));const n=performance.now();if(n-pongLastSend>30){pongLastSend=n;send({type:'paddle',y:pongLocalY})}};
 const touch=e=>{e.preventDefault();const r=canvas.getBoundingClientRect();setPaddle((e.clientY-r.top)/r.height)};
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture?.(e.pointerId);touch(e)});
 canvas.addEventListener('pointermove',e=>{if(e.buttons||e.pressure)touch(e)});
 const bind=(id,d)=>{const button=$(id);button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);pongPadDirection=d},{passive:false});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{if(pongPadDirection===d)pongPadDirection=0})};
 bind('#pongUp',-1);bind('#pongDown',1);
 updateRaceStatus();function animate(){if(!$('#pongCanvas')||room?.game!=='pong')return;if(pongPadDirection&&room?.started&&room?.mode!=='spectator')setPaddle(pongLocalY+pongPadDirection*.012);paintPong();pongRaf=requestAnimationFrame(animate)}animate();
}
function drawPongFrame(m){
 if(room?.game!=='pong')return;
 const previous=pongRender?.data;
 // A scoring reset or a real wall/paddle rebound cannot be interpolated as a straight line.
 const newRally=!previous||previous.round!==m.round||previous.bounceId!==m.bounceId||previous.phase!==m.phase;
 if(newRally)pongVisual={x:m.ball.x,y:m.ball.y};
 pongRender={data:m,at:performance.now(),newRally};
 const serve=$('#pongServe');
 if(serve){serve.hidden=m.phase!=='serve';serve.textContent=m.round===1?'COMEÇA EM '+m.serveRemaining:'NOVO SAQUE EM '+m.serveRemaining}
 const scores=$('#pongLiveScore');
 if(scores)scores.innerHTML=(m.players[0]?.score??0)+' <span>:</span> '+(m.players[1]?.score??0);
 if(room?.started){const waiting=$('#waiting');if(waiting)waiting.hidden=true}
}
function paintPong(){
 const cv=$('#pongCanvas');if(!cv)return;const ctx=cv.getContext('2d'),w=cv.width,h=cv.height;
 const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#0d0f32');g.addColorStop(.55,'#1b164c');g.addColorStop(1,'#260a48');
 ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#ffffff09';ctx.lineWidth=1;
 for(let x=0;x<w;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
 for(let y=0;y<h;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 ctx.strokeStyle='#66aaff55';ctx.lineWidth=3;ctx.setLineDash([8,14]);ctx.beginPath();ctx.moveTo(w/2,30);ctx.lineTo(w/2,h-20);ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle='#714bcc77';ctx.lineWidth=2;ctx.strokeRect(5,5,w-10,h-10);
 if(!pongRender)return;
 const m=pongRender.data,ids=room?.players?.map(p=>p.id)||[];
 const index=ids.indexOf(me?.id),spectator=room?.mode==='spectator';
 for(let i=0;i<2;i++){
  const data=m.players.find(p=>p.id===ids[i]);
  const y=Math.max(.12,Math.min(.88,(!spectator&&index===i)?pongLocalY:(data?.paddle??m.aiPaddle??.5)))*h;
  const x=i===0?22:w-22,col=i===0?'#38f7e2':'#ff53b6';
  ctx.shadowColor=col;ctx.shadowBlur=25;ctx.fillStyle=col;ctx.beginPath();ctx.roundRect(x-7,y-48,14,96,7);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#ffffffa8';ctx.beginPath();ctx.roundRect(x-3,y-40,3,80,2);ctx.fill();
 }
 // Rendering never shows the ball behind the contact plane, even between network packets.
 // A confirmed rebound resets prediction immediately, preventing lerp across the paddle.
 const left=Number.isFinite(m.limits?.left)?m.limits.left:38/360;
 const right=Number.isFinite(m.limits?.right)?m.limits.right:322/360;
 const elapsed=m.phase==='play'?Math.min(.032,(performance.now()-pongRender.at)/1000):0;
 let tx=m.ball.x+m.ball.vx*elapsed,ty=m.ball.y+m.ball.vy*elapsed;
 tx=Math.max(left,Math.min(right,tx));
 ty=Math.max(9/560,Math.min(1-9/560,ty));
 if(!pongVisual)pongVisual={x:tx,y:ty};
 const factor=m.phase==='serve'?1:.75;
 pongVisual.x+=((tx-pongVisual.x)*factor);
 pongVisual.y+=((ty-pongVisual.y)*factor);
 pongVisual.x=Math.max(left,Math.min(right,pongVisual.x));
 pongVisual.y=Math.max(9/560,Math.min(1-9/560,pongVisual.y));
 const bx=pongVisual.x*w,by=pongVisual.y*h;
 // Skip the historical trail on the first frame after a bounce/serve; old velocity
 // could otherwise paint a glowing ball on the wrong side of the paddle.
 if(m.phase==='play'&&!pongRender.newRally){
  for(let i=5;i>=0;i--){
   const px=Math.max(left*w,Math.min(right*w,bx-m.ball.vx*w*(.012*i)));
   const py=Math.max(9,Math.min(h-9,by-m.ball.vy*h*(.012*i)));
   ctx.globalAlpha=(6-i)/24;ctx.fillStyle='#ffdd67';ctx.beginPath();ctx.arc(px,py,8+i*.7,0,Math.PI*2);ctx.fill();
  }
 }
 ctx.globalAlpha=1;ctx.shadowColor='#f9df59';ctx.shadowBlur=28;ctx.fillStyle='#fff9bf';
 ctx.beginPath();ctx.arc(bx,by,9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 pongRender.newRally=false;
}

let snakeTimer=null,snakeRaf=0,snakeKeyHandler=null;
function stopSnake(){clearInterval(snakeTimer);cancelAnimationFrame(snakeRaf);snakeTimer=null;snakeRaf=0;if(snakeKeyHandler){window.removeEventListener('keydown',snakeKeyHandler);snakeKeyHandler=null}}
function snake(){
 stopSnake();room=null;const cols=20,rows=25,unit=20;let body,dir,next,food,score,over=false,sparkles=[];
 const key='gfc-snake-best-'+(me?.id||'guest');let best=0;try{best=Number(localStorage.getItem(key)||0)}catch{}
 app.innerHTML='<main class="mini-game snake-game"><header class="mini-header"><button id="back" aria-label="Sair">'+ico('left')+'</button><div class="mini-title"><small>CLASSIC ARCADE</small><strong>COBRINHA</strong></div><div class="snake-stat"><b id="snakeScore">0</b><small>PONTOS</small></div><div class="snake-stat"><b id="snakeBest">'+best+'</b><small>RECORDE</small></div></header><div class="mini-stage snake-stage"><canvas id="snakeCanvas" width="400" height="500"></canvas><div id="snakeEnd" class="mini-overlay" hidden><div class="wait-card"><span class="wait-label">FIM DE JOGO</span><h2 id="snakeEndTitle">Boa tentativa!</h2><p id="snakeEndScore"></p><button id="snakeAgain">Jogar novamente</button></div></div></div><footer class="snake-controls"><button id="snakeUp" data-dir="up" aria-label="Subir">'+ico('up')+'</button><div><button data-dir="left" aria-label="Esquerda">'+ico('left')+'</button><button data-dir="down" aria-label="Descer">'+ico('down')+'</button><button data-dir="right" aria-label="Direita">'+ico('right')+'</button></div></footer><div class="mini-voice-status">Use as setas ou deslize. Atravesse as bordas!</div></main>';
 const cv=$('#snakeCanvas'),g=cv.getContext('2d');
 const spawnFood=()=>{for(let tries=0;tries<1000;tries++){const p={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)};if(!body.some(b=>b.x===p.x&&b.y===p.y))return p}return{x:10,y:12}};
 const restart=()=>{body=[{x:9,y:13},{x:8,y:13},{x:7,y:13},{x:6,y:13}];dir={x:1,y:0};next=dir;score=0;over=false;sparkles=[];food=spawnFood();$('#snakeEnd').hidden=true;$('#snakeScore').textContent='0';clearInterval(snakeTimer);snakeTimer=setInterval(step,124)};
 const change=(x,y)=>{if(over)return;if((x===-dir.x&&y===-dir.y)||(x===0&&y===0))return;next={x,y}};
 const mapping={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
 app.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();const [x,y]=mapping[b.dataset.dir];change(x,y)},{passive:false}));
 let startPoint=null;
 cv.addEventListener('pointerdown',e=>{startPoint={x:e.clientX,y:e.clientY}});
 cv.addEventListener('pointerup',e=>{if(!startPoint)return;const dx=e.clientX-startPoint.x,dy=e.clientY-startPoint.y;if(Math.max(Math.abs(dx),Math.abs(dy))>18)change(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0,Math.abs(dy)>=Math.abs(dx)?Math.sign(dy):0);startPoint=null});
 snakeKeyHandler=e=>{const keyMap={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};const d=keyMap[e.key];if(d&&$('#snakeCanvas')){e.preventDefault();change(...mapping[d])}};
 window.addEventListener('keydown',snakeKeyHandler);
 $('#back').onclick=()=>{stopSnake();home()};
 $('#snakeAgain').onclick=restart;
 function endGame(){over=true;clearInterval(snakeTimer);$('#snakeEndTitle').textContent=score>=best&&score>0?'Novo recorde!':'Boa tentativa!';$('#snakeEndScore').textContent=score+' pontos';$('#snakeEnd').hidden=false}
 function step(){
  if(over)return;dir=next;const head=window.nextSnakeCell(body[0],dir,cols,rows);
  const eating=head.x===food.x&&head.y===food.y;
  if(body.slice(0,eating?body.length:-1).some(p=>p.x===head.x&&p.y===head.y)){endGame();return}
  body.unshift(head);if(eating){score+=10;$('#snakeScore').textContent=score;if(score>best){best=score;$('#snakeBest').textContent=best;try{localStorage.setItem(key,String(best))}catch{}}for(let j=0;j<14;j++)sparkles.push({x:food.x*unit+10,y:food.y*unit+10,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:1});food=spawnFood()}else body.pop()
 }
 function star(cx,cy,outer,inner){g.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?inner:outer;g.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)}g.closePath()}
 function render(){
  if(!$('#snakeCanvas'))return;const t=performance.now()*.003;
  const grad=g.createLinearGradient(0,0,400,500);grad.addColorStop(0,'#10284a');grad.addColorStop(1,'#17245a');g.fillStyle=grad;g.fillRect(0,0,400,500);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){g.fillStyle=(x+y)%2===0?'#ffffff06':'#0b234317';g.fillRect(x*unit,y*unit,unit,unit)}
  g.strokeStyle='#64c7df30';g.strokeRect(2,2,396,496);
  const pulse=1+Math.sin(t*3)*.11;g.shadowColor='#ffe079';g.shadowBlur=23;g.fillStyle='#ffe66a';star(food.x*unit+10,food.y*unit+10,8.5*pulse,4.3*pulse);g.fill();g.shadowBlur=0;
  for(let i=body.length-1;i>=0;i--){const p=body[i],cx=p.x*unit+10,cy=p.y*unit+10;g.fillStyle=i===0?'#53faaf':i%2?'#26cdb0':'#41e0be';g.shadowColor=i===0?'#7effd0':'#18bfa8';g.shadowBlur=i===0?15:5;g.beginPath();g.roundRect(p.x*unit+1.6,p.y*unit+1.6,16.8,16.8,5);g.fill();g.shadowBlur=0;if(i===0){g.fillStyle='#123851';const ox=dir.x*3,oy=dir.y*3;g.beginPath();g.arc(cx-3+ox,cy-3+oy,1.75,0,Math.PI*2);g.arc(cx+3+ox,cy-3+oy,1.75,0,Math.PI*2);g.fill()}}
  for(const p of sparkles){p.x+=p.vx;p.y+=p.vy;p.life-=.028;g.globalAlpha=Math.max(0,p.life);g.fillStyle='#ffed84';g.fillRect(p.x,p.y,4,4)}g.globalAlpha=1;sparkles=sparkles.filter(p=>p.life>0);
  snakeRaf=requestAnimationFrame(render)
 }
 restart();render()
}
function updateRaceStatus(){const waiting=$('#waiting');if(waiting)waiting.hidden=Boolean(room?.started);const label=$('#raceMode');if(label)label.textContent=room?.started?'Corrida acontecendo':'Esperando outro jogador';}
function race(){if(!room)return;cancelAnimationFrame(drawId);app.innerHTML='<main class="race-screen" role="main"><header class="race-top"><button id="back" class="race-exit" aria-label="Voltar à biblioteca">'+ico('left')+'</button><div class="race-brand"><span>RACE</span><strong>60</strong></div><div class="race-score"><span class="race-metric">'+ico('clock')+' <b id="clock">60s</b></span><span class="race-metric">'+ico('star')+' <b id="points">0</b></span></div><div class="race-sound"><button id="voice" class="race-voice" aria-label="Ativar voz">'+ico('mic')+'</button><button id="mute" class="race-voice" disabled>Silenciar</button></div></header><section class="race-track" aria-label="Corrida"><div class="race-sky"><div class="race-sun"></div><div class="race-cloud one"></div><div class="race-cloud two"></div><div class="race-horizon"></div></div><canvas id="road" width="360" height="640" aria-label="Pista de corrida com três faixas"></canvas><div class="race-edge race-edge-left"></div><div class="race-edge race-edge-right"></div><div id="waiting" class="race-overlay"><div class="wait-card"><span class="wait-label">MULTIPLAYER</span><h2>Seu rival está chegando!</h2><p>Esperando outro piloto entrar na corrida</p><b>'+esc(room.code)+'</b></div></div><div id="finish" class="race-overlay" style="display:none"></div></section><footer class="race-controls"><button id="left" aria-label="Mover para esquerda">'+ico('left')+'<span>ESQUERDA</span></button><div class="race-control-center"><strong id="raceMode">CORRIDA MALUCA</strong><small id="voiceStatus">Microfone desligado</small></div><button id="right" aria-label="Mover para direita">'+ico('right')+'<span>DIREITA</span></button></footer></main>';bindSteering();$('#back').onclick=()=>{send({type:'leave'});room=null;home()};$('#voice').onclick=toggleVoice;$('#mute').onclick=toggleMute;updateRaceStatus();draw()}
let drawId=0;function draw(){cancelAnimationFrame(drawId);const canvas=$('#road');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;let t=0;
function car(x,y,color,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle='#151b35';ctx.fillRect(-29,-39,9,80);ctx.fillRect(20,-39,9,80);ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-23,-45,46,94,13);ctx.fill();ctx.fillStyle='#ffffff55';ctx.beginPath();ctx.roundRect(-17,-33,34,30,7);ctx.fill();ctx.fillStyle='#11335b';ctx.beginPath();ctx.roundRect(-15,-28,30,24,6);ctx.fill();ctx.fillStyle='#ffe4a3';ctx.fillRect(-18,-40,11,7);ctx.fillRect(7,-40,11,7);ctx.fillStyle='#ff4054';ctx.fillRect(-18,38,10,5);ctx.fillRect(8,38,10,5);ctx.restore()}
function paint(){if(!$('#road')||!room)return;t++;const horizon=90;const topWidth=105;ctx.clearRect(0,0,w,h);const ground=ctx.createLinearGradient(0,horizon,0,h);ground.addColorStop(0,'#6bdd69');ground.addColorStop(1,'#299655');ctx.fillStyle=ground;ctx.fillRect(0,0,w,h);for(let side of [-1,1]){for(let i=0;i<12;i++){const yy=((i*94+t*4)%(h+140))-50;const x=side<0?12:w-12;ctx.fillStyle=i%2?'#318d55':'#46b15c';ctx.beginPath();ctx.arc(x,yy,16+yy/h*25,0,Math.PI*2);ctx.fill()}}ctx.beginPath();ctx.moveTo(w/2-topWidth/2,horizon);ctx.lineTo(w/2+topWidth/2,horizon);ctx.lineTo(w-12,h);ctx.lineTo(12,h);ctx.closePath();const road=ctx.createLinearGradient(0,horizon,0,h);road.addColorStop(0,'#545c79');road.addColorStop(1,'#2a304b');ctx.fillStyle=road;ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#ffe692';ctx.lineWidth=5;for(let i=1;i<3;i++){for(let j=0;j<13;j++){let progress=((j/13+t*.015)%1);progress*=progress;let yy=horizon+progress*(h-horizon);let half=topWidth/2+(w/2-12-topWidth/2)*progress;let xx=w/2-half+half*2*i/3;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx,yy+5+progress*39);ctx.stroke()}}for(const o of frame?.obstacles||[]){const prog=Math.max(0,Math.min(1,o.progress));const y=horizon+prog*prog*(h-horizon-45);const half=topWidth/2+(w/2-12-topWidth/2)*prog*prog;const x=w/2-half+(o.lane+.5)*(half*2/3);const sc=.35+prog*.9;ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);ctx.fillStyle='#f0832e';ctx.beginPath();ctx.roundRect(-24,-24,48,48,8);ctx.fill();ctx.fillStyle='#fff3bd';ctx.fillRect(-17,-15,34,10);ctx.fillStyle='#a74328';ctx.fillRect(-21,13,42,7);ctx.restore()}const mine=frame?.players?.find(p=>p.id===me?.id);const isSpectator=room?.mode==='spectator';if(isSpectator){for(const [i,p] of (frame?.players||[]).entries())car(w/6+(w/3)*p.lane,h-85-(i*120),i?'#38bdfa':'#ff4e68',.92)}else{const lane=desiredLane;car(w/6+(w/3)*lane,h-84,'#ff4e68',1.12)}drawId=requestAnimationFrame(paint)}paint()}
function move(d){if(!room?.started||room.finished)return;const time=performance.now();if(time-lastLaneInput<95)return;lastLaneInput=time;const lane=Math.min(2,Math.max(0,desiredLane+d));if(lane===desiredLane)return;desiredLane=lane;inputSeq++;send({type:'lane',lane,seq:inputSeq});}
function bindSteering(){for(const [selector,dir] of [['#left',-1],['#right',1]]){const btn=$(selector);if(!btn)continue;btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);btn.classList.add('pressed');move(dir)},{passive:false});for(const event of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(event,()=>btn.classList.remove('pressed'));btn.addEventListener('contextmenu',e=>e.preventDefault())}}
window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(!$('#road')||e.repeat)return;e.preventDefault();move(e.key==='ArrowLeft'?-1:1)}});
async function admin(){app.innerHTML=box(renderTop()+'<h1>'+ico('user')+' Painel dos pais</h1><p id="voiceTurnStatus" class="hint">'+(turnReady===true?'Conexão de voz preparada.':turnReady===false?'TURN não configurado; áudio pode falhar entre redes diferentes.':'Verificando a rede do áudio...')+'</p><p class="sub">Acompanhe o tempo, os acessos e entre nas salas de voz.</p><div class="row"><button id="add">+ Criar perfil infantil</button><button id="notifications" class="ghost">'+ico('bell')+' Ativar notificações</button></div><section id="adminContent" class="grid" style="margin-top:18px"></section><h2 style="margin-top:22px">Jogar</h2><div class="row admin-game-actions"><button id="adminPongSolo" class="success">Pong solo</button><button id="adminPongDuo">Pong em dupla</button><button id="adminSnake">Cobrinha</button><button id="adminOpusCraft" class="success">Jogar OpusCraft</button></div><h2 style="margin-top:22px">Central OpusCraft — Controle ADM</h2><div id="adminMinecraftDashboard" class="minecraft-admin-dashboard"><p>Carregando mundos e jogadores...</p></div><h2 style="margin-top:22px">Monitor da Andarilha</h2><section id="adminNpcAudit" class="panel npc-audit"><p class="sub">Buscando histórico de decisões...</p></section><h2 style="margin-top:22px">Capas dos jogos</h2><p class="sub">Troque a imagem de cada jogo sem mexer no código. Use fotos em JPG, PNG ou WebP.</p><div id="adminCovers" class="admin-covers"></div><h2 style="margin-top:22px">Salas em andamento</h2><div id="adminRooms"></div><h2 style="margin-top:22px">Atividades recentes</h2><div id="events" class="panel"></div>');bindLogout();$('#add').onclick=async()=>{const name=prompt('Nome da criança:');if(!name)return;const password=prompt('PIN de acesso (pelo menos 4 caracteres):');if(!password)return;try{await api('admin/users','POST',{name,password});refreshAdmin()}catch(e){notify(e.message)}};$('#notifications').onclick=setupPush;$('#adminPongSolo').onclick=()=>send({type:'create',game:'pong',solo:true});$('#adminPongDuo').onclick=()=>send({type:'create',game:'pong',solo:false});$('#adminSnake').onclick=snake;$('#adminOpusCraft').onclick=openOpusCraft;npcAuditHistory=[];npcAuditCursor=0;refreshAdmin();refreshGameCovers();refreshMinecraftDashboard();void refreshNpcAudit();clearInterval(adminTimer);adminTimer=setInterval(()=>{if(me?.role==='admin'){refreshAdmin();if(!$('#adminMinecraftDashboard')?.querySelector('input:focus'))refreshMinecraftDashboard();if(!document.hidden)void refreshNpcAudit()}},15000)}
async function refreshAdmin(){if(me?.role!=='admin'||!$('#adminContent'))return;try{const data=await api('admin/overview');$('#adminContent').innerHTML=data.users.map(u=>'<div class="panel child-card"><div class="child-head"><div class="avatar">'+(u.hasPhoto?'<img loading="lazy" alt="Foto de '+esc(u.name)+'" src="/api/photos/'+encodeURIComponent(u.id)+'">':ico('user'))+'</div><div><strong>'+esc(u.name)+'</strong><div class="'+(u.online?'online':'offline')+'">'+(u.online?'● Online':'○ Offline')+'</div></div></div><p class="stats">'+Math.floor(u.usedSeconds/60)+' / '+u.dailyLimit+' minutos</p><div class="meter"><div style="width:'+Math.min(100,(u.usedSeconds/(u.dailyLimit*60||1))*100)+'%"></div></div><div class="actions"><button data-id="'+u.id+'" data-action="kick" class="danger">Deslogar</button><button data-id="'+u.id+'" data-action="enable" class="ghost">'+(u.enabled?'Bloquear':'Liberar')+'</button><button data-id="'+u.id+'" data-action="login" class="ghost">Login '+(u.loginEnabled?'ON':'OFF')+'</button><button data-id="'+u.id+'" data-action="voice" class="ghost">Voz '+(u.voiceEnabled?'ON':'OFF')+'</button><button data-id="'+u.id+'" data-action="limit" class="ghost">'+ico('clock')+' Limite</button></div></div>').join('')||'<div class="panel">Cadastre o primeiro perfil.</div>';
$('#adminRooms').innerHTML=data.rooms.filter(r=>r.game==='pong').map(r=>'<div class="record"><strong>'+ico('gamepad')+' '+esc(r.code)+'</strong><p class="sub">'+r.players.map(esc).join(' × ')+'</p><div class="row"><button data-room="'+esc(r.code)+'" data-mode="spectator">Assistir ao vivo</button><button data-room="'+esc(r.code)+'" data-mode="player" class="success" '+(r.started||r.players.length>=2?'disabled':'')+'>Jogar junto</button></div></div>').join('')||'<div class="panel muted">Nenhuma sala aberta</div>';
$('#events').innerHTML=data.events.slice(0,12).map(e=>'<p>• '+esc(e.name)+' — '+esc(e.type)+' <small>'+new Date(e.at).toLocaleString('pt-BR')+'</small></p>').join('')||'Sem atividade recente';
$('#adminContent').querySelectorAll('button').forEach(b=>b.onclick=async()=>{const u=data.users.find(x=>x.id===b.dataset.id);try{if(b.dataset.action==='photo'){await chooseChildPhoto(u);return}if(b.dataset.action==='edit'){const name=prompt('Novo nome:',u.name);if(name===null)return;const password=prompt('Novo PIN (deixe vazio para manter):','');if(password===null)return;await api('admin/users/'+u.id,'POST',{name,...(password?{password}:{})});refreshAdmin();return}if(b.dataset.action==='kick')await api('admin/users/'+u.id+'/kick','POST');if(b.dataset.action==='enable')await api('admin/users/'+u.id,'POST',{enabled:!u.enabled});if(b.dataset.action==='login')await api('admin/users/'+u.id,'POST',{loginEnabled:!u.loginEnabled});if(b.dataset.action==='voice')await api('admin/users/'+u.id,'POST',{voiceEnabled:!u.voiceEnabled});if(b.dataset.action==='limit'){const v=prompt('Limite em minutos por dia (0 a 1440)',String(u.dailyLimit));if(v!==null)await api('admin/users/'+u.id,'POST',{dailyLimit:Number(v)})}refreshAdmin()}catch(e){notify(e.message)}});$('#adminRooms').querySelectorAll('button').forEach(b=>b.onclick=()=>send({type:'join',code:b.dataset.room,mode:b.dataset.mode}));}catch(e){notify(e.message)}}

let npcAuditHistory=[],npcAuditCursor=0,npcAuditBusy=false,npcAuditEnabled=true;
const NPC_ACTION_LABELS={build:'Construir',explore:'Explorar',hide:'Esconder',observe:'Observar'};
const NPC_REASON_LABELS={
 placed_block:'Bloco colocado',visitor_in_build_area:'Jogador na área da obra',
 existing_block_preserved:'Bloco existente preservado',blueprint_finished:'Projeto concluído',
 no_plot:'Aguardando terreno',not_started:'Ainda não iniciou'
};
function appendNpcAudit(item){
 if(!item||!Number.isSafeInteger(Number(item.id))||Number(item.id)<=0)return;
 const id=Number(item.id);
 if(npcAuditHistory.some(e=>Number(e.id)===id))return;
 npcAuditHistory.push(item);
 npcAuditHistory.sort((a,b)=>Number(a.id)-Number(b.id));
 npcAuditHistory=npcAuditHistory.slice(-70);
 npcAuditCursor=Math.max(npcAuditCursor,id);
 renderNpcAudit();
}
function renderNpcAudit(){
 const el=$('#adminNpcAudit');if(!el||me?.role!=='admin')return;
 if(!npcAuditEnabled){
  el.innerHTML='<p class="sub">Histórico MySQL ainda não disponível. Verifique a configuração do banco e a migração.</p>';
  return;
 }
 const events=npcAuditHistory.slice(-40).reverse();
 el.innerHTML='<div class="npc-audit-head"><div><strong>Atividade da IA</strong><small>Atualização ao vivo • histórico por 30 dias</small></div><span class="npc-audit-live">● Ao vivo</span></div>'+
 (events.length?'<div class="npc-audit-list">'+events.map(e=>{
  const d=e.details||{},label=NPC_ACTION_LABELS[e.action]||e.action||'Ação';
  const date=new Date(e.at),at=Number.isNaN(date.getTime())?'':date.toLocaleString('pt-BR');
  let title='',description='',extra='';
  if(e.type==='question'){
   title='Pergunta enviada à Groq';
   description='Modelo: '+esc(d.model||'não informado')+' • Consulta #'+Number(d.number||0);
   extra='<details><summary>Ver pergunta e contexto</summary><p>'+esc(d.system||'')+'</p><pre>'+esc(JSON.stringify(d.input||{},null,2))+'</pre></details>';
  }else if(e.type==='decision'){
   title='Decisão: '+esc(label);
   description=(e.source==='groq'?'Resposta da Groq':'Decisão local')+
    ' • Consulta #'+Number(d.number||0)+(d.error?' • '+esc(d.error):'');
  }else if(e.type==='step'){
   title='Execução: '+esc(label);
   description=esc(NPC_REASON_LABELS[d.reason]||d.reason||'Execução monitorada')+
    ' • '+Number(d.built||0)+' blocos construídos • passo '+Number(d.step||0);
  }else{
   title='Erro da Andarilha';
   description=esc(d.reason||'Erro não especificado');
  }
  return '<article class="npc-audit-entry"><div class="npc-audit-dot '+esc(e.type||'')+'"></div><div class="npc-audit-copy"><div class="npc-audit-title">'+title+'</div><p>'+description+'</p>'+extra+'<small>'+esc(at)+'</small></div></article>';
 }).join('')+'</div>':'<p class="sub">Nenhum evento registrado ainda. Acompanhe a próxima decisão da Andarilha.</p>');
}
async function refreshNpcAudit(){
 if(npcAuditBusy||me?.role!=='admin'||!$('#adminNpcAudit')||document.hidden)return;
 npcAuditBusy=true;
 try{
  const result=await api('admin/opuscraft/npc/events'+(npcAuditCursor?'?after='+npcAuditCursor:''));
  if(!$('#adminNpcAudit'))return;
  npcAuditEnabled=!!result.enabled;
  for(const e of result.events||[])appendNpcAudit(e);
  renderNpcAudit();
 }catch(e){
  const el=$('#adminNpcAudit');
  if(el&&!npcAuditHistory.length)el.innerHTML='<p class="sub">Não foi possível carregar o monitor: '+esc(e.message)+'</p>';
 }finally{npcAuditBusy=false}
}
async function refreshMinecraftDashboard(){
 const el=$('#adminMinecraftDashboard');if(!el||me?.role!=='admin')return;
 try{
  const data=await api('admin/opuscraft/status');if(!el.isConnected)return;
  el.innerHTML='<div class="minecraft-admin-summary">'+
   '<div class="panel"><strong>Servidor OpusCraft</strong><p>'+(data.ready?'Mundo online':'Iniciando')+'</p></div>'+
   '<div class="panel"><strong>Jogadores</strong><p>'+Number(data.guests||0)+'</p></div>'+
   '<div class="panel"><strong>Último salvamento</strong><p>'+(data.lastSave?new Date(data.lastSave).toLocaleTimeString('pt-BR'):'Aguardando')+'</p></div></div>'+
   '<div class="panel"><h3>Um mundo familiar na VPS</h3><p class="sub">Construções e inventários persistidos no navegador administrado pela VPS. O host usa WebGL2 e precisa continuar funcionando para que as crianças joguem juntas.</p>'+
   data.players.map(p=>'<p>● '+esc(p.name)+'</p>').join('')+
   (data.error?'<small>'+esc(data.error)+'</small>':'')+'</div>'+
   '<div class="panel"><h3>Proteção parental</h3><p>Os botões em cada perfil acima controlam limite diário, bloqueio imediato, desconexão e microfone. O chat escrito fica restrito às contas autenticadas.</p></div>';
 }catch(e){el.textContent='Não foi possível consultar o mundo OpusCraft: '+e.message}
}
const GAME_COVER_NAMES={pong:'Pong Neon',snake:'Cobrinha Colorida',minecraft:'OpusCraft'};
async function refreshGameCovers(){
 const el=$('#adminCovers');
 if(!el||me?.role!=='admin')return;
 try{
  const data=await api('admin/game-covers');
  if(!el.isConnected)return;
  el.innerHTML=Object.entries(GAME_COVER_NAMES).map(([slug,name])=>{
   const item=data.covers?.[slug],stamp=Date.now();
   return '<div class="admin-cover-card"><div class="admin-cover-preview" style="background-image:linear-gradient(0deg,rgba(10,17,43,.65),rgba(10,17,43,.05)),url(/api/game-covers/'+slug+'?t='+stamp+')"><strong>'+name+'</strong></div><div class="admin-cover-actions"><span class="hint">'+(item?.custom?'Imagem personalizada':'Imagem original')+'</span><div class="row"><button type="button" data-slug="'+slug+'" data-action="replace" class="success">Trocar imagem</button><button type="button" data-slug="'+slug+'" data-action="reset" class="ghost" '+(item?.custom?'':'disabled')+'>Restaurar padrão</button></div></div></div>'
  }).join('');
  el.querySelectorAll('button').forEach(button=>button.onclick=async()=>{
   const slug=button.dataset.slug;
   if(button.dataset.action==='reset'){
    if(!confirm('Restaurar imagem original de '+GAME_COVER_NAMES[slug]+'?'))return;
    try{button.disabled=true;await api('admin/game-covers/'+slug,'POST',{image:null});notify('Imagem original restaurada');refreshGameCovers()}catch(err){notify(err.message);button.disabled=false}
    return;
   }
   const picker=document.createElement('input');
   picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.style.display='none';document.body.appendChild(picker);
   picker.addEventListener('change',async()=>{
    const file=picker.files?.[0];picker.remove();
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){notify('Selecione JPG, PNG ou WebP de até 12 MB');return}
    try{
     button.disabled=true;
     const img=await createImageBitmap(file);
     const canvas=document.createElement('canvas');
     const ratio=Math.min(1,960/img.width,720/img.height);
     canvas.width=Math.max(1,Math.round(img.width*ratio));
     canvas.height=Math.max(1,Math.round(img.height*ratio));
     let quality=.74,data='';
     for(let i=0;i<6;i++){
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      data=canvas.toDataURL('image/webp',quality);
      if(data.startsWith('data:image/webp;')&&data.length<158000)break;
      quality=Math.max(.27,quality-.1);
      canvas.width=Math.max(220,Math.round(canvas.width*.78));
      canvas.height=Math.max(165,Math.round(canvas.height*.78));
     }
     img.close();
     if(!data.startsWith('data:image/webp;')||data.length>160000)throw Error('Não foi possível compactar a imagem para 120 KB');
     await api('admin/game-covers/'+slug,'POST',{image:data});
     notify('Capa de '+GAME_COVER_NAMES[slug]+' atualizada!');refreshGameCovers();
    }catch(err){notify(err.message||'Não foi possível enviar a imagem');button.disabled=false}
   },{once:true});
   picker.click();
  });
 }catch(err){notify(err.message)}
}
function renderSpectatorScore(m){const el=$('#spectatorScores');if(el)el.innerHTML=m.players.map(p=>'<span>'+esc(room?.players?.find(x=>x.id===p.id)?.name||'Piloto')+': '+p.score+' pts</span>').join('');const clock=$('#clock');if(clock)clock.textContent=m.remaining+'s'}
function spectate(){if(!room)return;app.innerHTML='<main class="race-screen"><header class="race-top"><button id="back" class="race-exit">'+ico('left')+' Voltar</button><strong>AO VIVO — ESPECTADOR</strong><span class="race-metric">'+ico('clock')+' <b id="clock">'+room.remaining+'s</b></span><button id="voice" class="race-voice">'+ico('mic')+' Voz</button></header><section class="race-track"><div class="race-sky"><div class="race-sun"></div></div><canvas id="road" width="360" height="640"></canvas><div id="waiting" class="race-overlay"><div class="wait-card">Aguardando pilotos...</div></div><div id="finish" class="race-overlay" style="display:none"></div></section><footer class="spectator-footer"><div id="spectatorScores"></div><span id="voiceStatus">Microfone desligado</span></footer></main>';$('#back').onclick=()=>{send({type:'leave'});room=null;admin()};$('#voice').onclick=toggleVoice;updateRaceStatus();draw()}
async function chooseChildPhoto(u){
 const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.style.display='none';document.body.appendChild(picker);
 picker.onchange=async()=>{const file=picker.files?.[0];picker.remove();if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){notify('Escolha JPG, PNG ou WebP de até 12 MB');return}
 try{const image=await createImageBitmap(file);const cv=document.createElement('canvas');cv.width=192;cv.height=192;const ctx=cv.getContext('2d');const size=Math.min(image.width,image.height);ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,192,192);image.close();const photo=cv.toDataURL('image/jpeg',.72);await api('admin/users/'+u.id,'POST',{photo});notify('Foto salva no perfil');refreshAdmin()}catch(err){notify(err.message||'Não foi possível salvar a foto')}}
 picker.click();
}
function base64ToUint8(str){const pad='='.repeat((4-str.length%4)%4),b=atob((str+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,ch=>ch.charCodeAt(0))}
async function setupPush(){try{if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('Este navegador não suporta Web Push. No iPhone, instale a PWA na Tela de Início.');const config=await api('push/key');if(!config.enabled)throw Error('Push ainda não configurado no servidor');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Permissão não concedida');const registration=await navigator.serviceWorker.ready;let sub=await registration.pushManager.getSubscription();if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8(config.key)});await api('push/subscribe','POST',{subscription:sub.toJSON()});notify('Notificações Push ativadas neste aparelho!')}catch(e){notify(e.message)}}
function showAdminRoom(){if(!room)return;app.innerHTML=box(renderTop()+'<section class="panel narrow stack"><h2>'+ico('headset')+' Sala '+esc(room.code)+'</h2><p>Você entrou como administrador. Todos verão sua presença na chamada.</p><button id="voice">Entrar na voz</button><p id="voiceStatus">Microfone desligado</p><button class="ghost" id="leave">Sair da sala</button></section>');bindLogout();$('#voice').onclick=toggleVoice;$('#leave').onclick=()=>{send({type:'leave'});room=null;admin()}}
function ensureVoiceDock(){
 const el=$('#voiceDock');if(!el)return;
 if(!me){el.hidden=true;el.innerHTML='';return}
 el.hidden=false;
 if(!$('#familyVoiceButton')){el.innerHTML='<div class="family-voice-panel"><button id="familyVoiceButton" type="button" aria-label="Ativar ou desligar conversa por voz">Conversar</button><div class="family-voice-info"><strong id="familyVoiceTitle">Conversa da família</strong><span id="familyVoicePeople">Toque para conversar</span></div><button id="familyVoiceMute" type="button" disabled>Silenciar</button></div>';$('#familyVoiceButton').onclick=toggleVoice;$('#familyVoiceMute').onclick=toggleMute}
 updateVoiceDock();
}
function updateVoiceDock(){
 const el=$('#voiceDock');if(!el||!me)return;
 const on=Boolean(voiceStream),ready=ws?.readyState===1;
 const b=$('#familyVoiceButton'),mute=$('#familyVoiceMute'),info=$('#familyVoicePeople'),title=$('#familyVoiceTitle');
 if(b){b.textContent=on?'Sair da voz':'Conversar';b.classList.toggle('connected',on);b.disabled=!ready&&!on}
 if(mute){mute.disabled=!on;mute.textContent=muted?'Reativar':'Silenciar'}
 if(title)title.textContent=on?(muted?'Microfone silenciado':'Microfone ligado'):'Conversa da família';
 if(info)info.textContent=!ready?'Reconectando...':on?((voiceOnline.filter(p=>p.id!==myId).length)+' mais na conversa'):voiceOnline.length+' online na voz';
 const oldButton=$('#voice');if(oldButton)oldButton.textContent=on?'Desligar voz':'Ativar voz';
 const oldMute=$('#mute');if(oldMute){oldMute.disabled=!on;oldMute.textContent=muted?'Reativar microfone':'Silenciar microfone'}
 const oldStatus=$('#voiceStatus');if(oldStatus)oldStatus.textContent=on?(muted?'Microfone silenciado':'Microfone ligado — família conectada'):'Microfone desligado';
}
function toggleMute(){if(!voiceStream)return;muted=!muted;for(const t of voiceStream.getAudioTracks())t.enabled=!muted;updateVoiceDock()}
let voiceStarting=false;
async function toggleVoice(){
 if(voiceStream){stopVoice();return}
 if(voiceStarting)return;
 if(!me||ws?.readyState!==1){notify('Aguarde a conexão com a família');return}
 voiceStarting=true;
 try{
  const config=me.role==='admin'||me.voiceEnabled!==false;
  if(!config){notify('Voz desativada pelo responsável');return}
  const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(!me){media.getTracks().forEach(t=>t.stop());return}
  voiceStream=media;muted=false;
  for(const track of media.getTracks())track.addEventListener('ended',()=>{if(voiceStream===media)stopVoice()},{once:true});
  send({type:'voice-ready'});send({type:'peers'});
  updateVoiceDock();
  notify('Conversa com a família ativada');
 }catch(e){console.warn('Permissão de áudio',e);notify('Para conversar, permita o uso do microfone nas configurações do navegador')}
 finally{voiceStarting=false;updateVoiceDock()}
}
function stopVoice(){
 const media=voiceStream;voiceStream=null;muted=false;
 if(ws?.readyState===1)send({type:'voice-off'});
 if(media)media.getTracks().forEach(t=>t.stop());
 for(const id of [...connections.keys()])hangupPeer(id);
 updateVoiceDock();
}
function hangupPeer(id){
 const pc=connections.get(id);connections.delete(id);iceQueues.delete(id);
 try{pc?.close()}catch{}
 const audio=remoteAudio.get(id);if(audio){audio.srcObject=null;audio.remove()}remoteAudio.delete(id)
}
async function maybeCall(p){
 if(!voiceStream||!p?.id||!myId||p.id===myId||myId>p.id||connections.has(p.id))return;
 try{
  const pc=makePc(p.id),offer=await pc.createOffer();if(connections.get(p.id)!==pc)return;
  await pc.setLocalDescription(offer);
  send({type:'signal',to:p.id,kind:'offer',data:pc.localDescription});
 }catch(e){console.warn('Início de voz',e);hangupPeer(p.id)}
}
function makePc(id){
 if(connections.has(id))return connections.get(id);
 const pc=new RTCPeerConnection({iceServers});
 connections.set(id,pc);iceQueues.set(id,[]);
 for(const tr of voiceStream?.getTracks()||[])pc.addTrack(tr,voiceStream);
 pc.onicecandidate=e=>{if(e.candidate)send({type:'signal',to:id,kind:'ice',data:e.candidate})};
 pc.ontrack=e=>{
  let audio=remoteAudio.get(id);
  if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.setAttribute('aria-label','Áudio de participante');document.body.append(audio);remoteAudio.set(id,audio)}
  audio.srcObject=e.streams[0];audio.play().catch(()=>{updateVoiceDock();notify('Se não ouvir, toque na tela e verifique o volume do aparelho')});
 };
 pc.oniceconnectionstatechange=()=>{
  if(!voiceStream||connections.get(id)!==pc)return;
  if(pc.iceConnectionState==='failed'){hangupPeer(id);send({type:'voice-ready'});send({type:'peers'})}
  if(pc.iceConnectionState==='disconnected'){
   setTimeout(()=>{if(connections.get(id)===pc&&pc.iceConnectionState==='disconnected'){hangupPeer(id);send({type:'voice-ready'});send({type:'peers'})}},5000)
  }
 };
 return pc;
}
async function handleSignal(m){
 if(!voiceStream||!m?.from)return;
 try{
  const pc=makePc(m.from);
  if(m.kind==='offer'){
   if(pc.signalingState!=='stable'){if(myId<m.from)return;await pc.setLocalDescription({type:'rollback'})}
   await pc.setRemoteDescription(m.data);
   const queue=iceQueues.get(m.from)||[];iceQueues.set(m.from,[]);
   for(const candidate of queue)await pc.addIceCandidate(candidate).catch(()=>{});
   const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
   send({type:'signal',to:m.from,kind:'answer',data:pc.localDescription})
  }else if(m.kind==='answer'){
   if(pc.signalingState!=='have-local-offer')return;
   await pc.setRemoteDescription(m.data);
   const queue=iceQueues.get(m.from)||[];iceQueues.set(m.from,[]);
   for(const candidate of queue)await pc.addIceCandidate(candidate).catch(()=>{});
  }else if(m.kind==='ice'){
   if(pc.remoteDescription)await pc.addIceCandidate(m.data).catch(()=>{});
   else{const queue=iceQueues.get(m.from)||[];if(queue.length<40)queue.push(m.data);iceQueues.set(m.from,queue)}
  }
 }catch(e){console.warn('Falha na sinalização WebRTC',e)}
}
(async()=>{try{const x=await api('me');me=x.user;connect();home();ensureVoiceDock()}catch{login();ensureVoiceDock()}if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{})})();
