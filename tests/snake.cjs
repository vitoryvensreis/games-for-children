const {test}=require('node:test');
const assert=require('node:assert/strict');
const {nextSnakeCell}=require('../public/snake-rules.js');

test('Cobrinha atravessa as quatro bordas',()=>{
 assert.deepEqual(nextSnakeCell({x:0,y:5},{x:-1,y:0},20,25),{x:19,y:5});
 assert.deepEqual(nextSnakeCell({x:19,y:5},{x:1,y:0},20,25),{x:0,y:5});
 assert.deepEqual(nextSnakeCell({x:3,y:0},{x:0,y:-1},20,25),{x:3,y:24});
 assert.deepEqual(nextSnakeCell({x:3,y:24},{x:0,y:1},20,25),{x:3,y:0});
 assert.deepEqual(nextSnakeCell({x:7,y:8},{x:1,y:0},20,25),{x:8,y:8});
});
