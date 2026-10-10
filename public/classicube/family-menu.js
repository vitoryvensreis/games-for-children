'use strict';
/* Multiplayer controls within ClassiCube's authenticated iframe. */
(function(){
 const $=id=>document.getElementById(id);
 const opener=$('familyMenuBtn'),panel=$('familyPanel'),closer=$('familyClose'),content=$('familyMenuContent'),notice=$('familyMessage');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let poll=null,visible=false;
 function message(s){notice.textContent=s;setTimeout(()=>{if(notice.textContent===s)notice.textContent=''},4000)}
 function command(text){
  if(!/^\/familia [a-z0-9_ ]{1,48}$/i.test(text)){message('Ação inválida');return false}
  const ws=window.familyGameSocket;
  if(!ws||ws.readyState!==WebSocket.OPEN){message('O jogo ainda está conectando. Tente novamente.');return false}
  const packet=new Uint8Array(66);
  packet[0]=0x0d;packet[1]=0;
  for(let i=0;i<Math.min(text.length,64);i++)packet[2+i]=text.charCodeAt(i)&127;
  // The original Classic network protocol uses space-padded fixed-width strings.
  for(let i=2+text.length;i<66;i++)packet[i]=32;
  ws.send(packet);
  return true;
 }
 async function refresh(){
  if(!visible)return;
  try{
   const r=await fetch('/api/minecraft/family',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('Faça login novamente para acessar a família');
   const data=await r.json();
   const mined=await fetch('/api/minecraft/mining',{credentials:'same-origin',cache:'no-store'}).then(resp=>resp.ok?resp.json():null).catch(()=>null);
   const bag=mined?.inventory||{};
   if(!visible)return;
   if(!data.familyFeaturesReady){
    content.innerHTML='<p class="family-hint">A conexão da família ainda está sendo preparada no servidor. Tente novamente em alguns segundos.</p>';
    return;
   }
   const friends=data.players.filter(p=>!p.me&&p.online);
   const myHome=data.homes.find(h=>h.mine);
   content.innerHTML=
    '<section class="family-section"><h3>Meus amigos</h3><div class="family-row">'+
    (friends.length?friends.map(p=>'<button type="button" class="family-action family-primary" data-action="friend" data-player="'+escape(p.playerName)+'">Ir até '+escape(p.name)+'</button>').join(''):
     '<span class="family-hint">Nenhum amigo jogando agora. Peça para ele abrir o Minecraft.</span>')+'</div></section>'+
    '<section class="family-section"><h3>Minha casinha</h3><div class="family-row"><button type="button" class="family-action family-primary" data-action="home" '+(myHome?'':'disabled')+'>Ir para minha casa</button></div><p class="family-hint">'+(myHome?escape(myHome.title)+'. Seus blocos estão protegidos contra alterações das outras crianças.':'Peça ao ADM para escolher uma casa para você.')+'</p></section>'+
    '<section class="family-section"><h3>Portais para outros mundos</h3><div class="family-row"><button type="button" class="family-action" data-action="vila">Vila da Família</button><button type="button" class="family-action" data-action="aventura">Mundo Aventura</button><button type="button" class="family-action family-primary" data-action="exploracao">Exploração maior</button></div></section>'+
    '<section class="family-section"><h3>Mineração e ferramentas</h3>'+
    '<p class="family-hint">Explore cavernas, minere pedra, carvão, ferro e ouro. Use materiais encontrados para criar equipamentos.</p>'+
    '<p class="family-hint">Mochila: madeira '+Number(bag.wood||0)+' · pedra '+Number(bag.stone||0)+' · ferro '+Number(bag.iron||0)+' · ouro '+Number(bag.gold||0)+'</p>'+
    '<div class="family-row"><button type="button" class="family-action family-primary" data-action="mining">Ir para Mineração</button>'+
    '<button type="button" class="family-action" data-action="backpack">Minha mochila</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="picareta madeira">Picareta madeira</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="picareta pedra">Picareta pedra</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="picareta ferro">Picareta ferro</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="espada madeira">Espada madeira</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="espada pedra">Espada pedra</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="espada ferro">Espada ferro</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="armadura ferro">Armadura ferro</button>'+
    '<button type="button" class="family-action" data-action="craft" data-item="armadura ouro">Armadura ouro</button></div>'+
    '<p class="family-hint">Picaretas desbloqueiam minerais. Espadas e armaduras são colecionáveis por enquanto: ainda não aparecem equipadas no personagem.</p></section>'+
    '<section class="family-section"><h3>Criar portais no mundo</h3>'+
    '<p class="family-hint">Na Mineração ou Exploração, escolha um terreno livre e plano. Cada portal custa 8 pedras e 2 ferros.</p>'+
    '<div class="family-row"><button type="button" class="family-action" data-action="portal" data-target="vila">Portal Vila</button>'+
    '<button type="button" class="family-action" data-action="portal" data-target="exploracao">Portal Exploração</button>'+
    '<button type="button" class="family-action" data-action="portal" data-target="mineracao">Portal Mineração</button></div></section>'+
    '<section class="family-section"><h3>Conhecer os guias da Vila</h3><p class="family-hint">Toque para visitar os personagens que mostram onde ficam as missões.</p><div class="family-row"><button type="button" class="family-action" data-action="guide" data-place="praca">Guia da Praça</button><button type="button" class="family-action" data-action="guide" data-place="ponte">Guia da Ponte</button><button type="button" class="family-action" data-action="guide" data-place="torre">Guia da Torre</button></div></section>'+
    '<section class="family-section"><h3>Aventuras e minijogos 3D</h3>'+
    '<p class="family-hint">Os guias da Praça, da Ponte e da Torre têm pistas. Visite os três locais com seu personagem para ganhar estrelas!</p>'+
    '<div class="family-row"><button type="button" class="family-action family-primary" data-action="treasure">Caça ao tesouro</button>'+
    '<button type="button" class="family-action" data-action="sprint">Circuito (3 minutos)</button>'+
    '<button type="button" class="family-action" data-action="rewards">Ver recompensas</button></div>'+
    '<p class="family-hint">Minhas estrelas: <strong>'+Number(data.adventures?.own?.stars||0)+'</strong> | Tesouros: '+Number(data.adventures?.own?.treasures||0)+
    ' | Circuitos: '+Number(data.adventures?.own?.sprints||0)+
    ' | Missões em dupla: '+Number(data.adventures?.coopWins||0)+'</p>'+
    '<p class="family-hint">Meta em dupla: duas crianças completam a caça para ganhar mais cinco estrelas cada.</p>'+
    '<p class="family-hint">'+(data.adventures?.own?.mode?'Missão ativa: '+escape(data.adventures.own.mode)+' — pista '+(Number(data.adventures.own.stage||0)+1)+'/3':'Escolha uma aventura para começar')+'</p></section>'+
    '<section class="family-section"><h3>Minha aparência</h3><div class="family-row">'+
    Object.entries(data.skins).map(([id,title])=>'<button type="button" class="family-action" data-action="skin" data-skin="'+escape(id)+'">'+escape(title)+'</button>').join('')+'</div><p class="family-hint">Selecione uma cor segura para seu personagem.</p></section>';
   content.querySelectorAll('button[data-action]').forEach(button=>button.onclick=async()=>{
    const action=button.dataset.action;
    if(action==='friend'){if(command('/familia amigo '+button.dataset.player)){message('Indo encontrar seu amigo!');close()}}
    else if(action==='home'){if(command('/familia casa')){message('Indo para sua casa!');close()}}
    else if(action==='vila'||action==='aventura'||action==='exploracao'){if(command('/familia '+action)){message('Abrindo o mundo...');close()}}
    else if(action==='guide'){const place=button.dataset.place;if(['praca','ponte','torre'].includes(place)&&command('/familia guia '+place)){message('Visitando o guia!');close()}}
    else if(action==='mining'){if(command('/familia minerar')){message('Entrando no Mundo Mineração!');close()}}
    else if(action==='backpack'){if(command('/familia mochila'))message('Recursos mostrados no chat do jogo.')}
    else if(action==='craft'){const item=button.dataset.item;if(['picareta madeira','picareta pedra','picareta ferro','espada madeira','espada pedra','espada ferro','armadura ferro','armadura ouro'].includes(item)&&command('/familia criar '+item))message('Veja o resultado no chat do jogo.')}
    else if(action==='portal'){const target=button.dataset.target;if(['vila','exploracao','mineracao'].includes(target)&&command('/familia portal '+target)){message('Veja o resultado no chat do jogo.');close()}}
    else if(action==='treasure'){if(command('/familia tesouro')){message('Procure o Guia da Praça!');close()}}
    else if(action==='sprint'){if(command('/familia corrida')){message('O circuito começou!');close()}}
    else if(action==='rewards'){if(command('/familia premios'))message('Veja suas estrelas no chat do jogo!')}
    else if(action==='skin'){
     try{
      const r=await fetch('/api/minecraft/skin',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({skin:button.dataset.skin})});
      if(!r.ok)throw Error((await r.json()).error||'Não foi possível alterar a aparência');
      if(command('/familia pele '+button.dataset.skin))message('Visual selecionado!');
     }catch(e){message(e.message)}
    }
   });
  }catch(err){content.textContent=err.message}
 }
 function close(){
  visible=false;panel.hidden=true;opener.setAttribute('aria-expanded','false');
  if(poll){clearInterval(poll);poll=null}
  if(window.matchMedia('(pointer:fine)').matches)requestAnimationFrame(()=>document.getElementById('canvas')?.focus({preventScroll:true}));
 }
 opener.onclick=()=>{
  if(visible){close();return}
  visible=true;panel.hidden=false;opener.setAttribute('aria-expanded','true');
  refresh();poll=setInterval(refresh,7000);
 };
 closer.onclick=close;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close()});
 window.addEventListener('pagehide',close);
})();
