const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Mundo de Blocos removido da biblioteca e do painel do ADM',()=>{
 const app=read('public/app.js');
 assert.doesNotMatch(app,/Mundo de Blocos 3D/);
 assert.doesNotMatch(app,/openVoxelGame|adminVoxel|voxelController/);
 const sw=read('public/sw.js');
 assert.doesNotMatch(sw,/\/voxel\.js/);
});

test('ClassiCube tem orientação horizontal e não corta o jogo',()=>{
 const app=read('public/app.js');
 const css=read('public/style.css');
 const html=read('public/classicube/index.html');
 assert.match(app,/screen\.orientation\.lock\('landscape'\)/);
 assert.match(app,/classicubeRotate/);
 assert.match(app,/classicubeTryLandscape/);
 assert.match(css,/\.classicube-embed iframe\{position:absolute!important/);
 assert.match(css,/env\(safe-area-inset-left/);
 assert.match(css,/\.classicube-rotate\[hidden\]/);
 assert.match(html,/window\.resizeGameCanvas/);
 assert.match(html,/window\.devicePixelRatio/);
 assert.match(html,/touch-action:none/);
 // The client uses ClassiCube's native left thumbstick and right-hand action controls.
 assert.match(html,/ClassiCube\.js/);
 // The native game already includes left/right mobile controls. Do not duplicate them in HTML.
 assert.doesNotMatch(html,/mobileGamePad|cc-pad-left|cc-pad-right/);
 assert.match(html,/id="familyPad"/);
 assert.match(html,/family-pad-panel/);
 assert.match(html,/background:radial-gradient/,'Controles com acabamento circular tridimensional');
 assert.match(html,/\.family-pad-panel\{[\s\S]*?border-radius:50%/,'Base do joystick deve ser redonda');
 assert.match(html,/\.joystick-thumb\{[\s\S]*?border-radius:50%/,'Manete analógica deve ser redonda');
 assert.match(html,/\.family-pad-right button\{[\s\S]*?border-radius:50%/,'Botões de ação devem ser redondos');
 assert.match(html,/class="family-pad-panel family-pad-left"/);
 assert.match(html,/class="family-pad-panel family-pad-right"/);
 assert.match(html,/id="familyJoystick"/);
 assert.match(html,/id="familyStick"/);
 assert.doesNotMatch(html,/class="family-pad-grid"/,'Remover quatro botões antigos');
 assert.match(html,/function updateStick\(clientX,clientY\)/,'Joystick acompanha o dedo');
 assert.match(html,/function updateMovement\(next\)/,'Joystick mantém movimentos simultâneos');
 for(const direction of ['KeyW','KeyA','KeyS','KeyD']){
   assert.match(html,new RegExp("keys\\.add\\('"+direction+"'\\)"),'Movimentação deve aceitar '+direction);
 }
 assert.match(html,/function releaseStick\(\)/,'Soltar os movimentos após arrastar');
 assert.match(html,/pointercancel','lostpointercapture/,'Evitar comandos travados quando o toque é cancelado');
 assert.match(html,/function keyEvent\(type,code\)/);
 assert.match(html,/function mouseEvent\(type,button\)/);
 assert.match(html,/data-key="Space"/);
 assert.match(html,/data-mouse="2"/);
 assert.match(html,/data-mouse="0"/);
 assert.match(html,/setPointerCapture/);
 assert.match(html,/touchstart','touchmove','touchend','touchcancel/);
 assert.equal((html.match(/id="familyPad"/g)||[]).length,1);
});


test('Mundo de aventura e salvamento são persistentes e não substituem mundos existentes',()=>{
 const server=read('server.cjs');
 assert.match(server,/const ADVENTURE_MAP='aventura'/);
 assert.match(server,/if\(!fs\.existsSync\(world\)\)/,'Não regenerar mapa já criado');
 assert.match(server,/writeCommand\('\/newlvl '/);
 assert.match(server,/ADVENTURE_SIZE\+' Classic '/);
 assert.match(server,/writeCommand\('\/main '/);
 assert.match(server,/mcgalaxyProcess\.stdin\.write\('\/save all/);
 assert.match(server,/backup-time':'300'/);
 assert.match(server,/fs\.copyFileSync\(original,archive\)/);
});
