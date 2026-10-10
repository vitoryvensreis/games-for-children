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
   if(!visible)return;
   const friends=data.players.filter(p=>!p.me&&p.online&&p.role==='child');
   const myHome=data.homes.find(h=>h.mine);
   content.innerHTML=
    '<section class="family-section"><h3>Meus amigos</h3><div class="family-row">'+
    (friends.length?friends.map(p=>'<button type="button" class="family-action family-primary" data-action="friend" data-player="'+escape(p.playerName)+'">Ir até '+escape(p.name)+'</button>').join(''):
     '<span class="family-hint">Nenhum amigo jogando agora. Peça para ele abrir o Minecraft.</span>')+'</div></section>'+
    '<section class="family-section"><h3>Minha casinha</h3><div class="family-row"><button type="button" class="family-action family-primary" data-action="home" '+(myHome?'':'disabled')+'>Ir para minha casa</button></div><p class="family-hint">'+(myHome?escape(myHome.title)+'. Seus blocos estão protegidos contra alterações das outras crianças.':'Peça ao ADM para escolher uma casa para você.')+'</p></section>'+
    '<section class="family-section"><h3>Portais para outros mundos</h3><div class="family-row"><button type="button" class="family-action" data-action="vila">Vila da Família</button><button type="button" class="family-action" data-action="aventura">Mundo Aventura</button></div></section>'+
    '<section class="family-section"><h3>Minha aparência</h3><div class="family-row">'+
    Object.entries(data.skins).map(([id,title])=>'<button type="button" class="family-action" data-action="skin" data-skin="'+escape(id)+'">'+escape(title)+'</button>').join('')+'</div><p class="family-hint">Selecione uma cor segura para seu personagem.</p></section>';
   content.querySelectorAll('button[data-action]').forEach(button=>button.onclick=async()=>{
    const action=button.dataset.action;
    if(action==='friend'){if(command('/familia amigo '+button.dataset.player)){message('Indo encontrar seu amigo!');close()}}
    else if(action==='home'){if(command('/familia casa')){message('Indo para sua casa!');close()}}
    else if(action==='vila'||action==='aventura'){if(command('/familia '+action)){message('Abrindo o mundo...');close()}}
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
