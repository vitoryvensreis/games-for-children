'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('PS2 assets and page are protected by server-side admin authorization',()=>{
 const server = read('server.cjs');
 assert.match(server,/pathname\.startsWith\('\/ps2\/'\)/);
 assert.match(server,/ps2Auth\.u\.role\s*!==\s*'admin'/);
 assert.match(server,/Cross-Origin-Opener-Policy/);
 assert.match(server,/Cross-Origin-Embedder-Policy/);
 assert.match(server,/ps2\?'private, no-store, max-age=0'/);
});
test('PWA cannot cache private PS2 content',()=>{
 assert.match(read('public/sw.js'),/u\.pathname\.startsWith\('\/ps2\/'\)/);
});
test('local disc input and admin lab action are wired',()=>{
 const page = read('public/ps2/index.html');
 const client = read('public/ps2/app.js');
 const app = read('public/app.js');
 assert.match(client,/file\.slice\(offset, offset \+ size\)\.arrayBuffer/);
 assert.match(client,/bootDiscImage/);
 assert.match(page,/id="iso"/);
 assert.match(app,/id="adminPS2"/);
});
