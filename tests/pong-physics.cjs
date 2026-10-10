const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PONG,stepPongBall}=require('../database/pong-physics.cjs');

const g=(x,y,vx,vy)=>({x,y,vx,vy,bounces:0});

test('Pong: center of ball makes contact at the visible left paddle surface',()=>{
 assert.equal(PONG.LEFT_CONTACT,(22+7+9)/360);
 assert.equal(PONG.RIGHT_CONTACT,(360-22-7-9)/360);
 const ball=g(.16,.5,-1.1,.03);
 assert.equal(stepPongBall(ball,.075,.5,.5),'leftHit');
 assert.ok(ball.vx>0,'Ball must rebound towards the middle');
 assert.ok(ball.x>=PONG.LEFT_CONTACT,'Ball cannot pass through the left racket');
 assert.equal(ball.bounces,1);
});

test('Pong: center of ball makes contact at the visible right paddle surface',()=>{
 const ball=g(.84,.5,1.1,-.03);
 assert.equal(stepPongBall(ball,.075,.5,.5),'rightHit');
 assert.ok(ball.vx<0,'Ball must rebound towards the middle');
 assert.ok(ball.x<=PONG.RIGHT_CONTACT,'Ball cannot pass through the right racket');
 assert.equal(ball.bounces,1);
});

test('Pong: high-speed swept collision cannot skip a racket between server ticks',()=>{
 const ball=g(.19,.5,-1.1,0);
 assert.equal(stepPongBall(ball,.075,.5,.5),'leftHit');
 assert.ok(ball.x>=PONG.LEFT_CONTACT);
});

test('Pong: ball misses outside the drawn racket including its radius',()=>{
 const above=g(.17,.28,-.95,0);
 assert.equal(stepPongBall(above,.075,.5,.5),'leftMiss');
 const below=g(.83,.74,.95,0);
 assert.equal(stepPongBall(below,.075,.5,.5),'rightMiss');
});

test('Pong: near-edge hits still count because the ball has a radius',()=>{
 const edge=g(.16,.5+PONG.HIT_HALF_HEIGHT-.004,-.9,0);
 assert.equal(stepPongBall(edge,.075,.5,.5),'leftHit');
});

test('Pong: ball reflects at top and bottom, staying inside the canvas',()=>{
 const top=g(.5,.018,.2,-.5);
 stepPongBall(top,.04,.5,.5);
 assert.ok(top.y>=PONG.BALL_TOP);assert.ok(top.vy>0);
 const bottom=g(.5,.982,-.2,.5);
 stepPongBall(bottom,.04,.5,.5);
 assert.ok(bottom.y<=PONG.BALL_BOTTOM);assert.ok(bottom.vy<0);
});

test('Pong: frontend has bounded ball rendering and no horizontal page scroll',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../public/app.js'),'utf8');
 const css=fs.readFileSync(path.resolve(__dirname,'../public/style.css'),'utf8');
 assert.match(app,/ResizeObserver\(fitPong\)/);
 assert.match(app,/pongCanvasObserver\?\.disconnect\(\)/);
 assert.match(app,/previous\.bounceId!==m\.bounceId/);
 assert.match(app,/Math\.max\(left,Math\.min\(right,tx\)\)/);
 assert.match(css,/html:has\(\.pong-game\),body:has\(\.pong-game\)/);
 assert.match(css,/overflow-x:hidden!important/);
 assert.match(css,/overscroll-behavior:none!important/);
 assert.match(css,/\.pong-game \.pong-stage canvas\{/);
});
