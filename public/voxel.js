import * as THREE from '/vendor/three.module.js';

const TYPES=['grass','dirt','stone','wood','leaves','sand','brick','glass'];
const COLORS={grass:0x61bc56,dirt:0x96613e,stone:0x8e9aa7,wood:0xa37643,leaves:0x39974b,sand:0xe8cd80,brick:0xc97467,glass:0x88e5ed};
const WORLD_LIMIT=11;
function terrainHeight(x,z){return Math.max(1,Math.min(4,2+Math.round(Math.sin(x*.38)*.9+Math.cos(z*.36)*.8)))}
function gridKey(x,y,z){return x+','+y+','+z}
function createWorld(){
 const b=new Map();
 for(let x=-WORLD_LIMIT;x<=WORLD_LIMIT;x++)for(let z=-WORLD_LIMIT;z<=WORLD_LIMIT;z++){
  const h=terrainHeight(x,z);
  for(let y=0;y<=h;y++)b.set(gridKey(x,y,z),y===h?'grass':y===0?'stone':'dirt');
 }
 for(const [x,z] of [[-7,-7],[7,-6],[-8,5],[7,6],[3,-8],[-3,8]]){
  const h=terrainHeight(x,z);
  for(let y=h+1;y<=h+3;y++)b.set(gridKey(x,y,z),'wood');
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=3;dy<=4;dy++){
   if(Math.abs(x+dx)<=WORLD_LIMIT&&Math.abs(z+dz)<=WORLD_LIMIT&&!(dx===0&&dz===0&&dy===3))b.set(gridKey(x+dx,h+dy,z+dz),'leaves');
  }
 }
 return b;
}
function makePlayer(p){
 const g=new THREE.Group(),blue=p.role==='admin'?0xffc05f:0x67d6ff;
 const material=new THREE.MeshLambertMaterial({color:blue});
 const face=new THREE.MeshLambertMaterial({color:0xf3c4a1});
 const dark=new THREE.MeshLambertMaterial({color:0x26315e});
 const box=(w,h,d,x,y,z,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o)};
 box(.65,.77,.37,0,1,0,material);box(.48,.5,.48,0,1.68,0,face);
 box(.26,.68,.3,-.18,.3,0,dark);box(.26,.68,.3,.18,.3,0,dark);
 box(.2,.65,.28,-.45,1.04,0,material);box(.2,.65,.28,.45,1.04,0,material);
 const label=document.createElement('canvas');label.width=256;label.height=64;const c=label.getContext('2d');c.fillStyle='#151c48c9';c.fillRect(0,4,256,50);c.fillStyle='#fff';c.font='bold 27px system-ui';c.textAlign='center';c.fillText(p.name.slice(0,17),128,40);const tex=new THREE.CanvasTexture(label);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.position.y=2.25;sprite.scale.set(2.25,.56,1);g.add(sprite);
 g.userData.dispose=()=>{g.traverse(o=>{if(o.isMesh)o.geometry.dispose()});material.dispose();face.dispose();dark.dispose();tex.dispose();sprite.material.dispose()};
 return g;
}

