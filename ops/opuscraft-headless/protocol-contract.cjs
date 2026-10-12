'use strict';
// Audited against Oppenheimerism/OpusCraft commit bc0c753f730ef15bc8f8acf093d40797700b87ee.
// This is a boundary contract, NOT an implementation of upstream packets.
const PROTOCOL_VERSION=8;
const CHUNK_SIZE=16;
const MAX_GUESTS=7;
const MAX_GUEST_MESSAGE=320*1024;
const MAX_HOST_MESSAGE=16*1024*1024;
const GUEST_VIEW_DISTANCE=8;
const CHUNKS_PER_TICK=6;
const TICKS_PER_SECOND=20;
const SB=Object.freeze({Hello:0,KeepAlive:1,MovePlayer:2,AcceptTeleportation:3,PlayerAction:4,
 SetCarriedItem:5,SetCreativeModeSlot:6,Chat:7,ChatCommand:8,Disconnect:9,
 ContainerClick:10,ContainerButtonClick:11,ContainerClose:12,RenameItem:13,
 SelectTrade:14,SlotStateChanged:15,PickItem:16,ClientCommand:17,EditBook:18,PlaceRecipe:19,
 Resync:20,SignUpdate:40,Pong:60});
const CB=Object.freeze({Login:0,Disconnect:1,KeepAlive:2,LevelChunk:3,ForgetLevelChunk:4,
 BlockUpdates:5,BlockEntityData:6,BlockDestruction:7,SetTime:8,Weather:9});
function checkHello(value,{buildId,joinCode}={}){
 // Original SB.Hello includes the access code in field 6.
 if(!Array.isArray(value)||value.length!==7||value[0]!==SB.Hello)
  throw Error('Expected [id,protocol,build,name,uuid,viewDistance,joinCode]');
 const [,version,build,name,uuid,viewDistance,code]=value;
 if(version!==PROTOCOL_VERSION)throw Error('Protocol version mismatch');
 if(typeof build!=='string'||!build||build.length>64||(buildId&&build!==buildId))
  throw Error('Client build mismatch');
 if(typeof name!=='string'||name.length>64)throw Error('Invalid player name');
 if(typeof uuid!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid))
  throw Error('Invalid UUID');
 if(!Number.isInteger(viewDistance)||viewDistance<2||viewDistance>32)
  throw Error('Invalid view distance');
 if(typeof code!=='string'||code.length>32||(joinCode!==undefined&&code!==joinCode))
  throw Error('Invalid world join code');
 return {version,build,name,uuid,viewDistance:Math.min(viewDistance,GUEST_VIEW_DISTANCE)};
}
function visibleChunks(cx,cz,radius=GUEST_VIEW_DISTANCE){
 if(!Number.isInteger(cx)||!Number.isInteger(cz)||!Number.isInteger(radius)||radius<0||radius>GUEST_VIEW_DISTANCE)
  throw Error('Invalid visibility window');
 const out=[];
 for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)
  if(dx*dx+dz*dz<=radius*radius)out.push({cx:cx+dx,cz:cz+dz,distance2:dx*dx+dz*dz});
 out.sort((a,b)=>a.distance2-b.distance2||a.cz-b.cz||a.cx-b.cx);
 return out;
}
module.exports={PROTOCOL_VERSION,CHUNK_SIZE,MAX_GUESTS,MAX_GUEST_MESSAGE,MAX_HOST_MESSAGE,
 GUEST_VIEW_DISTANCE,CHUNKS_PER_TICK,TICKS_PER_SECOND,SB,CB,checkHello,visibleChunks};
