'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PROTOCOL_VERSION,SB,CB,checkHello,visibleChunks,GUEST_VIEW_DISTANCE}=require('../ops/opuscraft-headless/protocol-contract.cjs');
test('upstream pinned packet ids and version',()=>{
 assert.equal(PROTOCOL_VERSION,8);assert.equal(SB.Hello,0);assert.equal(SB.MovePlayer,2);
 assert.equal(SB.PlayerAction,4);assert.equal(CB.LevelChunk,3);assert.equal(CB.BlockUpdates,5);
});
test('reject mismatched protocol/build and malformed players',()=>{
 const hello=[0,8,'pinned-build','Family_1','c035d1b0-ff29-4135-8f70-81c9bd5a61c3',8,'join-123'];
 assert.equal(checkHello(hello,{buildId:'pinned-build',joinCode:'join-123'}).viewDistance,8);
 assert.throws(()=>checkHello([...hello.slice(0,1),7,...hello.slice(2)]));
 assert.throws(()=>checkHello(hello,{buildId:'other-build'}));
 assert.throws(()=>checkHello([0,8,'pinned-build','x','uuid-too-short',8]));
 assert.equal(checkHello([...hello.slice(0,5),16,hello[6]]).viewDistance,GUEST_VIEW_DISTANCE);
 assert.throws(()=>checkHello([...hello.slice(0,6),'bad-code'],{joinCode:'join-123'}));
 assert.throws(()=>checkHello(hello.slice(0,6)));
});
test('visibility sends nearest chunks first and caps radius',()=>{
 const chunks=visibleChunks(10,-10,2);
 assert.deepEqual(chunks[0],{cx:10,cz:-10,distance2:0});
 assert.ok(chunks.every(c=>c.distance2<=4));
 assert.throws(()=>visibleChunks(0,0,999));
});
