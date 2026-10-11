'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Only OpusCraft remains as the active block-building game integration',()=>{
 const server=read('server.cjs');
 const app=read('public/app.js');
 const workflow=read('.github/workflows/deploy.yml');
 assert.match(server,/launchOpusHost\(\)/);
 assert.match(server,/pathname==='\/api\/opuscraft\/teleport'/);
 assert.match(server,/pathname==='\/api\/admin\/opuscraft\/status'/);
 assert.match(app,/openOpusCraft\(/);
 assert.match(workflow,/ops\/build-opuscraft\.sh/);
 assert.doesNotMatch(server,/MCGalaxy|mcgalaxy|ClassiCube|classicube|cubeWss|cubeSessions|setupMCGalaxy/);
 assert.doesNotMatch(workflow,/Restore ClassiCube|Restaurar compila[cç][aã]o ClassiCube|rm -rf public\/classicube/);
 assert.equal(fs.existsSync(path.join(root,'public','classicube','index.html')),false);
 for(const name of ['family-village.cjs','exploration-world.cjs','mining-world.cjs','family-play.cjs','minecraft-control.cjs'])
  assert.equal(fs.existsSync(path.join(root,'database',name)),false,name+' must not be shipped');
});

test('Deploy retains the OpusCraft family world and archives obsolete saves before deleting old runtimes',()=>{
 const deploy=read('ops/deploy-opuscraft-vps.sh');
 const archive=deploy.indexOf('backup/classicube-legacy.tar.gz');
 const health=deploy.indexOf('OPUSCRAFT_PERMANENT_WORLD_READY');
 const cleanup=deploy.indexOf('rm -rf public/classicube vendor/mcgalaxy');
 assert.ok(archive>=0&&health>archive&&cleanup>health);
 assert.match(deploy,/backup\/opuscraft-profile-latest\.tar\.gz/);
 assert.doesNotMatch(deploy,/rm -rf (?:data\/opuscraft|backup\/classicube-legacy|data\/state\.json)/);
});
