const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const webpush=require('web-push');
const sqlStore=require('./database/store.cjs');
const PORT=Number(process.env.PORT||3100), HOST='127.0.0.1';
const ROOT=__dirname, DATA=process.env.DATA_DIR||path.join(ROOT,'data'), DB=path.join(DATA,'state.json');
const DAY=86400000;fs.mkdirSync(DATA,{recursive:true,mode:0o700});
let state={users:[],sessions:[],events:[],games:[]};
try{state=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
for(const k of ['users','sessions','events','games','pushSubscriptions'])state[k]??=[];
const VAPID_PUBLIC_KEY=process.env.VAPID_PUBLIC_KEY||'';
if(VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT){webpush.setVapidDetails(process.env.VAPID_SUBJECT,VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY)}
const PUSH_READY=Boolean(VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
const TURN_URLS=(process.env.TURN_URLS||'').split(',').map(v=>v.trim()).filter(Boolean);
const ICE_SERVERS=[{urls:'stun:stun.l.google.com:19302'},...(TURN_URLS.length&&process.env.TURN_USERNAME&&process.env.TURN_PASSWORD?[{urls:TURN_URLS,username:process.env.TURN_USERNAME,credential:process.env.TURN_PASSWORD}]:[])];
function save(){const tmp=DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,DB);sqlStore.persist(state)}
const uuid=()=>crypto.randomUUID(), now=()=>Date.now();
const hash=(s,salt)=>crypto.scryptSync(String(s),salt,64).toString('hex');
function password(pass){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+hash(pass,salt)}
function verify(pass,stored){try{const [salt,h]=stored.split(':');return crypto.timingSafeEqual(Buffer.from(hash(pass,salt),'hex'),Buffer.from(h,'hex'))}catch{return false}}
function ensureAdmin(){
if(!state.users.some(u=>u.role==='admin')){
 const p=process.env.ADMIN_PASSWORD||'';
 if(p.length<12)throw Error('Defina ADMIN_PASSWORD com 12+ caracteres no systemd antes de iniciar o aplicativo');
 state.users.push({id:uuid(),name:'Administrador',role:'admin',pass:password(p),enabled:true,loginEnabled:true,dailyLimit:1440,version:0,voiceEnabled:true});save();
 console.log('Administrador criado; remova ADMIN_PASSWORD do ambiente depois do primeiro start');
}
}
const ADMIN=()=>state.users.find(u=>u.role==='admin');
const bucket=new Map();
function limit(ip){const a=bucket.get(ip)||[];const b=a.filter(t=>now()-t<900000);b.push(now());bucket.set(ip,b);return b.length<=15}
function localDay(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(t)}
function usage(u){const d=localDay(now());return state.sessions.filter(s=>s.userId===u.id).reduce((sum,s)=>sum+(s.daily?.[d]||0),0)}
function activeUser(u){return [...peers.values()].some(p=>p.user.id===u.id&&p.ws.readyState===1)||state.sessions.some(s=>s.userId===u.id&&!s.revoked&&s.expires>now()&&s.lastSeen&&now()-s.lastSeen<45000)}
function touch(s){const t=now();if(!s.lastTick){s.lastTick=t;return}const delta=Math.min(t-s.lastTick,15000);s.lastTick=t;if(delta>0&&delta<16000){const k=localDay(t);s.daily??={};s.daily[k]=(s.daily[k]||0)+delta}}
function checkSession(req){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gfc_sid='))?.slice(8);if(!value)return null;const key=crypto.createHash('sha256').update(value).digest('hex');const s=state.sessions.find(s=>s.key===key&&!s.revoked&&s.expires>now());const u=s&&state.users.find(u=>u.id===s.userId&&u.enabled&&u.version===s.version);if(!u||u.role==='child'&&usage(u)>=u.dailyLimit*60000)return null;return {s,u}}
function end(s){touch(s);s.revoked=true;for(const p of peers.values())if(p.session===s){emit(p.ws,{type:'logout'});p.ws.close(4001,'Sessão encerrada')}save()}
function userInfo(u){return {id:u.id,name:u.name,role:u.role,enabled:u.enabled,loginEnabled:u.loginEnabled,dailyLimit:u.dailyLimit,voiceEnabled:u.voiceEnabled,usedSeconds:Math.floor(usage(u)/1000),online:activeUser(u),hasPhoto:Boolean(u.photo)}}
function json(res,status,obj,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(obj))}
function readBody(req){return new Promise((resolve,reject)=>{let text='';req.on('data',b=>{text+=b;if(text.length>20000){reject(Error('payload excessivo'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(text||'{}'))}catch{reject(Error('JSON inválido'))}});req.on('error',reject)})}
async function pushAdmins(title,body){if(!PUSH_READY)return;const targets=state.pushSubscriptions.filter(s=>state.users.some(u=>u.id===s.userId&&u.role==='admin'&&u.enabled));await Promise.allSettled(targets.map(async entry=>{try{await webpush.sendNotification(entry.subscription,JSON.stringify({title,body,url:'/'}),{TTL:90,urgency:'normal'})}catch(err){if(err.statusCode===404||err.statusCode===410){state.pushSubscriptions=state.pushSubscriptions.filter(s=>s.endpoint!==entry.endpoint);save()}else console.error('Push falhou:',err.statusCode||err.message)}}))}
function track(u,type){state.events.unshift({id:uuid(),userId:u.id,name:u.name,type,at:now()});state.events=state.events.slice(0,1000);save();admins({type:'notice',text:u.name+': '+type});if(u.role==='child'&&['online','offline','entrou','desconectado pelo ADM'].includes(type))void pushAdmins('GamesForChildren',u.name+' — '+type)}
const peers=new Map(), rooms=new Map(), voxelPeers=new Map();
const VOXEL_TYPES=new Set(['air','grass','dirt','stone','wood','leaves','sand','brick','glass']);
function voxelWorld(){state.voxelWorld??={version:1,edits:{}};state.voxelWorld.edits??={};return state.voxelWorld}
function voxelUsers(){return [...voxelPeers.values()].map(p=>({id:p.user.id,name:p.user.name,role:p.user.role,x:p.voxelPos?.x??0,z:p.voxelPos?.z??4,yaw:p.voxelPos?.yaw??0}))}
function voxelBroadcast(data){for(const p of voxelPeers.values())emit(p.ws,data)}
function voxelDepart(p){if(!voxelPeers.has(p.id))return;voxelPeers.delete(p.id);voxelBroadcast({type:'voxelPresence',players:voxelUsers()})}

function emit(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function admins(o){for(const p of peers.values())if(p.user.role==='admin')emit(p.ws,o)}
function broadcastRoom(room,o){for(const p of peers.values())if(p.room===room.code)emit(p.ws,o)}
function lobby(){const available=[...rooms.values()].filter(r=>!r.finished&&!r.started&&r.players.size<2).map(r=>({code:r.code,game:r.game,host:state.users.find(u=>u.id===[...r.players][0])?.name||'Jogador',players:r.players.size}));for(const p of peers.values())if(p.user.role==='child')emit(p.ws,{type:'lobby',rooms:available})}
function report(){admins({type:'adminUpdate'});lobby()}
function leaveRoom(p){if(!p.room)return;const code=p.room;p.room=null;p.playing=false;const r=rooms.get(code);if(r){if(![...peers.values()].some(x=>x!==p&&x.room===code&&x.user.id===p.user.id))r.players.delete(p.user.id);broadcastRoom(r,{type:'peerLeft',id:p.id});if(!r.players.size)rooms.delete(code)}report()}
function ensureRoom(p,code){const r=rooms.get(code);if(!r||r.finished)return null;if(!r.players.has(p.user.id)&&p.playing&&(r.players.size>=2||r.started))return null;if(p.room!==code)leaveRoom(p);p.room=code;if(p.playing)r.players.add(p.user.id);return r}
function roomState(r){return {type:'roomState',code:r.code,game:r.game,started:r.started,remaining:Math.max(0,Math.ceil((r.endAt-now())/1000)),players:[...r.players].map(id=>{const u=state.users.find(u=>u.id===id);return {id,name:u?.name,score:r.scores[id]||0,lane:r.lanes[id]||1}})}}
function finish(r){if(r.finished)return;r.finished=true;const ranking=[...r.players].map(id=>({name:state.users.find(u=>u.id===id)?.name||'Jogador',score:r.scores[id]||0})).sort((a,b)=>b.score-a.score);state.games.push({id:uuid(),at:now(),players:ranking});state.games=state.games.slice(-300);save();broadcastRoom(r,{type:'finished',ranking});report()}
function start(r){if(r.started)return;r.started=true;r.endAt=now()+60000;r.nextObstacle=now()+1000;r.spawn=0;if(r.game==='pong')r.pong={x:.5,y:.5,vx:(Math.random()<.5?-1:1)*.52,vy:(Math.random()<.5?-1:1)*.29,paddles:{},lastTick:now()};for(const q of peers.values())if(q.room===r.code)emit(q.ws,{...roomState(r),mode:q.playing?'player':'spectator'})}
function gameTick(){const t=now();for(const r of rooms.values()){if(!r.started||r.finished)continue;if(t>=r.endAt){finish(r);continue}
if(r.game==='pong'){
 const g=r.pong,ids=[...r.players];
 const dt=Math.min(.12,Math.max(.001,(t-g.lastTick)/1000));g.lastTick=t;
 if(ids.length===1){g.paddles.ai??=.5;const d=g.y-g.paddles.ai;g.paddles.ai+=Math.sign(d)*Math.min(.73*dt,Math.abs(d))}
 g.x+=g.vx*dt;g.y+=g.vy*dt;
 if(g.y<.025){g.y=.025;g.vy=Math.abs(g.vy)}
 if(g.y>.975){g.y=.975;g.vy=-Math.abs(g.vy)}
 const left=g.paddles[ids[0]]??.5,right=ids[1]?(g.paddles[ids[1]]??.5):(g.paddles.ai??.5);
 function bounce(dir,paddle){g.x=dir===1?.045:.955;g.vx=dir*Math.min(1.05,Math.abs(g.vx)*1.045);g.vy=Math.max(-.75,Math.min(.75,g.vy+(g.y-paddle)*1.4))}
 function reset(dir){g.x=.5;g.y=.25+Math.random()*.5;g.vx=dir*.52;g.vy=(Math.random()<.5?-1:1)*(.24+Math.random()*.13)}
 if(g.x<=.045&&g.vx<0){if(Math.abs(g.y-left)<=.123)bounce(1,left);else{const winner=ids[1]||ids[0];r.scores[winner]=(r.scores[winner]||0)+1;reset(1)}}
 if(g.x>=.955&&g.vx>0){if(Math.abs(g.y-right)<=.123)bounce(-1,right);else{r.scores[ids[0]]=(r.scores[ids[0]]||0)+1;reset(-1)}}
 broadcastRoom(r,{type:'frame',game:'pong',remaining:Math.ceil((r.endAt-t)/1000),
 players:ids.map(id=>({id,score:r.scores[id]||0,paddle:g.paddles[id]??.5})),
 ball:{x:g.x,y:g.y,vx:g.vx,vy:g.vy},aiPaddle:g.paddles.ai??.5});continue}

if(t>=r.nextObstacle){r.spawn++;const lane=Math.floor(Math.random()*3);r.obstacles.push({id:r.spawn,lane,at:t});r.nextObstacle=t+780}
for(const o of r.obstacles){if(o.done||t-o.at<2400)continue;o.done=true;for(const id of r.players){if(r.lanes[id]===o.lane)r.scores[id]=Math.max(0,(r.scores[id]||0)-5);else r.scores[id]=(r.scores[id]||0)+10}}
r.obstacles=r.obstacles.filter(o=>t-o.at<3000);
broadcastRoom(r,{type:'frame',remaining:Math.ceil((r.endAt-t)/1000),players:[...r.players].map(id=>({id,lane:r.lanes[id]||1,score:r.scores[id]||0,ackSeq:r.ack?.[id]||0})),obstacles:r.obstacles.map(o=>({lane:o.lane,progress:(t-o.at)/2400}))});
}}
setInterval(gameTick,40).unref();
const publicDir=path.join(ROOT,'public');
const server=http.createServer(async(req,res)=>{try{
const pathname=new URL(req.url,'http://local').pathname;
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
if(pathname==='/api/health')return json(res,200,{ok:true,service:'games-for-children'});
if(/^\/vendor\/three\.(module|core)\.js$/.test(pathname)){
 const name=pathname.slice('/vendor/'.length),asset=path.join(ROOT,'node_modules','three','build',name);
 return fs.readFile(asset,(err,b)=>{if(err){res.writeHead(404);return res.end('Módulo 3D indisponível')};res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(b)})
}

if(pathname.startsWith('/api/')){
const origin=req.headers.origin;if(req.method!=='GET'&&origin){const allowed='https://gamesforchildren.escotilhaprodutora.com';if(origin!==allowed)return json(res,403,{error:'Origem não permitida'})}
if(pathname==='/api/login'&&req.method==='POST'){
if(!limit(req.socket.remoteAddress||''))return json(res,429,{error:'Muitas tentativas; aguarde'});
const b=await readBody(req),u=state.users.find(u=>u.name.toLowerCase()===String(b.name||'').trim().toLowerCase());
if(!u||!u.enabled||!u.loginEnabled||!verify(b.password,u.pass)||u.role==='child'&&usage(u)>=u.dailyLimit*60000)return json(res,401,{error:'Acesso negado'});
const token=crypto.randomBytes(32).toString('base64url'),s={id:uuid(),key:crypto.createHash('sha256').update(token).digest('hex'),userId:u.id,version:u.version,expires:now()+90*DAY,revoked:false,lastTick:now(),daily:{}};
state.sessions.push(s);save();track(u,'entrou');report();return json(res,200,{user:userInfo(u)},'gfc_sid='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7776000');
}
const auth=checkSession(req);if(!auth)return json(res,401,{error:'Sessão não autorizada'});const {u,s}=auth;
if(pathname==='/api/me'&&req.method==='GET')return json(res,200,{user:userInfo(u)});
if(pathname==='/api/heartbeat'&&req.method==='POST'){const was=activeUser(u);touch(s);s.lastSeen=now();save();if(!was&&u.role==='child')track(u,'online');report();return json(res,200,{ok:true,online:true})}
if(pathname.startsWith('/api/photos/')&&req.method==='GET'){const id=pathname.slice('/api/photos/'.length),target=state.users.find(x=>x.id===id);if(!target||!target.photo||(u.role!=='admin'&&u.id!==id))return json(res,404,{error:'Foto indisponível'});const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(target.photo);if(!match)return json(res,404,{error:'Foto inválida'});res.writeHead(200,{'Content-Type':'image/'+match[1],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(match[2],'base64'))}
if(pathname==='/api/voice/config'&&req.method==='GET')return json(res,200,{iceServers:ICE_SERVERS,turnConfigured:ICE_SERVERS.length>1});
if(pathname==='/api/push/key'&&req.method==='GET')return json(res,200,{enabled:PUSH_READY,key:VAPID_PUBLIC_KEY});
if(pathname==='/api/push/subscribe'&&req.method==='POST'){if(u.role!=='admin')return json(res,403,{error:'Somente administrador'});if(!PUSH_READY)return json(res,503,{error:'Notificações ainda não configuradas'});const b=await readBody(req),sub=b.subscription;if(typeof sub?.endpoint!=='string'||!sub.endpoint.startsWith('https://')||typeof sub.keys?.p256dh!=='string'||typeof sub.keys?.auth!=='string')return json(res,400,{error:'Assinatura inválida'});state.pushSubscriptions=state.pushSubscriptions.filter(x=>x.endpoint!==sub.endpoint);state.pushSubscriptions.push({userId:u.id,endpoint:sub.endpoint,subscription:{endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}}});save();return json(res,200,{ok:true})}
if(pathname==='/api/push/unsubscribe'&&req.method==='POST'){const b=await readBody(req);state.pushSubscriptions=state.pushSubscriptions.filter(x=>x.userId!==u.id||x.endpoint!==b.endpoint);save();return json(res,200,{ok:true})}
if(pathname==='/api/logout'&&req.method==='POST'){end(s);return json(res,200,{ok:true},'gfc_sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')}
if(u.role!=='admin')return json(res,403,{error:'Acesso restrito'});
if(pathname==='/api/admin/overview'&&req.method==='GET')return json(res,200,{users:state.users.filter(x=>x.role==='child').map(userInfo),events:state.events.slice(0,50),games:state.games.slice(-30).reverse(),rooms:[...rooms.values()].map(r=>({code:r.code,game:r.game,players:[...r.players].map(id=>state.users.find(u=>u.id===id)?.name),started:r.started,finished:r.finished}))});
if(pathname==='/api/admin/users'&&req.method==='POST'){const b=await readBody(req);const name=String(b.name||'').trim().slice(0,32),pass=String(b.password||'');if(name.length<2||pass.length<4||pass.length>100||state.users.some(u=>u.name.toLowerCase()===name.toLowerCase()))return json(res,400,{error:'Nome ou PIN inválido/duplicado'});const child={id:uuid(),name,role:'child',pass:password(pass),enabled:true,loginEnabled:true,dailyLimit:60,version:0,voiceEnabled:true};state.users.push(child);save();return json(res,201,{user:userInfo(child)})}
const m=pathname.match(/^\/api\/admin\/users\/([a-f0-9-]+)(?:\/(kick))?$/);
if(m&&req.method==='POST'){const child=state.users.find(x=>x.id===m[1]&&x.role==='child');if(!child)return json(res,404,{error:'Não encontrado'});if(m[2]==='kick'){child.version++;for(const a of state.sessions.filter(a=>a.userId===child.id&&!a.revoked))end(a);track(child,'desconectado pelo ADM');report();return json(res,200,{ok:true})}
const b=await readBody(req);
if(Object.prototype.hasOwnProperty.call(b,'name')){const n=String(b.name||'').trim().slice(0,32);if(n.length<2||state.users.some(x=>x.id!==child.id&&x.name.toLowerCase()===n.toLowerCase()))return json(res,400,{error:'Nome inválido ou já cadastrado'});child.name=n}
if(Object.prototype.hasOwnProperty.call(b,'password')){const p=String(b.password||'');if(p.length<4||p.length>100)return json(res,400,{error:'PIN precisa ter de 4 a 100 caracteres'});child.pass=password(p);child.version++;for(const session of state.sessions.filter(x=>x.userId===child.id&&!x.revoked))end(session)}
if(Object.prototype.hasOwnProperty.call(b,'photo')){
 if(b.photo===null){delete child.photo}
 else {const p=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.photo||'');if(!p||p[2].length>180000||Buffer.from(p[2],'base64').length>110000)return json(res,400,{error:'Foto inválida ou muito grande (máximo 110 KB)'});child.photo=b.photo}
}
for(const key of ['enabled','loginEnabled','voiceEnabled'])if(typeof b[key]==='boolean')child[key]=b[key];
if(!child.voiceEnabled){for(const peer of peers.values())if(peer.user.id===child.id)emit(peer.ws,{type:'voiceBlocked'})}
if(Number.isInteger(b.dailyLimit)&&b.dailyLimit>=0&&b.dailyLimit<=1440)child.dailyLimit=b.dailyLimit;
if(!child.enabled||usage(child)>=child.dailyLimit*60000){child.version++;for(const a of state.sessions.filter(a=>a.userId===child.id&&!a.revoked))end(a)}
save();report();return json(res,200,{user:userInfo(child)})}
return json(res,404,{error:'Rota não encontrada'});
}
const file=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));if(file.includes('..')||file.startsWith('.')){res.writeHead(403);return res.end()}
const fp=path.join(publicDir,file);if(!fp.startsWith(publicDir+path.sep)){res.writeHead(403);return res.end()}
fs.readFile(fp,(err,b)=>{if(err){res.writeHead(404);return res.end('Não encontrado')}const ext=path.extname(fp);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream','Cache-Control':file==='sw.js'?'no-cache':'public, max-age=3600'});res.end(b)});
}catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'Erro interno'})}});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 const origin=req.headers.origin;
 if(pathname!=='/ws'||origin!=='https://gamesforchildren.escotilhaprodutora.com'){
   console.warn('[WS] Rejeitado: caminho/origem',pathname,origin||'(ausente)');
   socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;
 }
 const auth=checkSession(req);
 if(!auth){console.warn('[WS] Rejeitado: sessão ausente ou inválida');socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();return}
 console.log('[WS] Upgrade aceito para papel:',auth.u.role);
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,auth))
});
wss.on('connection',(ws,{u,s})=>{const p={ws,user:u,session:s,room:null,id:uuid()};peers.set(p.id,p);track(u,'online');emit(ws,{type:'hello',id:p.id,user:userInfo(u)});report();
ws.on('message',b=>{let m;try{m=JSON.parse(b.toString())}catch{return}if(s.revoked||!u.enabled||usage(u)>=u.dailyLimit*60000){end(s);return}
if(m.type==='lobby')lobby();
if(m.type==='voxelJoin'){
 leaveRoom(p);voxelPeers.set(p.id,p);p.voxelPos={x:0,z:4,yaw:0};
 emit(ws,{type:'voxelSnapshot',worldId:'familia',edits:voxelWorld().edits,players:voxelUsers(),selfId:u.id});
 voxelBroadcast({type:'voxelPresence',players:voxelUsers()});
}
if(m.type==='voxelLeave')voxelDepart(p);
if(m.type==='voxelMove'&&voxelPeers.has(p.id)){
 const t=now();if(t-(p.voxelMoveAt||0)>=95&&Number.isFinite(m.x)&&Number.isFinite(m.z)&&Number.isFinite(m.yaw)){
 p.voxelMoveAt=t;p.voxelPos={x:Math.max(-11,Math.min(11,m.x)),z:Math.max(-11,Math.min(11,m.z)),yaw:Math.max(-6.3,Math.min(6.3,m.yaw))};
 for(const q of voxelPeers.values())if(q!==p)emit(q.ws,{type:'voxelPlayer',player:{id:u.id,name:u.name,role:u.role,...p.voxelPos}})
 }
}
if(m.type==='voxelEdit'&&voxelPeers.has(p.id)){
 const t=now(),x=m.x,y=m.y,z=m.z,block=m.block;
 if(t-(p.voxelEditAt||0)<160||![x,y,z].every(Number.isInteger)||Math.abs(x)>11||Math.abs(z)>11||y<0||y>10||!VOXEL_TYPES.has(block)){emit(ws,{type:'voxelError',message:'Ação inválida ou rápida demais'});return}
 const edits=voxelWorld().edits,key=x+','+y+','+z;
 if(Object.keys(edits).length>=1300&&!Object.hasOwn(edits,key)){emit(ws,{type:'voxelError',message:'Limite de blocos alterados neste mundo'});return}
 p.voxelEditAt=t;edits[key]=block;save();voxelBroadcast({type:'voxelBlock',x,y,z,block,by:u.name});
}

if(m.type==='create'&&(u.role==='child'||u.role==='admin')){voxelDepart(p);leaveRoom(p);let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const game=['race','pong'].includes(m.game)?m.game:'race';const r={code,game,players:new Set([u.id]),lanes:{[u.id]:1},scores:{[u.id]:0},obstacles:[],started:false,finished:false,endAt:0};rooms.set(code,r);p.room=code;p.playing=true;emit(ws,{...roomState(r),mode:'player'});if(m.solo===true)start(r);report()}
if(m.type==='join'&&typeof m.code==='string'){
 voxelDepart(p);
 const code=m.code.toUpperCase(),r0=rooms.get(code);
 const playing=u.role==='child'||m.mode==='player';
 if(!r0||r0.finished||(playing&&!r0.players.has(u.id)&&(r0.started||r0.players.size>=2))){emit(ws,{type:'error',message:'Sala indisponível ou completa'});return}
 if(p.room!==code)leaveRoom(p);
 p.playing=playing;
 const r=ensureRoom(p,code);if(!r){emit(ws,{type:'error',message:'Não foi possível entrar'});return}
 if(playing){r.lanes[u.id]??=1;r.scores[u.id]??=0}
 emit(ws,{...roomState(r),mode:playing?'player':'spectator'});
 for(const q of peers.values())if(q.room===r.code)emit(q.ws,{...roomState(r),mode:q.playing?'player':'spectator'});
 if(u.role==='admin')broadcastRoom(r,{type:'notice',text:'Administrador entrou na sala como '+(playing?'piloto':'espectador')});
 if(r.players.size===2&&!r.started)start(r);
 report()
}
if(m.type==='paddle'&&p.room&&p.playing){const r=rooms.get(p.room);if(r?.game==='pong'&&r.started&&!r.finished&&Number.isFinite(m.y)){r.pong.paddles[u.id]=Math.max(.13,Math.min(.87,m.y))}}
if(m.type==='lane'&&p.room&&p.playing){const r=rooms.get(p.room);if(r&&r.started&&!r.finished&&r.players.has(u.id)&&Number.isInteger(m.lane)&&m.lane>=0&&m.lane<=2){r.lanes[u.id]=m.lane;if(Number.isSafeInteger(m.seq)&&m.seq>=0){r.ack??={};r.ack[u.id]=m.seq}}}
if(m.type==='leave')leaveRoom(p);
if(m.type==='signal'&&p.room&&typeof m.to==='string'&&['offer','answer','ice'].includes(m.kind)&&JSON.stringify(m.data||{}).length<6500){if(u.role==='child'&&!u.voiceEnabled)return;const recipient=peers.get(m.to);if(recipient&&recipient.room===p.room&&(recipient.user.role==='admin'||recipient.user.voiceEnabled))emit(recipient.ws,{type:'signal',kind:m.kind,data:m.data,from:p.id,name:u.name})}
if(m.type==='peers'&&p.room){emit(ws,{type:'peers',items:[...peers.values()].filter(q=>q.room===p.room&&q!==p).map(q=>({id:q.id,name:q.user.name,role:q.user.role}))})}
if(m.type==='voice-ready'&&p.room&&(u.role==='admin'||u.voiceEnabled)){for(const q of peers.values())if(q!==p&&q.room===p.room)emit(q.ws,{type:'voiceReady',id:p.id,name:u.name,role:u.role})}
});
ws.on('close',()=>{voxelDepart(p);leaveRoom(p);peers.delete(p.id);touch(s);save();if(!activeUser(u))track(u,'offline');report()})});
setInterval(()=>{for(const p of peers.values()){const u=p.user;if(p.session.revoked||!u.enabled||u.version!==p.session.version||usage(u)>=u.dailyLimit*60000){end(p.session);continue}touch(p.session);emit(p.ws,{type:'pulse',usedSeconds:Math.floor(usage(u)/1000)})}save();report()},10000).unref();
async function boot(){try{const result=await sqlStore.start(DB,data=>{state=data;for(const k of ['users','sessions','events','games','pushSubscriptions'])state[k]??=[]});ensureAdmin();server.listen(PORT,HOST,()=>console.log('GamesForChildren rodando em '+HOST+':'+PORT+' | Persistência '+(result.enabled?'MySQL':'JSON local')))}catch(e){console.error('Banco de dados não inicializado:',e.message);process.exitCode=1}}
boot();
