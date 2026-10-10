'use strict';
/* A family-friendly HUD layered over ClassiCube.
 * Status is read from the server-owned FamilyPlay plugin, not client-trusted.
 * This is a simplified survival overlay; it does not pretend to provide
 * Java/Bedrock combat, crafting or inventory mechanics. */
(function(){
 const root=document.getElementById('mcVitals');if(!root)return;
 const heart=(on)=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4 3.4 12c-4.5-4.6 2.2-11.2 7-6.6L12 7l1.6-1.6c4.7-4.6 11.4 2 7 6.6Z" fill="'+(on?'#ff5a72':'#616b83')+'" stroke="#f9d2da" stroke-width=".8"/></svg>';
 const food=(on)=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.4 3.2c-3.2-2-7.7.3-8.7 4-.4 1.5-.3 3 0 4.1l-4 3.9a2.8 2.8 0 1 0 4.1 3.6l4-3.9c4.3 1.3 8-3.6 6.9-7.5a6.6 6.6 0 0 0-2.3-2.6Z" fill="'+(on?'#fbbd64':'#677083')+'" stroke="#fff1ce" stroke-width=".9"/></svg>';
 let last='';
 async function refresh(){
  if(document.hidden)return;
  try{
   const response=await fetch('/api/minecraft/survival',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)return;
   const d=await response.json(),hp=Math.max(1,Math.min(10,Number(d.hearts)||1));
   const hunger=Math.max(0,Math.min(10,Number(d.hunger)||0));
   const climate=d.climate||{};
   const text='<div class="mc-vitals-icons" aria-label="Vida: '+hp+' de 10">'+Array.from({length:10},(_,i)=>heart(i<hp)).join('')+'</div>'+
    '<div class="mc-vitals-icons" aria-label="Fome: '+hunger+' de 10">'+Array.from({length:10},(_,i)=>food(i<hunger)).join('')+'</div>'+
    '<div class="mc-climate">'+(climate.phase||'Manhã')+' • '+(climate.weather==='chuva'?'Chuva':'Sol')+'</div>'+
    '<div class="mc-supply" aria-label="Recursos de mineração">Madeira '+Number(d.inventory?.wood||0)+' | Pedra '+Number(d.inventory?.stone||0)+' | Ferro '+Number(d.inventory?.iron||0)+' | Ouro '+Number(d.inventory?.gold||0)+' | Maçãs '+Number(d.inventory?.apples||0)+' | Picareta '+['Nenhuma','Madeira','Pedra','Ferro'][Math.min(3,Number(d.inventory?.tool||0))]+'</div>';
   if(text!==last){root.innerHTML=text;last=text}
  }catch(e){/* Network reconnects independently; gameplay stays responsive. */}
 }
 refresh();setInterval(refresh,9000);
})();
