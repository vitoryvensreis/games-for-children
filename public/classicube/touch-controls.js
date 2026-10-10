'use strict';
/* GamesNavagador mobile input adapter for the unmodified ClassiCube WebAssembly client.
 * Native 1.3.8 mappings: B inventory, Z fly, Q up, E down, Space jump.
 * Mouse input must be dispatched on #canvas; keyboard on window.
 */
(function(){
 const pad=document.getElementById('familyPad'),canvas=document.getElementById('canvas');
 const joystick=document.getElementById('familyJoystick'),thumb=document.getElementById('familyStick');
 const inventory=document.getElementById('familyInventoryBtn');
 if(!pad||!canvas||!joystick||!thumb)return;
 const touch=window.matchMedia('(pointer:coarse)').matches;
 if(touch)pad.hidden=false;
 const KEYCODE={Space:32,KeyW:87,KeyA:65,KeyS:83,KeyD:68,KeyB:66,KeyZ:90,KeyQ:81,KeyE:69};
 const movement=new Set(),actions=new Map();
 let stickId=null,flying=false;
 const DEAD_ZONE=0.30;
 function keyEvent(type,code){
  const keyCode=KEYCODE[code];
  if(!keyCode)return;
  const key=code==='Space'?' ':code.slice(3).toLowerCase();
  const event=new KeyboardEvent(type,{bubbles:true,cancelable:true,key,code,view:window});
  // Emscripten uses keyCode to map to the engine's CCKEY constants.
  Object.defineProperty(event,'keyCode',{configurable:true,get:()=>keyCode});
  Object.defineProperty(event,'which',{configurable:true,get:()=>keyCode});
  window.dispatchEvent(event);
 }
 function tapKey(code){
  keyEvent('keydown',code);
  window.setTimeout(()=>keyEvent('keyup',code),75);
 }
 function mouseEvent(type,button){
  const rect=canvas.getBoundingClientRect();
  const event=new MouseEvent(type,{button,buttons:type==='mousedown'?(button===2?2:1):0,
   clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,
   bubbles:true,cancelable:true,view:window});
  canvas.dispatchEvent(event);
 }
 function setMovement(next){
  for(const key of movement)if(!next.has(key)){movement.delete(key);keyEvent('keyup',key)}
  for(const key of next)if(!movement.has(key)){movement.add(key);keyEvent('keydown',key)}
 }
 function positionStick(x,y){
  const rect=joystick.getBoundingClientRect(),mx=rect.left+rect.width/2,my=rect.top+rect.height/2;
  const radius=Math.max(1,rect.width*0.28),dx=x-mx,dy=y-my,dist=Math.hypot(dx,dy);
  const mul=dist>radius?radius/dist:1,px=dx*mul,py=dy*mul;
  thumb.style.transform='translate3d('+px.toFixed(1)+'px,'+py.toFixed(1)+'px,0)';
  const nx=px/radius,ny=py/radius,next=new Set();
  if(ny< -DEAD_ZONE)next.add('KeyW');
  if(ny> DEAD_ZONE)next.add('KeyS');
  if(nx< -DEAD_ZONE)next.add('KeyA');
  if(nx> DEAD_ZONE)next.add('KeyD');
  setMovement(next);
 }
 function releaseStick(){
  stickId=null;joystick.classList.remove('is-dragging');
  thumb.style.transform='translate3d(0,0,0)';setMovement(new Set());
 }
 if(touch){
  joystick.addEventListener('pointerdown',event=>{
   event.preventDefault();event.stopPropagation();
   if(stickId!==null)return;
   stickId=event.pointerId;
   joystick.classList.add('is-dragging');
   try{joystick.setPointerCapture(event.pointerId)}catch{}
   positionStick(event.clientX,event.clientY);
  },{passive:false});
  joystick.addEventListener('pointermove',event=>{
   if(stickId!==event.pointerId)return;
   event.preventDefault();event.stopPropagation();
   positionStick(event.clientX,event.clientY);
  },{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])
   joystick.addEventListener(type,event=>{
    if(stickId!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();releaseStick();
   },{passive:false});
 }
 function release(button){
  const state=actions.get(button);if(!state)return;
  actions.delete(button);button.classList.remove('is-pressed');
  if(state.timer)clearInterval(state.timer);
  if(state.key)keyEvent('keyup',state.key);
  if(state.mouse!==undefined)mouseEvent('mouseup',state.mouse);
 }
 function releaseAll(){
  releaseStick();
  for(const button of [...actions.keys()])release(button);
 }
 function startAction(button,event){
  event.preventDefault();event.stopPropagation();
  if(actions.has(button))return;
  const key=button.dataset.key,mouse=button.dataset.mouse;
  if(key==='KeyZ'){
   tapKey('KeyZ');flying=!flying;
   button.setAttribute('aria-pressed',String(flying));
   button.classList.toggle('is-flying',flying);
   return;
  }
  if(!key&&mouse===undefined)return;
  const state={id:event.pointerId};
  if(key){state.key=key;keyEvent('keydown',key)}
  else{
   state.mouse=Number(mouse);mouseEvent('mousedown',state.mouse);
   // Classic touch mode ignores held mouse buttons during the world tick.
   // Re-trigger deliberate clicks for repeat mining/building, never stuck presses.
   state.timer=setInterval(()=>{
    if(!actions.has(button))return;
    mouseEvent('mouseup',state.mouse);mouseEvent('mousedown',state.mouse);
   },260);
  }
  actions.set(button,state);button.classList.add('is-pressed');
  try{button.setPointerCapture(event.pointerId)}catch{}
 }
 if(touch){
  for(const button of pad.querySelectorAll('button')){
   button.addEventListener('pointerdown',event=>startAction(button,event),{passive:false});
   for(const name of ['pointerup','pointercancel','lostpointercapture'])
    button.addEventListener(name,event=>{
     const state=actions.get(button);
     if(!state||state.id!==event.pointerId)return;
     event.preventDefault();event.stopPropagation();release(button);
    },{passive:false});
   button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  for(const type of ['touchstart','touchmove','touchend','touchcancel'])
   pad.addEventListener(type,event=>{event.preventDefault();event.stopPropagation()},{passive:false});
 }
 if(inventory){
  inventory.addEventListener('pointerdown',event=>{event.stopPropagation()});
  inventory.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   releaseAll();
   tapKey('KeyB'); // The engine renders the authentic full block inventory with textured slots.
  });
 }
 window.GFCMobileControls={releaseAll,openInventory(){releaseAll();tapKey('KeyB')}};
 window.addEventListener('blur',releaseAll);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll()});
 window.addEventListener('pagehide',releaseAll);
 window.addEventListener('orientationchange',releaseAll);
})();
