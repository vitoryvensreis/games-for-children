'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createWebSocketTransport}=require('../ops/opuscraft-headless/ws-transport.cjs');
class Socket extends EventEmitter{
 constructor(){super();this.readyState=1;this.sent=[];this.closed=false}
 send(data,options){this.sent.push({data,options})}
 close(){this.closed=true;this.emit('close')}
}
test('Node ws bridge implements original peer/message/send/disconnect contract',()=>{
 const server=new EventEmitter(),transport=createWebSocketTransport(server);
 const status=[],received=[];
 transport.onPeer((id,online)=>status.push([id,online]));
 transport.onMessage((id,bytes)=>received.push([id,[...bytes]]));
 const socket=new Socket();
 server.emit('connection',socket,{});
 assert.equal(status.length,1);
 const id=status[0][0];
 assert.equal(status[0][1],true);
 socket.emit('message',Buffer.from([1,2,3]),true);
 assert.deepEqual(received,[[id,[1,2,3]]]);
 transport.send(id,new Uint8Array([4]));
 assert.deepEqual([...socket.sent[0].data],[4]);
 transport.disconnect(id);
 assert.equal(transport.peerCount(),0);
 assert.deepEqual(status.at(-1),[id,false]);
 transport.close();
});
test('Node ws bridge rejects unauthorized and text messages',()=>{
 const server=new EventEmitter(),transport=createWebSocketTransport(server,{authenticate:r=>r?.approved===true});
 const unauth=new Socket();
 server.emit('connection',unauth,{approved:false});
 assert.equal(unauth.closed,true);
 const auth=new Socket();
 server.emit('connection',auth,{approved:true});
 auth.emit('message',Buffer.from('text'),false);
 assert.equal(auth.closed,true);
 transport.close();
});

test('browser guest RAW framing matches original upstream websocket transport',()=>{
 const server=new EventEmitter();
 const transport=createWebSocketTransport(server,{opuscraftGuestFrames:true});
 const received=[],changes=[];
 transport.onPeer((id,connected)=>changes.push([id,connected]));
 transport.onMessage((id,data)=>received.push([...data]));
 const socket=new Socket();
 server.emit('connection',socket,{});
 const id=changes[0][0];
 socket.emit('message',Buffer.from([0,9,8,7]),true);
 assert.deepEqual(received,[[9,8,7]]);
 transport.send(id,new Uint8Array([6,5]));
 assert.deepEqual([...socket.sent[0].data],[0,6,5]);
 socket.emit('message',Buffer.from([1,1,2]),true);
 assert.equal(socket.closed,true,'compressed guest messages must be refused');
 transport.close();
});
