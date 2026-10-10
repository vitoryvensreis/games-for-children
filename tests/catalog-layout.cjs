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
 assert.doesNotMatch(html,/mobileGamePad|cc-pad-left|cc-pad-right|data-mouse=/);
 assert.match(html,/id="familyPad"/);
 assert.match(html,/family-pad-panel/);
 assert.match(html,/background:#122747/,'O painel deve cobrir visualmente os controles originais');
 assert.match(html,/data-key="KeyW"/);
 assert.match(html,/data-key="KeyA"/);
 assert.match(html,/data-key="KeyS"/);
 assert.match(html,/data-key="KeyD"/);
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
