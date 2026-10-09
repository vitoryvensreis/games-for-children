// Jogo original desenvolvido para GamesForChildren, inspirado em Gorillas do QBasic.
// Referência de gênero: Hunor Marton Borbely, https://codepen.io/HunorMarton/pen/jOJZqvp
// Este arquivo não copia o código, as artes ou os recursos do Pen.
export function startGorillas({app,onExit}){
 let alive=true,raf=0,nextTurnTimer=0,score=[0,0],turn=0,vsAI=true,wind=0,city=[],actors=[],shot=null,craters=[],phase='ready',last=performance.now(),sparkles=[];
 const root=document.createElement('main');root.className='gorilla-game';
 root.innerHTML='<header class="gorilla-header"><button id="gorillaExit">Voltar</button><div><strong>GORILAS NO TELHADO</strong><small>Artillery Arcade</small></div><div class="gorilla-scores"><b id="gorillaScore">0 : 0</b><small id="gorillaTurn">Sua vez</small></div></header><div class="gorilla-stage"><canvas id="gorillaCanvas" width="960" height="560" aria-label="Jogo de gorilas atirando bananas entre prédios"></canvas><div class="gorilla-notice" id="gorillaNotice">Acerte o outro gorila!</div></div><footer class="gorilla-bottom"><div class="gorilla-modes"><button id="gorillaSolo" class="selected">Contra computador</button><button id="gorillaDuo">2 jogadores no mesmo aparelho</button></div><div class="gorilla-aim"><label>Ângulo <b id="gorillaAngleValue">45°</b><input id="gorillaAngle" type="range" min="15" max="85" value="45"/></label><label>Força <b id="gorillaPowerValue">520</b><input id="gorillaPower" type="range" min="220" max="850" value="520"/></label><button class="gorilla-fire" id="gorillaFire">LANÇAR BANANA</button></div><div class="gorilla-wind" id="gorillaWind">Vento: 0</div><div class="gorilla-credit">Inspirado em QBasic Gorillas · Referência: Hunor Marton Borbely</div></footer>';
 app.replaceChildren(root);
 const canvas=root.querySelector('#gorillaCanvas'),ctx=canvas.getContext('2d'),angleInput=root.querySelector('#gorillaAngle'),powerInput=root.querySelector('#gorillaPower');
 const angleValue=root.querySelector('#gorillaAngleValue'),powerValue=root.querySelector('#gorillaPowerValue'),notice=root.querySelector('#gorillaNotice'),scoreUI=root.querySelector('#gorillaScore'),turnUI=root.querySelector('#gorillaTurn'),windUI=root.querySelector('#gorillaWind'),fire=root.querySelector('#gorillaFire');
 const rgb=['#63edf3','#ff97c6'];
 function newCity(){
  city=[];craters=[];sparkles=[];let x=-5,i=0;
  while(x<960){const w=57+(i*19+Math.random()*18)%42,h=140+Math.random()*160;city.push({x,w,h,color:['#21295a','#303a71','#364175','#1a2854'][i%4]});x+=w+3;i++}
  actors=[{x:city[1].x+city[1].w/2,y:560-city[1].h-19},{x:city[city.length-2].x+city[city.length-2].w/2,y:560-city[city.length-2].h-19}];
  wind=(Math.random()-.5)*95;windUI.textContent='Vento: '+(wind>10?'→':wind< -10?'←':'•')+' '+Math.round(Math.abs(wind));
 }
 function tell(s){notice.textContent=s}
 function updateHUD(){
  scoreUI.textContent=score.join(' : ');
  turnUI.textContent=phase==='over'?'Fim de jogo':vsAI&&turn===1?'Vez do computador':turn===0?'Gorila Azul':'Gorila Rosa';
  fire.disabled=phase!=='ready'||vsAI&&turn===1;
  angleInput.disabled=fire.disabled;powerInput.disabled=fire.disabled;
 }
 function reset(){clearTimeout(nextTurnTimer);score=[0,0];turn=0;phase='ready';shot=null;newCity();updateHUD();tell('Gorila Azul começa! Ajuste a mira e lance.')}
 function endTurn(hit){
  shot=null;
  if(hit!==null){score[hit]++;if(score[hit]>=3){phase='over';tell((hit===0?'Azul':'Rosa')+' venceu! Escolha um modo para reiniciar.');updateHUD();return}}
  turn=1-turn;phase='ready';if(hit!==null){newCity();tell('Ponto para o Gorila '+(hit===0?'Azul':'Rosa')+'!')}
  else tell('Ajuste a mira para lançar.');
  updateHUD();
  if(vsAI&&turn===1)nextTurnTimer=setTimeout(aiShot,1000);
 }
 function launch(a,p){
  if(phase!=='ready')return;
  const sign=turn===0?1:-1,origin=actors[turn],rad=a*Math.PI/180;
  shot={x:origin.x+sign*26,y:origin.y-9,vx:Math.cos(rad)*p*sign,vy:-Math.sin(rad)*p,age:0,owner:turn};
  phase='flying';updateHUD();tell('Banana voando!');
 }
 function aiShot(){
  if(!alive||!vsAI||phase!=='ready'||turn!==1)return;
  const sx=actors[1].x,sy=actors[1].y-9,tx=actors[0].x,ty=actors[0].y;
  const dx=Math.abs(tx-sx),dy=ty-sy,deg=35+Math.random()*27,rad=deg*Math.PI/180,grav=480;
  const denominator=2*Math.cos(rad)**2*(dy+dx*Math.tan(rad));
  let v=denominator>0?Math.sqrt(grav*dx*dx/denominator):500;
  v+=wind*.28+(Math.random()-.5)*72;
  launch(deg,Math.max(260,Math.min(850,v)));
 }
 function checkBuilding(x,y){
  if(y>559)return true;
  for(const b of city){if(x<b.x||x>b.x+b.w||y<560-b.h)return false; // corrected below by loop handling
  }
  return false;
 }
 function hitsBuilding(x,y){
  for(const b of city){
   if(x>=b.x&&x<=b.x+b.w&&y>=560-b.h&&y<=560){
    if(craters.some(h=>(x-h.x)**2+(y-h.y)**2<h.r*h.r))return false;
    return true;
   }
  }
  return false;
 }
 function blast(x,y){
  craters.push({x,y,r:19});if(craters.length>25)craters.shift();
  for(let i=0;i<24;i++)sparkles.push({x,y,vx:(Math.random()-.5)*260,vy:(Math.random()-.5)*260,life:.8,color:Math.random()<.5?'#ffe478':'#ff7095'});
 }
 function update(dt){
  for(const p of sparkles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}
  sparkles=sparkles.filter(p=>p.life>0);
  if(phase!=='flying'||!shot)return;
  const steps=Math.ceil(dt/.008),step=dt/steps;
  for(let i=0;i<steps;i++){
   shot.age+=step;
   shot.vx+=wind*step;shot.vy+=480*step;shot.x+=shot.vx*step;shot.y+=shot.vy*step;
   const opponent=actors[1-shot.owner];
   if(shot.age>.09&&Math.hypot(shot.x-opponent.x,shot.y-opponent.y)<29){blast(shot.x,shot.y);endTurn(shot.owner);return}
   if(shot.age>.10&&hitsBuilding(shot.x,shot.y)){blast(shot.x,shot.y);endTurn(null);return}
   if(shot.x< -60||shot.x>1020||shot.y>590||shot.age>7){endTurn(null);return}
  }
 }
 function gorilla(x,y,color){
  ctx.save();ctx.translate(x,y);ctx.fillStyle=color;
  ctx.beginPath();ctx.ellipse(0,-10,22,22,0,0,Math.PI*2);ctx.fill();
  ctx.fillRect(-19,4,38,20);
  ctx.fillRect(-26,1,12,24);ctx.fillRect(14,1,12,24);
  ctx.fillStyle='#fbd6b0';ctx.beginPath();ctx.ellipse(0,-8,13,10,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#13264d';ctx.beginPath();ctx.arc(-4,-10,2,0,Math.PI*2);ctx.arc(4,-10,2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#251c41';ctx.fillRect(-15,19,11,7);ctx.fillRect(4,19,11,7);ctx.restore();
 }
 function paint(){
  const bg=ctx.createLinearGradient(0,0,0,560);bg.addColorStop(0,'#101641');bg.addColorStop(.65,'#443872');bg.addColorStop(1,'#f28a7f');ctx.fillStyle=bg;ctx.fillRect(0,0,960,560);
  ctx.fillStyle='#ffe0a8';ctx.beginPath();ctx.arc(485,112,43,0,Math.PI*2);ctx.fill();
  for(let i=0;i<40;i++){const x=(i*71)%960,y=(i*43)%270;ctx.fillStyle='#ffffff70';ctx.fillRect(x,y,2,2)}
  for(const b of city){
   ctx.fillStyle=b.color;ctx.fillRect(b.x,560-b.h,b.w,b.h);
   ctx.fillStyle='#1c254b';ctx.fillRect(b.x-2,560-b.h-5,b.w+4,7);
   for(let y=560-b.h+20;y<545;y+=27)for(let x=b.x+10;x<b.x+b.w-8;x+=22){ctx.fillStyle=(Math.floor(x*2+y)%5===0)?'#d4daf2':'#ffd789';ctx.globalAlpha=.25+((x+y)%3)*.17;ctx.fillRect(x,y,10,14);ctx.globalAlpha=1}
  }
  for(const hole of craters){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(hole.x,hole.y,hole.r,0,Math.PI*2);ctx.fill();ctx.restore()}
  // draw clean skyline behind destroyed openings
  ctx.globalCompositeOperation='source-over';
  actors.forEach((p,i)=>gorilla(p.x,p.y,rgb[i]));
  if(phase==='ready'&&!(vsAI&&turn===1)){
   const a=+angleInput.value*Math.PI/180,v=+powerInput.value,sgn=turn===0?1:-1,start=actors[turn];ctx.save();ctx.strokeStyle='#ffeb7ac0';ctx.lineWidth=3;ctx.setLineDash([5,9]);ctx.beginPath();
   for(let j=0;j<20;j++){const t=j*.11,x=start.x+sgn*26+sgn*Math.cos(a)*v*t+.5*wind*t*t,y=start.y-9-Math.sin(a)*v*t+240*t*t;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);if(y>560)break}ctx.stroke();ctx.restore();
  }
  if(shot){ctx.strokeStyle='#ffde4f';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.arc(shot.x,shot.y,7,Math.PI*.25,Math.PI*1.45);ctx.stroke()}
  for(const p of sparkles){ctx.globalAlpha=Math.max(0,p.life/.8);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,6,6)}ctx.globalAlpha=1;
  ctx.fillStyle='#101a3b';ctx.fillRect(0,551,960,9);
 }
 function frame(t){if(!alive)return;const dt=Math.min(.05,(t-last)/1000);last=t;update(dt);paint();raf=requestAnimationFrame(frame)}
 const updateSliders=()=>{angleValue.textContent=angleInput.value+'°';powerValue.textContent=powerInput.value};
 angleInput.oninput=updateSliders;powerInput.oninput=updateSliders;
 fire.onclick=()=>{if(phase==='ready'&&!(vsAI&&turn===1))launch(+angleInput.value,+powerInput.value)};
 root.querySelector('#gorillaSolo').onclick=()=>{vsAI=true;root.querySelector('#gorillaSolo').classList.add('selected');root.querySelector('#gorillaDuo').classList.remove('selected');reset()};
 root.querySelector('#gorillaDuo').onclick=()=>{vsAI=false;root.querySelector('#gorillaDuo').classList.add('selected');root.querySelector('#gorillaSolo').classList.remove('selected');reset()};
 const key=e=>{if(e.code==='Space'&&root.isConnected&&document.activeElement?.tagName!=='INPUT'){e.preventDefault();fire.click()}};
 window.addEventListener('keydown',key);
 function stop(){alive=false;cancelAnimationFrame(raf);clearTimeout(nextTurnTimer);window.removeEventListener('keydown',key);root.remove()}
 root.querySelector('#gorillaExit').onclick=()=>{stop();onExit()};
 reset();raf=requestAnimationFrame(frame);
 return {stop};
}
