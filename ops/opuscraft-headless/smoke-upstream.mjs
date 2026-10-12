#!/usr/bin/env node
// Integration proof: load the actual pinned upstream Level and HostServer in
// pure Node. Runs in CI from inside the cloned upstream checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const upstream=process.argv[2];
if(!upstream||!fs.existsSync(path.join(upstream,'src/game/level.ts')))
 throw Error('Expected cloned upstream OpusCraft checkout as argument');
const requireUpstream=createRequire(path.join(upstream,'package.json'));
const {build}=requireUpstream('esbuild');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'opuscraft-node-smoke-'));
try{
 const entry=path.join(temp,'headless-entry.ts');
 fs.writeFileSync(entry,`import {World} from '${path.join(upstream,'src/world/world.ts').replaceAll('\\','/')}';
import {Level} from '${path.join(upstream,'src/game/level.ts').replaceAll('\\','/')}';
import {HostServer} from '${path.join(upstream,'src/net/server/hostServer.ts').replaceAll('\\','/')}';
export {World,Level,HostServer};`);
 const output=path.join(temp,'server.mjs');
 await build({entryPoints:[entry],outfile:output,bundle:true,format:'esm',platform:'node',
  target:'node22',logLevel:'warning',define:{__BUILD_ID__:JSON.stringify('headless-integration-smoke')}});
 // Reject runtime reliance on browser globals instead of adding mock DOM/WebGL.
 const {World,Level,HostServer}=await import(pathToFileURL(output).href);
 assert.equal(typeof HostServer,'function','HostServer must be loadable without a browser');
 const world=new World();
 const level=new Level(world,'24h-seed');
 assert.equal(level.world,world);
 assert.equal(level.seed,'24h-seed');
 console.log('OPUSCRAFT_REAL_LEVEL_HEADLESS_NODE_IMPORT_OK');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
