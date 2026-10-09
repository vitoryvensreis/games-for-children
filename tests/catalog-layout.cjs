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
 assert.match(app,/screen\.orientation\?\.lock\('landscape'\)/);
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
});