export function openVoxel({app,me,send,onExit}){
 let alive=true,joined=false,blocks=createWorld(),players=new Map(),edits={},lastPresence=0,lastFrame=performance.now(),target=null;
 let yaw=0,pitch=-.42,selected='grass',drag=null,flashTimer=0;
 const pressed=new Set();
 const root=document.createElement('main');root.className='voxel-screen';
 root.innerHTML='<div class="voxel-view" id="voxelView"><div class="voxel-top"><button id="voxelExit" aria-label="Sair do mundo">Voltar</button><div class="voxel-title"><b>MUNDO DE BLOCOS</b><small id="voxelStatus">Conectando ao mundo...</small></div><div class="voxel-online" id="voxelOnline">1 jogador</div></div><div class="voxel-crosshair" aria-hidden="true">+</div><div class="voxel-help" id="voxelHelp">Arraste para olhar ao redor</div><div class="voxel-joystick"><button data-move="forward" aria-label="Andar para frente">↑</button><div><button data-move="left" aria-label="Andar à esquerda">←</button><button data-move="back" aria-label="Andar para trás">↓</button><button data-move="right" aria-label="Andar à direita">→</button></div></div><div class="voxel-actions"><button id="voxelBreak" class="voxel-break">Quebrar</button><button id="voxelPlace" class="voxel-place">Colocar</button></div></div><div class="voxel-hotbar" id="voxelHotbar"></div><div class="voxel-flash" id="voxelFlash" aria-live="polite"></div>';
 app.replaceChildren(root);
 const view=root.querySelector('#voxelView'),status=root.querySelector('#voxelStatus'),online=root.querySelector('#voxelOnline'),flash=root.querySelector('#voxelFlash');
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x90d7ff);scene.fog=new THREE.Fog(0x90d7ff,15,39);
 const camera=new THREE.PerspectiveCamera(72,1,.06,58);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.domElement.className='voxel-canvas';view.prepend(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdff4ff,0x536d51,2.0));
 const sunlight=new THREE.DirectionalLight(0xffffff,2.1);sunlight.position.set(12,24,8);scene.add(sunlight);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshLambertMaterial({color:0x69ba65}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.52;scene.add(floor);
 const cloudMat=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.8});
 for(const [x,y,z] of [[-12,12,-17],[8,14,-19],[16,11,2],[-16,13,8]]){
  const group=new THREE.Group();for(let j=0;j<3;j++){const m=new THREE.Mesh(new THREE.BoxGeometry(3.2,1.15,2.6),cloudMat);m.position.set((j-1)*2.1,Math.sin(j)*.4,0);group.add(m)}group.position.set(x,y,z);scene.add(group);
 }
 const geometry=new THREE.BoxGeometry(1,1,1);
 const mats={};for(const type of TYPES)mats[type]=new THREE.MeshLambertMaterial({color:COLORS[type],transparent:type==='glass',opacity:type==='glass'?.65:1,depthWrite:type!=='glass'});
 const meshes=[];const raycaster=new THREE.Raycaster();raycaster.far=7;
 const cursor=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.045,1.045,1.045)),new THREE.LineBasicMaterial({color:0xffdc50,linewidth:2,depthTest:false}));
 cursor.visible=false;cursor.renderOrder=4;scene.add(cursor);
 function rebuild(){
  for(const o of meshes){scene.remove(o);o.dispose()}meshes.length=0;
  const groups={};for(const type of TYPES)groups[type]=[];
  for(const [key,type] of blocks){if(groups[type]){const [x,y,z]=key.split(',').map(Number);groups[type].push([x,y,z])}}
  const tmp=new THREE.Object3D();
  for(const type of TYPES){const entries=groups[type];if(!entries.length)continue;
   const mesh=new THREE.InstancedMesh(geometry,mats[type],entries.length);mesh.userData.coords=entries;
   for(let i=0;i<entries.length;i++){tmp.position.set(...entries[i]);tmp.updateMatrix();mesh.setMatrixAt(i,tmp.matrix)}
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
 }
 function setEdits(newEdits){
  edits={...newEdits};blocks=createWorld();
  for(const [key,kind] of Object.entries(edits)){if(kind==='air')blocks.delete(key);else if(TYPES.includes(kind))blocks.set(key,kind)}
  rebuild();
 }
 function updateAvatars(list){
  const present=new Set(list.map(p=>p.id));
  for(const [id,entry] of players)if(!present.has(id)){scene.remove(entry.mesh);entry.mesh.userData.dispose();players.delete(id)}
  for(const p of list){if(p.id===me.id)continue;
   let entry=players.get(p.id);
   if(!entry){const mesh=makePlayer(p);scene.add(mesh);entry={mesh,x:p.x,z:p.z,yaw:p.yaw};players.set(p.id,entry)}
   entry.x=p.x;entry.z=p.z;entry.yaw=p.yaw;
  }
  online.textContent=list.length+' '+(list.length===1?'jogador':'jogadores')+' online';
 }
 function banner(msg){flash.textContent=msg;flash.classList.add('show');clearTimeout(flashTimer);flashTimer=setTimeout(()=>flash.classList.remove('show'),2100)}
 const yawControls=()=>{camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch};
 let px=0,pz=5,py=terrainHeight(0,5)+2.2;
 function orient(){camera.position.set(px,py,pz);yawControls()}
 function resize(){if(!alive)return;const w=view.clientWidth||360,h=view.clientHeight||580;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
 resize();window.addEventListener('resize',resize);
 function select(type){selected=type;for(const b of root.querySelectorAll('[data-block]'))b.classList.toggle('chosen',b.dataset.block===type)}
 root.querySelector('#voxelHotbar').innerHTML=TYPES.map(t=>'<button data-block="'+t+'" style="--swatch:#'+COLORS[t].toString(16).padStart(6,'0')+'"><i></i><span>'+({grass:'Grama',dirt:'Terra',stone:'Pedra',wood:'Madeira',leaves:'Folha',sand:'Areia',brick:'Tijolo',glass:'Vidro'})[t]+'</span></button>').join('');
 for(const b of root.querySelectorAll('[data-block]'))b.onclick=()=>select(b.dataset.block);select(selected);
 root.querySelector('#voxelExit').onclick=()=>{stop();send({type:'voxelLeave'});onExit()};
 for(const button of root.querySelectorAll('[data-move]')){
  const name=button.dataset.move;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);pressed.add(name);button.classList.add('active')},{passive:false});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,()=>{pressed.delete(name);button.classList.remove('active')});
 }
 renderer.domElement.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId)});
 renderer.domElement.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;yaw-=dx*.006;pitch=Math.max(-1.35,Math.min(.8,pitch-dy*.0045));yawControls()});
 for(const ev of ['pointercancel','pointerup','lostpointercapture'])renderer.domElement.addEventListener(ev,()=>drag=null);
 const keyListener=e=>{const names={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
  const name=names[e.code];if(name&&root.isConnected){e.preventDefault();if(e.type==='keydown')pressed.add(name);else pressed.delete(name)}
 };
 const keyDown=e=>keyListener(e),keyUp=e=>keyListener(e);
 window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
 function pick(){yawControls();camera.updateMatrixWorld();raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(meshes,false);
  if(!hits.length)return null;const hit=hits[0],coords=hit.object.userData.coords[hit.instanceId];if(!coords)return null;
  const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
  return {x:coords[0],y:coords[1],z:coords[2],nx:Math.round(normal.x),ny:Math.round(normal.y),nz:Math.round(normal.z)}
 }
 function edit(action){if(!joined){banner('Aguarde a conexão ao servidor');return}
  const hit=pick();if(!hit){banner('Olhe para um bloco próximo');return}
  const x=hit.x+(action==='place'?hit.nx:0),y=hit.y+(action==='place'?hit.ny:0),z=hit.z+(action==='place'?hit.nz:0);
  if(Math.abs(x)>WORLD_LIMIT||Math.abs(z)>WORLD_LIMIT||y<0||y>10){banner('Limite do mundo atingido');return}
  if(action==='place'&&blocks.has(gridKey(x,y,z))){banner('Este espaço está ocupado');return}
  if(action==='place'&&Math.abs(x-px)<1&&Math.abs(z-pz)<1&&y>=py-2&&y<=py){banner('Não coloque bloco sobre você');return}
  send({type:'voxelEdit',x,y,z,block:action==='place'?selected:'air'});
 }
 root.querySelector('#voxelBreak').onclick=()=>edit('break');
 root.querySelector('#voxelPlace').onclick=()=>edit('place');
 function onMessage(m){
  if(!alive)return;
  if(m.type==='voxelSnapshot'){joined=true;status.textContent='Mundo salvo e sincronizado';setEdits(m.edits||{});updateAvatars(m.players||[]);banner('Bem-vindo ao mundo da família')}
  if(m.type==='voxelPresence')updateAvatars(m.players||[]);
  if(m.type==='voxelPlayer'){const entry=players.get(m.player?.id);if(entry){entry.x=m.player.x;entry.z=m.player.z;entry.yaw=m.player.yaw}}
  if(m.type==='voxelBlock'){const key=gridKey(m.x,m.y,m.z);edits[key]=m.block;if(m.block==='air')blocks.delete(key);else blocks.set(key,m.block);rebuild()}
  if(m.type==='voxelError')banner(m.message||'Ação não permitida');
 }
 function onDisconnect(){joined=false;status.textContent='Reconectando ao mundo...'}
 function frame(time){
  if(!alive)return;const dt=Math.min(.05,(time-lastFrame)/1000);lastFrame=time;
  const forward=(pressed.has('forward')?1:0)-(pressed.has('back')?1:0);
  const side=(pressed.has('right')?1:0)-(pressed.has('left')?1:0);
  if(forward||side){const mult=3.75*dt/Math.hypot(forward,side);
   px=Math.max(-10.5,Math.min(10.5,px+(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*mult));
   pz=Math.max(-10.5,Math.min(10.5,pz+(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*mult));
  }
  const floorY=terrainHeight(Math.round(px),Math.round(pz))+2.2;py+=(floorY-py)*Math.min(1,dt*9);orient();
  const hit=pick();cursor.visible=Boolean(hit);if(hit)cursor.position.set(hit.x,hit.y,hit.z);
  for(const entry of players.values()){const mesh=entry.mesh;const h=terrainHeight(Math.round(entry.x),Math.round(entry.z));mesh.position.lerp(new THREE.Vector3(entry.x,h+.5,entry.z),Math.min(1,dt*9));mesh.rotation.y=entry.yaw}
  if(joined&&time-lastPresence>180){lastPresence=time;send({type:'voxelMove',x:px,z:pz,yaw})}
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 function stop(){if(!alive)return;alive=false;joined=false;clearTimeout(flashTimer);
  window.removeEventListener('resize',resize);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);
  pressed.clear();for(const p of players.values())p.mesh.userData.dispose();players.clear();for(const o of meshes){scene.remove(o);o.dispose()}meshes.length=0;
  cursor.geometry.dispose();cursor.material.dispose();geometry.dispose();for(const m of Object.values(mats))m.dispose();cloudMat.dispose();floor.geometry.dispose();floor.material.dispose();
  renderer.dispose();renderer.domElement.remove();
 }
 return {onMessage,onDisconnect,stop};
}
