const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const zlib=require('node:zlib');
const {ROOMS,playerName,initHomes,familyInfo,writePolicy,makeSkin}=require('../database/family-play.cjs');
test('House ownership is stable and account-derived',()=>{
 const a={name:'Caíque',id:'aaaaaaaa-aaaa',role:'child',enabled:true};
 const b={name:'Cauã',id:'bbbbbbbb-bbbb',role:'child',enabled:true};
 const state={users:[a,b]};
 assert.equal(initHomes(state),true);assert.equal(initHomes(state),false);
 assert.equal(state.minecraftHouses[1],a.id);assert.equal(state.minecraftHouses[2],b.id);
 assert.equal(playerName(a),'Caique_aaaa');
 assert.equal(familyInfo(state,a,new Set([a.id])).homes[0].mine,true);
 assert.equal(ROOMS.length,4);
});
test('Trusted policy writes and preserves owner assignments',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gfc-family-'));
 try{
  const state={users:[{name:'Amigo',id:'aaaaaaaa-aaa',role:'child',enabled:true}],minecraftHouses:{1:'aaaaaaaa-aaa'}};
  assert.equal(writePolicy(state,folder),true);
  assert.match(fs.readFileSync(path.join(folder,'properties','gfc-family-policy.txt'),'utf8'),/H\|1\|Amigo_aaaa/);
  assert.equal(writePolicy(state,folder),false);
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
});
test('Built-in skins are self-hosted PNG files',()=>{
 for(const skin of ['azul','verde','rosa','roxo']){
  const png=makeSkin(skin);
  assert.equal(png.readUInt32BE(16),64);
  assert.equal(png.readUInt32BE(20),32);
  const size=png.readUInt32BE(33);
  assert.equal(zlib.inflateSync(png.subarray(41,41+size)).length,32*(1+64*4));
 }
});
test('Plugin protects houses on the server and interface offers controls',()=>{
 const p=fs.readFileSync(path.resolve(__dirname,'../plugins/family-play/FamilyPlay.cs'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../public/classicube/index.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../public/classicube/family-menu.js'),'utf8');
 assert.match(p,/OnBlockChangingEvent.Register/);
 assert.match(p,/p.RevertBlock\(x,y,z\)/);
 assert.match(p,/IsParent\(p\)/);
 assert.match(p,/PlayerOperations.TeleportToEntity/);
 assert.match(html,/window.familyGameSocket=socket/);
 assert.match(ui,/new Uint8Array\(66\)/);
 assert.match(ui,/packet\[0\]=0x0d/);
});
