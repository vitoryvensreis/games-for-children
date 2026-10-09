const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const webpush=require('web-push');
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
function save(){const tmp=DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,DB)}
const uuid=()=>crypto.randomUUID(), now=()=>Date.now();
const hash=(s,salt)=>crypto.scryptSync(String(s),salt,64).toString('hex');
function password(pass){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+hash(pass,salt)}
function verify(pass,stored){try{const [salt,h]=stored.split(':');return crypto.timingSafeEqual(Buffer.from(hash(pass,salt),'hex'),Buffer.from(h,'hex'))}catch{return false}}
if(!state.users.some(u=>u.role==='admin')){
 const p=process.env.ADMIN_PASSWORD||'';
 if(p.length<12)throw Error('Defina ADMIN_PASSWORD com 12+ caracteres no systemd antes de iniciar o aplicativo');
 state.users.push({id:uuid(),name:'Administrador',role:'admin',pass:password(p),enabled:true,loginEnabled:true,dailyLimit:1440,version:0,voiceEnabled:true});save();
 console.log('Administrador criado; remova ADMIN_PASSWORD do ambiente depois do primeiro start');
}
const ADMIN=()=>state.users.find(u=>u.role==='admin');
const bucket=new Map();
function limit(ip){const a=bucket.get(ip)||[];const b=a.filter(t=>now()-t<900000);b.push(now());bucket.set(ip,b);return b.length<=15}
function localDay(t){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(t)}
function usage(u){const d=localDay(now());return state.sessions.filter(s=>s.userId===u.id).reduce((sum,s)=>sum+(s.daily?.[d]||0),0)}
function activeUser(u){return [...peers.values()].some(p=>p.user.id===u.id&&p.ws.readyState===1)}
function touch(s){const t=now();if(!s.lastTick){s.lastTick=t;return}const delta=Math.min(t-s.lastTick,15000);s.lastTick=t;if(delta>0&&delta<16000){const k=localDay(t);s.daily??={};s.daily[k]=(s.daily[k]||0)+delta}}
function checkSession(req){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gfc_sid='))?.slice(8);if(!value)return null;const key=crypto.createHash('sha256').update(value).digest('hex');const s=state.sessions.find(s=>s.key===key&&!s.revoked&&s.expires>now());const u=s&&state.users.find(u=>u.id===s.userId&&u.enabled&&u.version===s.version);if(!u||u.role==='child'&&usage(u)>=u.dailyLimit*60000)return null;return {s,u}}
function end(s){touch(s);s.revoked=true;for(const p of peers.values())if(p.session===s){emit(p.ws,{type:'logout'});p.ws.close(4001,'Sessão encerrada')}save()}
function userInfo(u){return {id:u.id,name:u.name,role:u.role,enabled:u.enabled,loginEnabled:u.loginEnabled,dailyLimit:u.dailyLimit,voiceEnabled:u.voiceEnabled,usedSeconds:Math.floor(usage(u)/1000),online:activeUser(u)}}
function json(res,status,obj,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(obj))}
function readBody(req){return new Promise((resolve,reject)=>{let text='';req.on('data',b=>{text+=b;if(text.length>20000){reject(Error('payload excessivo'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(text||'{}'))}catch{reject(Error('JSON inválido'))}});req.on('error',reject)})}
async function pushAdmins(title,body){if(!PUSH_READY)return;const targets=state.pushSubscriptions.filter(s=>state.users.some(u=>u.id===s.userId&&u.role==='admin'&&u.enabled));await Promise.allSettled(targets.map(async entry=>{try{await webpush.sendNotification(entry.subscription,JSON.stringify({title,body,url:'/'}),{TTL:90,urgency:'normal'})}catch(err){if(err.statusCode===404||err.statusCode===410){state.pushSubscriptions=state.pushSubscriptions.filter(s=>s.endpoint!==entry.endpoint);save()}else console.error('Push falhou:',err.statusCode||err.message)}}))}
function track(u,type){state.events.unshift({id:uuid(),userId:u.id,name:u.name,type,at:now()});state.events=state.events.slice(0,1000);save();admins({type:'notice',text:u.name+': '+type});if(u.role==='child'&&['online','offline','entrou','desconectado pelo ADM'].includes(type))void pushAdmins('GamesForChildren',u.name+' — '+type)}
const peers=new Map(), rooms=new Map();
function emit(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function admins(o){for(const p of peers.values())if(p.user.role==='admin')emit(p.ws,o)}
function broadcastRoom(room,o){for(const p of peers.values())if(p.room===room.code)emit(p.ws,o)}
function report(){admins({type:'adminUpdate'})}
function leaveRoom(p){if(!p.room)return;const r=rooms.get(p.room);if(r){r.players.delete(p.user.id);broadcastRoom(r,{type:'peerLeft',id:p.user.id});if(!r.players.size&&![...peers.values()].some(x=>x.room===r.code))rooms.delete(r.code)}p.room=null}
function ensureRoom(p,code){const r=rooms.get(code);if(!r)return null;if(p.user.role==='child'&&!r.players.has(p.user.id)&&r.players.size>=2)return null;leaveRoom(p);p.room=code;if(p.user.role==='child')r.players.add(p.user.id);return r}
function roomState(r){return {type:'roomState',code:r.code,game:r.game,started:r.started,remaining:Math.max(0,Math.ceil((r.endAt-now())/1000)),players:[...r.players].map(id=>{const u=state.users.find(u=>u.id===id);return {id,name:u?.name,score:r.scores[id]||0,lane:r.lanes[id]||1}})}}
function finish(r){if(r.finished)return;r.finished=true;const ranking=[...r.players].map(id=>({name:state.users.find(u=>u.id===id)?.name||'Jogador',score:r.scores[id]||0})).sort((a,b)=>b.score-a.score);state.games.push({id:uuid(),at:now(),players:ranking});state.games=state.games.slice(-300);save();broadcastRoom(r,{type:'finished',ranking});report()}
function start(r){if(r.started)return;r.started=true;r.endAt=now()+60000;r.nextObstacle=now()+1000;r.spawn=0;broadcastRoom(r,roomState(r))}
function gameTick(){const t=now();for(const r of rooms.values()){if(!r.started||r.finished)continue;if(t>=r.endAt){finish(r);continue}
if(t>=r.nextObstacle){r.spawn++;const lane=Math.floor(Math.random()*3);r.obstacles.push({id:r.spawn,lane,at:t});r.nextObstacle=t+780}
for(const o of r.obstacles){if(o.done||t-o.at<2400)continue;o.done=true;for(const id of r.players){if(r.lanes[id]===o.lane)r.scores[id]=Math.max(0,(r.scores[id]||0)-5);else r.scores[id]=(r.scores[id]||0)+10}}
r.obstacles=r.obstacles.filter(o=>t-o.at<3000);
broadcastRoom(r,{type:'frame',remaining:Math.ceil((r.endAt-t)/1000),players:[...r.players].map(id=>({id,lane:r.lanes[id]||1,score:r.scores[id]||0})),obstacles:r.obstacles.map(o=>({lane:o.lane,progress:(t-o.at)/2400}))});
}}
setInterval(gameTick,125).unref();
const publicDir=path.join(ROOT,'public');
const server=http.createServer(async(req,res)=>{try{
const pathname=new URL(req.url,'http://local').pathname;
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
if(pathname==='/api/health')return json(res,200,{ok:true,service:'games-for-children'});
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
server.on('upgrade',(req,socket,head)=>{if(new URL(req.url,'http://local').pathname!=='/ws'||req.headers.origin!=='https://gamesforchildren.escotilhaprodutora.com'){socket.destroy();return}const auth=checkSession(req);if(!auth){socket.destroy();return}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,auth))});
wss.on('connection',(ws,{u,s})=>{const p={ws,user:u,session:s,room:null,id:uuid()};peers.set(p.id,p);track(u,'online');emit(ws,{type:'hello',id:p.id,user:userInfo(u)});report();
ws.on('message',b=>{let m;try{m=JSON.parse(b.toString())}catch{return}if(s.revoked||!u.enabled||usage(u)>=u.dailyLimit*60000){end(s);return}
if(m.type==='create'&&u.role==='child'){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const r={code,game:'race',players:new Set([u.id]),lanes:{[u.id]:1},scores:{[u.id]:0},obstacles:[],started:false,finished:false,endAt:0};rooms.set(code,r);p.room=code;emit(ws,roomState(r));if(m.solo===true)start(r);report()}
if(m.type==='join'&&typeof m.code==='string'){const r=ensureRoom(p,m.code.toUpperCase());if(!r){emit(ws,{type:'error',message:'Sala indisponível'});return}r.lanes[u.id]??=1;r.scores[u.id]??=0;broadcastRoom(r,roomState(r));if(r.players.size===2&&!r.started)start(r);report()}
if(m.type==='lane'&&p.room&&u.role==='child'){const r=rooms.get(p.room);if(r&&r.started&&!r.finished&&r.players.has(u.id)&&Number.isInteger(m.lane)&&m.lane>=0&&m.lane<=2)r.lanes[u.id]=m.lane}
if(m.type==='leave')leaveRoom(p);
if(m.type==='signal'&&p.room&&typeof m.to==='string'&&['offer','answer','ice'].includes(m.kind)&&JSON.stringify(m.data||{}).length<6500){if(u.role==='child'&&!u.voiceEnabled)return;const recipient=peers.get(m.to);if(recipient&&recipient.room===p.room&&(recipient.user.role==='admin'||recipient.user.voiceEnabled))emit(recipient.ws,{type:'signal',kind:m.kind,data:m.data,from:p.id,name:u.name})}
if(m.type==='peers'&&p.room){emit(ws,{type:'peers',items:[...peers.values()].filter(q=>q.room===p.room&&q!==p).map(q=>({id:q.id,name:q.user.name,role:q.user.role}))})}
if(m.type==='voice-ready'&&p.room&&(u.role==='admin'||u.voiceEnabled)){for(const q of peers.values())if(q!==p&&q.room===p.room)emit(q.ws,{type:'voiceReady',id:p.id,name:u.name,role:u.role})}
});
ws.on('close',()=>{leaveRoom(p);peers.delete(p.id);touch(s);save();if(!activeUser(u))track(u,'offline');report()})});
setInterval(()=>{for(const p of peers.values()){const u=p.user;if(p.session.revoked||!u.enabled||u.version!==p.session.version||usage(u)>=u.dailyLimit*60000){end(p.session);continue}touch(p.session);emit(p.ws,{type:'pulse',usedSeconds:Math.floor(usage(u)/1000)})}save();report()},10000).unref();
server.listen(PORT,HOST,()=>console.log('GamesForChildren rodando em '+HOST+':'+PORT));
