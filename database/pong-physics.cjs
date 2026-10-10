'use strict';
// Collision geometry matches the original 360 x 560 Canvas render:
// paddle x=22 / 338, paddle width=14, paddle height=96, ball radius=9.
const PONG=Object.freeze({
  LEFT_CONTACT:(22+7+9)/360,
  RIGHT_CONTACT:(360-22-7-9)/360,
  HIT_HALF_HEIGHT:(48+9)/560,
  BALL_TOP:9/560,
  BALL_BOTTOM:1-9/560,
  MAX_SPEED:1.10,
});

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function bounceVertical(g){
  // Mirror the overshoot instead of clipping the ball through a wall.
  if(g.y<PONG.BALL_TOP){g.y=PONG.BALL_TOP+(PONG.BALL_TOP-g.y);g.vy=Math.abs(g.vy)}
  if(g.y>PONG.BALL_BOTTOM){g.y=PONG.BALL_BOTTOM-(g.y-PONG.BALL_BOTTOM);g.vy=-Math.abs(g.vy)}
  g.y=clamp(g.y,PONG.BALL_TOP,PONG.BALL_BOTTOM);
}

// Modifies g in-place and returns which side was hit/missed (or null).
// Uses swept collision, so a fast ball cannot cross a paddle between server frames.
function stepPongBall(g,dt,leftPaddle,rightPaddle){
  dt=clamp(Number.isFinite(dt)?dt:0,0,.075);
  if(!dt)return null;
  const startX=g.x,startY=g.y,travelX=g.vx*dt;
  const candidateX=startX+travelX;
  const left=g.vx<0&&candidateX<=PONG.LEFT_CONTACT;
  const right=g.vx>0&&candidateX>=PONG.RIGHT_CONTACT;
  if(!left&&!right){
    g.x=candidateX;g.y=startY+g.vy*dt;bounceVertical(g);
    return null;
  }
  const limit=left?PONG.LEFT_CONTACT:PONG.RIGHT_CONTACT;
  const ratio=clamp((limit-startX)/travelX,0,1);
  g.x=limit;g.y=startY+g.vy*dt*ratio;bounceVertical(g);
  const paddle=clamp(left?leftPaddle:rightPaddle,.13,.87);
  if(Math.abs(g.y-paddle)>PONG.HIT_HALF_HEIGHT+.002)return left?'leftMiss':'rightMiss';
  g.vx=(left?1:-1)*Math.min(PONG.MAX_SPEED,Math.abs(g.vx)*1.045);
  g.vy=clamp(g.vy+(g.y-paddle)*1.15,-.72,.72);
  g.bounces=(g.bounces||0)+1;
  const remaining=dt*(1-ratio);
  g.x=clamp(limit+g.vx*remaining,PONG.LEFT_CONTACT,PONG.RIGHT_CONTACT);
  g.y+=g.vy*remaining;
  bounceVertical(g);
  return left?'leftHit':'rightHit';
}

module.exports={PONG,stepPongBall};
