'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initHomes}=require('../database/family-play.cjs');

test('Regression: legacy MySQL game_state is normalized after loading, before serving house assignments',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
 const select=server.indexOf('const result=await sqlStore.start(DB');
 const normalise=server.indexOf('const missingHomes=',select);
 const ready=server.indexOf('ensureAdmin();setupMCGalaxy();',normalise);
 assert.ok(select>=0&&normalise>select&&ready>normalise,'Normalize after MySQL decides which snapshot is authoritative');
 assert.match(server,/state\.minecraftHouses\[id\]=userId;save\(\)/);
 const legacy={users:[{id:'kid-1',name:'Crianca',role:'child',enabled:true}],sessions:[],events:[],games:[]};
 assert.equal(initHomes(legacy),true);
 assert.equal(legacy.minecraftHouses['1'],'kid-1');
 assert.equal(initHomes(legacy),false,'Preserve existing house assignment');
 legacy.minecraftHouses['1']='changed-by-admin';
 assert.equal(initHomes(legacy),false);
 assert.equal(legacy.minecraftHouses['1'],'changed-by-admin');
});

test('Regression: keyboard focus is restored for desktop movement keys',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/classicube/index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 assert.match(html,/id="canvas" tabindex="0"/);
 assert.match(html,/KeyW','KeyA','KeyS','KeyD','Space/);
 assert.match(html,/postRun:\[\(\)=>/);
 assert.match(html,/canvas\.focus\(\{preventScroll:true\}\)/);
 assert.match(app,/gameFrame\.contentWindow\.focus\(\)/);
 assert.match(app,/gameFrame\.contentDocument\?\.getElementById\('canvas'\)\?\.focus/);
});

test('Bloco C: server-side landmarks, timed challenges, persistent prizes and cooperative rewards',()=>{
 const plugin=fs.readFileSync(path.join(__dirname,'../plugins/family-play/FamilyPlay.cs'),'utf8');
 const menu=fs.readFileSync(path.join(__dirname,'../public/classicube/family-menu.js'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
 assert.match(plugin,/OnPlayerMoveEvent\.Register\(AdventureMove, Priority\.Low\)/);
 assert.match(plugin,/next\.FeetBlockCoords/);
 assert.match(plugin,/treasureTargets=new int\[,]/);
 assert.match(plugin,/sprintTargets=new int\[,]/);
 assert.match(plugin,/DateTime\.UtcNow\.AddMinutes\(3\)/);
 assert.match(plugin,/q\.Stars\+=3/);
 assert.match(plugin,/q\.Stars\+=5/);
 assert.match(plugin,/teamReady\.Count>=2/);
 assert.match(plugin,/properties\/gfc-family-adventures\.tsv/);
 assert.match(plugin,/File\.Move\(temp,QuestFile,true\)/);
 assert.match(plugin,/OnLevelLoadedEvent\.Register\(SetupFamilyWorld, Priority\.Low\)/);
 assert.match(plugin,/PlayerBot\.Add\(creature,false\)/);
 assert.match(menu,/\/familia tesouro/);
 assert.match(menu,/\/familia corrida/);
 assert.match(menu,/data\.adventures\?\.own\?\.stars/);
 assert.match(server,/function adventureStatus\(u\)/);
 assert.match(server,/adventures:adventureStatus\(u\)/);
 assert.doesNotMatch(plugin,/File\.(?:Write|Delete|Move).*vila_familia\.lvl/);
});
