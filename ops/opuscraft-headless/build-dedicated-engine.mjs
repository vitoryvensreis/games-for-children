#!/usr/bin/env node
// Experimental dedicated engine bundle builder. Run from the pinned upstream
// OpusCraft checkout after npm ci + installation of esbuild.
// Produces an actual server-importable Node ESM module without browser globals.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const upstream=process.argv[2],output=process.argv[3];
if(!upstream||!output||!fs.existsSync(path.join(upstream,'src/game/level.ts')))
 throw Error('Usage: node build-dedicated-engine.mjs UPSTREAM_DIR OUTPUT_FILE');
const requireUpstream=createRequire(path.join(upstream,'package.json'));
const {build}=requireUpstream('esbuild');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'opuscraft-dedicated-entry-'));
try {
 const imp=(p)=>JSON.stringify(path.join(upstream,'src',p).replaceAll('\\','/'));
 const entry=path.join(tmp,'entry.ts');
 fs.writeFileSync(entry,[
  `import ${imp('world/blocks.ts')};`,
  `export {World} from ${imp('world/world.ts')};`,
  `export {ChunkGenerator} from ${imp('world/gen/generator.ts')};`,
  `export {Chunk} from ${imp('world/chunk.ts')};`,
  `export {Level} from ${imp('game/level.ts')};`,
  `export {HostServer} from ${imp('net/server/hostServer.ts')};`,
  `export {savePlayer} from ${imp('game/playerData.ts')};`
 ].join('\n'));
 fs.mkdirSync(path.dirname(output),{recursive:true});
 await build({entryPoints:[entry],outfile:output,bundle:true,format:'esm',
  platform:'node',target:'node24',logLevel:'warning',
  define:{__BUILD_ID__:JSON.stringify('headless-dedicated-v1')}});
 if(!fs.statSync(output).size)throw Error('Empty dedicated engine bundle');
 console.log('OPUSCRAFT_DEDICATED_ENGINE_BUNDLE_OK');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
