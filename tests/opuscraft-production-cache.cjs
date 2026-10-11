'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Production OpusCraft never serves stale JavaScript/HTML and tracks build version',()=>{
 const server=read('server.cjs'),app=read('public/app.js'),build=read('ops/build-opuscraft.sh');
 assert.match(server,/function opuscraftStaticHeaders\(file,ext\)/);
 assert.match(server,/file==='opuscraft\/index.html'/);
 assert.match(server,/max-age=31536000, immutable/);
 assert.match(server,/zlib\.gzip\(body,\{level:5\}/);
 assert.match(server,/Content-Encoding':'gzip'/);
 assert.match(server,/Accept-Encoding/);
 assert.match(server,/GFC-BUILD-ID\.txt/);
 assert.match(build,/GFC-BUILD-ID\.txt/);
 assert.match(app,/status\.clientVersion/);
 assert.ok(app.includes('Date.now()'));
});

test('OpusCraft websocket probe validates real world listing, not any /ws response',async()=>{
 const src=read('public/app.js');
 const start=src.indexOf('async function verifyOpuscraftWebSocket(){'),end=src.indexOf('async function openOpusCraft(){',start);
 assert.ok(start>=0&&end>start,'preflight must be implemented');
 const source=src.slice(start,end);
 const urls=[];
 let respond=()=>JSON.stringify({t:'worlds',worlds:[{name:'Mundo da Família'}]});
 class MockSocket {
  constructor(url){
   urls.push(url);
   this.readyState=1;
   setTimeout(()=>this.onmessage?.({data:respond()}),1);
  }
  close(){this.readyState=3}
 }
 const context=vm.createContext({WebSocket:MockSocket,location:{protocol:'https:',host:'gamesforchildren.escotilhaprodutora.com'},setTimeout,clearTimeout,Promise,Error,JSON,Array});
 vm.runInContext(source+';globalThis.probe=verifyOpuscraftWebSocket;',context);
 await context.probe();
 assert.match(urls[0],/^wss:\/\/gamesforchildren\.escotilhaprodutora\.com\/ws\?opus=1&role=list$/);
 // A normal GamesNavagador lobby websocket is not an OpusCraft relay.
 respond=()=>JSON.stringify({type:'hello',user:{role:'admin'}});
 await assert.rejects(context.probe(),/serviço errado/);
});
