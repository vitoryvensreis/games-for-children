const http=require('node:http');
const fs=require('node:fs');
const zlib=require('node:zlib');
const path=require('node:path');
const crypto=require('node:crypto');
const {stepPongBall,PONG}=require('./database/pong-physics.cjs');
const {spawn}=require('node:child_process');
const {WebSocketServer,WebSocket}=require('ws');
const webpush=require('web-push');
const sqlStore=require('./database/store.cjs');
const {sanitizeNpcAudit}=require('./database/npc-audit.cjs');
const PORT=Number(process.env.PORT||3100), HOST='127.0.0.1';
const ROOT=__dirname, DATA=process.env.DATA_DIR||path.join(ROOT,'data'), DB=path.join(DATA,'state.json');
const opusConnections=new Set();
let opusHostProcess=null, opusRestarting=false;
const DAY=86400000;fs.mkdirSync(DATA,{recursive:true,mode:0o700});
const COVER_SLUGS=Object.freeze(['pong','snake','minecraft']);
const COVER_DIR=path.join(DATA,'game-covers');
fs.mkdirSync(COVER_DIR,{recursive:true,mode:0o700});
const coverPath=slug=>path.join(COVER_DIR,slug+'.webp');
const defaultCoverPath=slug=>path.join(ROOT,'public','assets','game-covers',slug+'.webp');
function validCoverSlug(slug){return COVER_SLUGS.includes(slug)}

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
function timeLimitReached(u){return u.role==='child'&&usage(u)>=u.dailyLimit*60000}
function activeUser(u){return [...peers.values()].some(p=>p.user.id===u.id&&p.ws.readyState===1)||state.sessions.some(s=>s.userId===u.id&&!s.revoked&&s.expires>now()&&s.lastSeen&&now()-s.lastSeen<45000)}
function touch(s){const t=now();if(!s.lastTick){s.lastTick=t;return}const delta=Math.min(t-s.lastTick,15000);s.lastTick=t;if(delta>0&&delta<16000){const k=localDay(t);s.daily??={};s.daily[k]=(s.daily[k]||0)+delta}}
function checkSession(req){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gfc_sid='))?.slice(8);if(!value)return null;const key=crypto.createHash('sha256').update(value).digest('hex');const s=state.sessions.find(s=>s.key===key&&!s.revoked&&s.expires>now());const u=s&&state.users.find(u=>u.id===s.userId&&u.enabled&&u.version===s.version);if(!u||timeLimitReached(u))return null;return {s,u}}
function end(s){touch(s);s.revoked=true;for(const p of opusConnections)if(p.session===s){try{p.ws.close(4001,'Acesso encerrado pelo responsavel')}catch{};try{p.remote?.close()}catch{}}for(const p of peers.values())if(p.session===s){emit(p.ws,{type:'logout'});p.ws.close(4001,'Sessão encerrada')}save()}
function userInfo(u){return {id:u.id,name:u.name,role:u.role,enabled:u.enabled,loginEnabled:u.loginEnabled,dailyLimit:u.dailyLimit,voiceEnabled:u.voiceEnabled,usedSeconds:Math.floor(usage(u)/1000),online:activeUser(u),hasPhoto:Boolean(u.photo)}}
function json(res,status,obj,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(obj))}
function readBody(req,maxChars=20000){return new Promise((resolve,reject)=>{let text='';req.on('data',b=>{text+=b;if(text.length>maxChars){reject(Error('payload excessivo'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(text||'{}'))}catch{reject(Error('JSON inválido'))}});req.on('error',reject)})}
async function pushAdmins(title,body){if(!PUSH_READY)return;const targets=state.pushSubscriptions.filter(s=>state.users.some(u=>u.id===s.userId&&u.role==='admin'&&u.enabled));await Promise.allSettled(targets.map(async entry=>{try{await webpush.sendNotification(entry.subscription,JSON.stringify({title,body,url:'/'}),{TTL:90,urgency:'normal'})}catch(err){if(err.statusCode===404||err.statusCode===410){state.pushSubscriptions=state.pushSubscriptions.filter(s=>s.endpoint!==entry.endpoint);save()}else console.error('Push falhou:',err.statusCode||err.message)}}))}
function track(u,type){state.events.unshift({id:uuid(),userId:u.id,name:u.name,type,at:now()});state.events=state.events.slice(0,1000);save();admins({type:'notice',text:u.name+': '+type});if(u.role==='child'&&['online','offline','entrou','desconectado pelo ADM'].includes(type))void pushAdmins('GamesForChildren',u.name+' — '+type)}
const peers=new Map(), rooms=new Map();
function voiceEligible(p){return p.ws.readyState===1&&(p.user.role==='admin'||p.user.voiceEnabled===true)}
function voiceMembers(){return [...peers.values()].filter(p=>p.voiceActive&&voiceEligible(p))}
function voiceList(p){return voiceMembers().filter(q=>q!==p&&q.user.id!==p.user.id).map(q=>({id:q.id,name:q.user.name,role:q.user.role}))}
function voicePresence(){for(const p of peers.values())if(voiceEligible(p))emit(p.ws,{type:'voicePresence',items:voiceMembers().map(q=>({id:q.id,name:q.user.name,role:q.user.role}))})}

function emit(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function admins(o){for(const p of peers.values())if(p.user.role==='admin')emit(p.ws,o)}
function broadcastRoom(room,o){for(const p of peers.values())if(p.room===room.code)emit(p.ws,o)}
function lobby(){const available=[...rooms.values()].filter(r=>!r.finished&&!r.started&&r.players.size<2).map(r=>({code:r.code,game:r.game,host:state.users.find(u=>u.id===[...r.players][0])?.name||'Jogador',players:r.players.size}));for(const p of peers.values())if(p.user.role==='child')emit(p.ws,{type:'lobby',rooms:available})}
function report(){admins({type:'adminUpdate'});lobby()}
function leaveRoom(p){if(!p.room)return;const code=p.room;p.room=null;p.playing=false;const r=rooms.get(code);if(r){if(![...peers.values()].some(x=>x!==p&&x.room===code&&x.user.id===p.user.id))r.players.delete(p.user.id);broadcastRoom(r,{type:'roomPeerLeft',id:p.id});if(!r.players.size)rooms.delete(code)}report()}
function ensureRoom(p,code){const r=rooms.get(code);if(!r||r.finished)return null;if(!r.players.has(p.user.id)&&p.playing&&(r.players.size>=2||r.started))return null;if(p.room!==code)leaveRoom(p);p.room=code;if(p.playing)r.players.add(p.user.id);return r}
function roomState(r){return {type:'roomState',code:r.code,game:r.game,started:r.started,remaining:Math.max(0,Math.ceil((r.endAt-now())/1000)),players:[...r.players].map(id=>{const u=state.users.find(u=>u.id===id);return {id,name:u?.name,score:r.scores[id]||0,lane:r.lanes[id]||1}})}}
function finish(r){if(r.finished)return;r.finished=true;const ranking=[...r.players].map(id=>({name:state.users.find(u=>u.id===id)?.name||'Jogador',score:r.scores[id]||0})).sort((a,b)=>b.score-a.score);state.games.push({id:uuid(),at:now(),players:ranking});state.games=state.games.slice(-300);save();broadcastRoom(r,{type:'finished',ranking});report()}
function start(r){if(r.started)return;r.started=true;r.endAt=now()+60000;r.nextObstacle=now()+1000;r.spawn=0;if(r.game==='pong')r.pong={x:.5,y:.5,vx:0,vy:0,serveDirection:Math.random()<.5?-1:1,serveAt:now()+1100,round:1,paddles:{},lastTick:now()};for(const q of peers.values())if(q.room===r.code)emit(q.ws,{...roomState(r),mode:q.playing?'player':'spectator'})}
function gameTick(){const t=now();for(const r of rooms.values()){if(!r.started||r.finished)continue;if(t>=r.endAt){finish(r);continue}
if(r.game==='pong'){
 const g=r.pong,ids=[...r.players];
 const dt=Math.min(.075,Math.max(0,(t-g.lastTick)/1000));g.lastTick=t;
 const serving=t<g.serveAt;
 const leftId=ids[0],rightId=ids[1];
 if(ids.length===1){g.paddles.ai??=.5;const delta=g.y-g.paddles.ai;g.paddles.ai+=Math.sign(delta)*Math.min(.68*dt,Math.abs(delta))}
 if(!serving){
  if(g.vx===0){g.vx=g.serveDirection*.58;g.vy=(Math.random()<.5?-1:1)*(.22+Math.random()*.16)}
  const left=g.paddles[leftId]??.5,right=rightId?(g.paddles[rightId]??.5):g.paddles.ai;
  const collision=stepPongBall(g,dt,left,right);
  if(collision==='leftMiss'||collision==='rightMiss'){
   const winner=collision==='leftMiss'?(rightId||leftId):leftId;
   r.scores[winner]=(r.scores[winner]||0)+1;
   g.round++;g.x=.5;g.y=.5;g.vx=0;g.vy=0;
   g.serveDirection=collision==='leftMiss'?1:-1;
   g.serveAt=t+1250;
  }
 }
 broadcastRoom(r,{type:'frame',game:'pong',roomCode:r.code,remaining:Math.ceil((r.endAt-t)/1000),players:ids.map(id=>({id,score:r.scores[id]||0,paddle:g.paddles[id]??.5})),ball:{x:g.x,y:g.y,vx:g.vx,vy:g.vy},bounceId:g.bounces||0,limits:{left:PONG.LEFT_CONTACT,right:PONG.RIGHT_CONTACT},round:g.round,phase:t<g.serveAt?'serve':'play',serveRemaining:Math.max(0,Math.ceil((g.serveAt-t)/1000)),aiPaddle:g.paddles.ai??.5});continue}

if(t>=r.nextObstacle){r.spawn++;const lane=Math.floor(Math.random()*3);r.obstacles.push({id:r.spawn,lane,at:t});r.nextObstacle=t+780}
for(const o of r.obstacles){if(o.done||t-o.at<2400)continue;o.done=true;for(const id of r.players){if(r.lanes[id]===o.lane)r.scores[id]=Math.max(0,(r.scores[id]||0)-5);else r.scores[id]=(r.scores[id]||0)+10}}
r.obstacles=r.obstacles.filter(o=>t-o.at<3000);
broadcastRoom(r,{type:'frame',remaining:Math.ceil((r.endAt-t)/1000),players:[...r.players].map(id=>({id,lane:r.lanes[id]||1,score:r.scores[id]||0,ackSeq:r.ack?.[id]||0})),obstacles:r.obstacles.map(o=>({lane:o.lane,progress:(t-o.at)/2400}))});
}}
setInterval(gameTick,40).unref();
const publicDir=path.join(ROOT,'public');
const OPUSCRAFT_ROOT=path.join(publicDir,'opuscraft');
const OPUSCRAFT_READY=()=>fs.existsSync(path.join(OPUSCRAFT_ROOT,'index.html'));
const OPUS_BACKUP_ROOT=path.join(DATA,'opuscraft','backups');
const lastOpusTeleport=new Map();
function validOpusWorldId(id){return typeof id==='string'&&id.length>0&&id.length<=90&&!id.includes('/')&&!id.includes(String.fromCharCode(92))&&![...id].some(c=>c.charCodeAt(0)<32)}
function opusBackupDir(u){return path.join(OPUS_BACKUP_ROOT,u.id)}
function opusBackupIndex(u){
 try{const rows=JSON.parse(fs.readFileSync(path.join(opusBackupDir(u),'index.json'),'utf8'));
  return Array.isArray(rows)?rows.filter(b=>validOpusWorldId(b.id)&&/^[0-9]{13}-[a-f0-9]{8}$/.test(b.version)&&Number.isSafeInteger(b.size)):[]}
 catch{return []}
}
function opusFileName(id,version){return crypto.createHash('sha256').update(id).digest('hex').slice(0,40)+'-'+version+'.world'}
async function opusGuests(){
 const r=await fetch('http://127.0.0.1:4173/__players',{signal:AbortSignal.timeout(3500)});
 if(!r.ok)throw Error('Servidor do mundo indisponível');
 const data=await r.json();
 return (Array.isArray(data.players)?data.players:[]).filter(p=>typeof p.name==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
}

function opusBuildId(){
 try{return fs.readFileSync(path.join(OPUSCRAFT_ROOT,'GFC-BUILD-ID.txt'),'utf8').trim().slice(0,48)}
 catch{return 'unversioned'}
}
const opusGateway={attempts:0,accepted:0,forwarded:0,lastAttempt:null,lastForwarded:null,lastFailure:''};
function opusName(u){return (u.role==='admin'?'ADM_':'KID_')+String(u.id).replace(/[^a-f0-9]/gi,'').slice(0,12)}
async function opusStatus(){
 try{const response=await fetch('http://127.0.0.1:4173/__health',{signal:AbortSignal.timeout(1500)});const info=await response.json();
  return {available:OPUSCRAFT_READY(),clientVersion:opusBuildId(),ready:!!info.ready,guests:Number(info.guests)||0,lastSave:info.lastSave||null,error:info.error||'',mode:'vps-persistent',gateway:{...opusGateway},players:[...opusConnections].filter(p=>p.role==='guest'&&p.ws.readyState===1).map(p=>({name:p.user.name,role:p.user.role}))};
 }catch{return {available:OPUSCRAFT_READY(),clientVersion:opusBuildId(),ready:false,guests:0,players:[],gateway:{...opusGateway},error:'Servidor do mundo ainda iniciando',mode:'vps-persistent'}}
}
function launchOpusHost(){
 if(opusHostProcess||!OPUSCRAFT_READY()||!fs.existsSync(path.join(ROOT,'ops','opuscraft-relay.mjs')))return;
 const child=spawn(process.execPath,[path.join(ROOT,'ops','opuscraft-host.cjs')],{cwd:ROOT,env:process.env,stdio:['ignore','inherit','inherit','ipc']});
 opusHostProcess=child;
 child.on('message',message=>{
  if(message?.type==='npcLifeLoad'){
   void sqlStore.loadNpcLife().then(data=>{
    if(child.connected)child.send({type:'npcLifeRestore',data});
   }).catch(err=>console.warn('Memória NPC: restauração:',String(err.message).slice(0,120)));
   return;
  }
  if(message?.type==='npcLifeSnapshot'){
   void sqlStore.saveNpcLife(message.data).catch(err=>
    console.warn('Memória NPC: gravação:',String(err.message).slice(0,120)));
   return;
  }
  if(message?.type!=='npcAudit')return;
  const event=sanitizeNpcAudit(message.event);
  if(!event)return;
  void sqlStore.appendNpcEvent(event).then(saved=>{
   if(!saved)return;
   for(const peer of peers.values())
    if(peer.user.role==='admin'&&peer.user.enabled&&peer.ws.readyState===1)
     emit(peer.ws,{type:'npcAudit',event:saved});
  }).catch(err=>console.warn('Monitor NPC: falha ao gravar evento:',String(err.message).slice(0,150)));
 });
 child.on('error',e=>console.error('[OpusCraft] Processo:',e.message));
 child.on('exit',()=>{if(opusHostProcess===child)opusHostProcess=null;setTimeout(()=>launchOpusHost(),6000).unref()});
}

// Browser-cacheable, authenticated client assets: privacy-safe code-only files.
// Hashed Vite resources survive repeat visits; HTML/session responses never cache.
// gzip output is reused in this process to avoid compressing the same bundle per child.
const opusGzipCache=new Map();
function opuscraftStaticHeaders(file,ext){
 const opus=file.startsWith('opuscraft/');
 const hashed=opus&&/^opuscraft\/assets\/[^/]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|wasm|svg|png|jpg|webp|woff2)$/.test(file);
 const noStore=!opus?['index.html','app.js','style.css','sw.js'].includes(file):
  file==='opuscraft/index.html'||file==='opuscraft/GFC-BUILD-ID.txt';
 return {
  'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
   '.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml',
   '.wasm':'application/wasm','.zip':'application/zip',
   '.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream',
  'Cache-Control':noStore?'private, no-store, max-age=0':
   hashed?'private, max-age=31536000, immutable':opus?'private, max-age=3600':'public, max-age=3600'
 };
}
function sendStaticAsset(req,res,file,fp,body){
 const ext=path.extname(fp),headers=opuscraftStaticHeaders(file,ext);
 const wantsGzip=String(req.headers['accept-encoding']||'').includes('gzip');
 const canGzip=file.startsWith('opuscraft/')&&/\.(js|css|wasm|json|svg)$/.test(file)&&
  body.length>2048&&body.length<30*1024*1024&&wantsGzip;
 if(!canGzip){res.writeHead(200,headers);res.end(body);return}
 headers.Vary='Accept-Encoding';
 const key=fp+':'+body.length;
 const cached=opusGzipCache.get(key);
 if(cached){res.writeHead(200,{...headers,'Content-Encoding':'gzip'});res.end(cached);return}
 zlib.gzip(body,{level:5},(err,zipped)=>{
  if(err||!zipped||zipped.length>=body.length){
   res.writeHead(200,headers);res.end(body);return;
  }
  // Limit compressed cache to 12 assets / 24 MiB.
  if(zipped.length<24*1024*1024){
   while(opusGzipCache.size>=12)opusGzipCache.delete(opusGzipCache.keys().next().value);
   opusGzipCache.set(key,zipped);
  }
  res.writeHead(200,{...headers,'Content-Encoding':'gzip'});res.end(zipped);
 });
}

const server=http.createServer(async(req,res)=>{try{
const pathname=new URL(req.url,'http://local').pathname;
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options',pathname==='/opuscraft/index.html'?'SAMEORIGIN':'DENY');
if(pathname==='/api/health')return json(res,200,{ok:true,service:'games-for-children'});
if(pathname.startsWith('/opuscraft/')&&!checkSession(req)){res.writeHead(401,{'Cache-Control':'no-store'});return res.end('Entre no GamesNavagador para jogar')}

if(pathname.startsWith('/api/')){
const origin=req.headers.origin;if(req.method!=='GET'&&origin){const allowed='https://gamesforchildren.escotilhaprodutora.com';if(origin!==allowed)return json(res,403,{error:'Origem não permitida'})}
if(pathname==='/api/login'&&req.method==='POST'){
if(!limit(req.socket.remoteAddress||''))return json(res,429,{error:'Muitas tentativas; aguarde'});
const b=await readBody(req),u=state.users.find(u=>u.name.toLowerCase()===String(b.name||'').trim().toLowerCase());
if(!u||!u.enabled||!u.loginEnabled||!verify(b.password,u.pass)||timeLimitReached(u))return json(res,401,{error:'Acesso negado'});
const token=crypto.randomBytes(32).toString('base64url'),s={id:uuid(),key:crypto.createHash('sha256').update(token).digest('hex'),userId:u.id,version:u.version,expires:now()+90*DAY,revoked:false,lastTick:now(),daily:{}};
state.sessions.push(s);save();track(u,'entrou');report();return json(res,200,{user:userInfo(u)},'gfc_sid='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7776000');
}
const auth=checkSession(req);if(!auth)return json(res,401,{error:'Sessão não autorizada'});const {u,s}=auth;
if(pathname==='/api/me'&&req.method==='GET')return json(res,200,{user:userInfo(u)});
if(pathname==='/api/opuscraft/players'&&req.method==='GET'){
 try{
  const online=await opusGuests();
  return json(res,200,{me:opusName(u),players:online.map(p=>{
   const member=state.users.find(v=>v.enabled&&opusName(v)===p.name);
   return member?{name:member.name,id:p.name,dimension:p.dimension,mode:p.mode,
    x:p.x,y:p.y,z:p.z,self:member.id===u.id}:null;
  }).filter(Boolean)});
 }catch{return json(res,503,{error:'Não foi possível consultar os jogadores deste mundo'})}
}
if(pathname==='/api/opuscraft/teleport'&&req.method==='POST'){
 const body=await readBody(req),target=String(body.to||'');
 const current=now();
 if(current-(lastOpusTeleport.get(u.id)||0)<6000)return json(res,429,{error:'Aguarde alguns segundos para teleportar novamente'});
 if(target===opusName(u)||!state.users.some(v=>v.enabled&&opusName(v)===target))
  return json(res,400,{error:'Escolha outro jogador da família'});
 if(![...opusConnections].some(p=>p.user.id===u.id&&p.role==='guest'&&p.ws.readyState===1))
  return json(res,403,{error:'Você precisa estar no servidor da família'});
 try{
  const players=await opusGuests(),from=players.find(p=>p.name===opusName(u)),to=players.find(p=>p.name===target);
  if(!from||!to||from.dimension!==to.dimension)return json(res,409,{error:'Os dois precisam estar no mesmo mundo e dimensão'});
  const r=await fetch('http://127.0.0.1:4173/__teleport',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:opusName(u),to:target}),
   signal:AbortSignal.timeout(3500)
  });
  const data=await r.json();
  if(!data.ok)return json(res,409,{error:data.error||'Não foi possível teleportar'});
  lastOpusTeleport.set(u.id,current);
  return json(res,200,{ok:true,dimension:data.dimension});
 }catch{return json(res,503,{error:'Mundo ocupado. Tente novamente em alguns instantes'})}
}
// Family-world privileged controls: never trust the target or the operator's
// name from the browser. Identity is derived from the signed-in ADM session.
if(pathname==='/api/admin/opuscraft/summon'&&req.method==='POST'){
 if(u.role!=='admin')return json(res,403,{error:'Somente administrador'});
 const current=now();
 if(current-(lastOpusTeleport.get(u.id)||0)<8000)return json(res,429,{error:'Aguarde 8 segundos entre teletransportes'});
 if(![...opusConnections].some(p=>p.user.id===u.id&&p.role==='guest'&&p.ws.readyState===1))
  return json(res,409,{error:'Entre primeiro no servidor da família'});
 const body=await readBody(req,350),target=String(body.to||'');
 if(!state.users.some(v=>v.role==='child'&&v.enabled&&opusName(v)===target))
  return json(res,400,{error:'Selecione uma criança da família'});
 try{
  const players=await opusGuests(),admin=players.find(p=>p.name===opusName(u)),child=players.find(p=>p.name===target);
  if(!admin||!child||admin.dimension!==child.dimension)
   return json(res,409,{error:'O ADM e a criança precisam estar no mesmo mundo e dimensão'});
  const r=await fetch('http://127.0.0.1:4173/__summon',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({from:opusName(u),to:target}),signal:AbortSignal.timeout(4000)
  });
  const result=await r.json();
  if(!result.ok)return json(res,409,{error:result.error||'Não foi possível trazer o jogador'});
  lastOpusTeleport.set(u.id,current);
  return json(res,200,{ok:true});
 }catch{return json(res,503,{error:'Servidor familiar ocupado, tente novamente'})}
}
if(pathname==='/api/admin/opuscraft/world-control'&&req.method==='POST'){
 if(u.role!=='admin')return json(res,403,{error:'Somente administrador'});
 if(![...opusConnections].some(p=>p.user.id===u.id&&p.role==='guest'&&p.ws.readyState===1))
  return json(res,409,{error:'Entre primeiro no servidor da família'});
 const body=await readBody(req,350);
 if(!(['day','night','sunrise','sunset'].includes(body.time)&&body.weather===undefined||
   ['clear','rain'].includes(body.weather)&&body.time===undefined))
  return json(res,400,{error:'Selecione dia, noite, amanhecer, pôr do sol, sol ou chuva'});
 try{
  const r=await fetch('http://127.0.0.1:4173/__world-control',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({from:opusName(u),...(body.time?{time:body.time}:{weather:body.weather})}),
   signal:AbortSignal.timeout(6000)
  });
  const result=await r.json();
  return json(res,result.ok?200:409,result.ok?{ok:true,...result}:{error:result.error||'Comando indisponível'});
 }catch{return json(res,503,{error:'Não foi possível alterar o tempo no mundo agora'})}
}
// The invisible host provides diagnostics to authorized ADM accounts.
if(pathname==='/api/admin/opuscraft/npc'&&req.method==='GET'){
 if(u.role!=='admin')return json(res,403,{error:'Somente administrador'});
 try{
  const r=await fetch('http://127.0.0.1:4173/__npc/status',{signal:AbortSignal.timeout(3500)});
  if(!r.ok)return json(res,503,{error:'A personagem ainda nao esta disponivel'});
  return json(res,200,await r.json());
 }catch{return json(res,503,{error:'Servidor da familia indisponivel'})}
}
if(pathname==='/api/admin/opuscraft/npc/events'&&req.method==='GET'){
 if(u.role!=='admin')return json(res,403,{error:'Somente administrador'});
 try{
  const query=new URL(req.url,'http://local').searchParams;
  const after=Number(query.get('after')||0);
  if(!Number.isSafeInteger(after)||after<0)return json(res,400,{error:'Cursor inválido'});
  const data=await sqlStore.listNpcEvents(after,60);
  return json(res,200,data);
 }catch(err){
  console.warn('Monitor NPC: erro ao consultar histórico:',String(err.message).slice(0,130));
  return json(res,503,{error:'Histórico temporariamente indisponível'});
 }
}
if(pathname==='/api/opuscraft/world-backups'&&req.method==='GET'){
 return json(res,200,{backups:opusBackupIndex(u).sort((a,b)=>b.created.localeCompare(a.created))});
}
const opusUpload=pathname.match(new RegExp('^/api/opuscraft/world-backups/(.+)$'));
if(opusUpload&&req.method==='POST'){
 const id=decodeURIComponent(opusUpload[1]);
 if(!validOpusWorldId(id))return json(res,400,{error:'Identificador de mundo inválido'});
 const max=64*1024*1024;
 if(Number(req.headers['content-length']||0)>max)return json(res,413,{error:'O backup ultrapassa 64 MB'});
 if(req.headers['content-type']!=='application/octet-stream')return json(res,415,{error:'Tipo de arquivo não suportado'});
 const dir=opusBackupDir(u);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const version=String(now())+'-'+crypto.randomBytes(4).toString('hex');
 const filename=opusFileName(id,version),tmp=path.join(dir,'.'+filename+'.part');
 let chunks=[],size=0;
 for await(const data of req){size+=data.length;if(size>max)return json(res,413,{error:'O backup ultrapassa 64 MB'});chunks.push(data)}
 if(size<32)return json(res,400,{error:'O backup está vazio ou incompleto'});
 const previous=opusBackupIndex(u);
 const total=previous.reduce((n,p)=>n+p.size,0);
 if(total+size>400*1024*1024)return json(res,413,{error:'Limite de 400 MB de backups por conta'});
 fs.writeFileSync(tmp,Buffer.concat(chunks),{mode:0o600});
 fs.renameSync(tmp,path.join(dir,filename));
 const items=[{id,version,size,created:new Date().toISOString()},...previous];
 const kept=items.filter((item,index)=>items.filter(v=>v.id===item.id).indexOf(item)<3).slice(0,100);
 const tempIndex=path.join(dir,'index.json.tmp');
 fs.writeFileSync(tempIndex,JSON.stringify(kept),{mode:0o600});
 fs.renameSync(tempIndex,path.join(dir,'index.json'));
 for(const p of previous)if(!kept.some(b=>b.id===p.id&&b.version===p.version))try{fs.unlinkSync(path.join(dir,opusFileName(p.id,p.version)))}catch{}
 return json(res,200,{ok:true,version,size});
}
const opusDownload=pathname.match(new RegExp('^/api/opuscraft/world-backups/(.+)/([0-9]{13}-[a-f0-9]{8})$'));
if(opusDownload&&req.method==='GET'){
 const id=decodeURIComponent(opusDownload[1]),version=opusDownload[2];
 const record=opusBackupIndex(u).find(b=>b.id===id&&b.version===version);
 if(!record)return json(res,404,{error:'Backup não encontrado'});
 const file=path.join(opusBackupDir(u),opusFileName(id,version));
 return fs.readFile(file,(err,bytes)=>{
  if(err){res.writeHead(404).end();return}
  res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'private,no-store',
   'Content-Disposition':'attachment; filename="opuscraft-backup.world"'});
  res.end(bytes);
 });
}
if(pathname==='/api/opuscraft/identity'&&req.method==='GET')return json(res,200,{playerName:opusName(u),joinCode:'GFC2026X'});
if(pathname==='/api/opuscraft/status'&&req.method==='GET')return json(res,200,await opusStatus());
if(pathname==='/api/admin/opuscraft/status'&&req.method==='GET'){
 if(u.role!=='admin')return json(res,403,{error:'Somente responsavel'});
 return json(res,200,await opusStatus());
}
const gameCover=pathname.match(/^\/api\/game-covers\/(pong|snake|minecraft)$/);
if(gameCover&&req.method==='GET'){
 const slug=gameCover[1],custom=coverPath(slug),target=fs.existsSync(custom)?custom:defaultCoverPath(slug);
 return fs.readFile(target,(err,b)=>{if(err){res.writeHead(404,{'Cache-Control':'no-store'});return res.end('Capa indisponível')};res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(b)})
}

if(pathname==='/api/heartbeat'&&req.method==='POST'){const was=activeUser(u);touch(s);s.lastSeen=now();save();if(!was&&u.role==='child')track(u,'online');report();return json(res,200,{ok:true,online:true})}
if(pathname.startsWith('/api/photos/')&&req.method==='GET'){const id=pathname.slice('/api/photos/'.length),target=state.users.find(x=>x.id===id);if(!target||!target.photo||(u.role!=='admin'&&u.id!==id))return json(res,404,{error:'Foto indisponível'});const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(target.photo);if(!match)return json(res,404,{error:'Foto inválida'});res.writeHead(200,{'Content-Type':'image/'+match[1],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(match[2],'base64'))}
if(pathname==='/api/voice/config'&&req.method==='GET')return json(res,200,{iceServers:ICE_SERVERS,turnConfigured:ICE_SERVERS.length>1});
if(pathname==='/api/push/key'&&req.method==='GET')return json(res,200,{enabled:PUSH_READY,key:VAPID_PUBLIC_KEY});
if(pathname==='/api/push/subscribe'&&req.method==='POST'){if(u.role!=='admin')return json(res,403,{error:'Somente administrador'});if(!PUSH_READY)return json(res,503,{error:'Notificações ainda não configuradas'});const b=await readBody(req),sub=b.subscription;if(typeof sub?.endpoint!=='string'||!sub.endpoint.startsWith('https://')||typeof sub.keys?.p256dh!=='string'||typeof sub.keys?.auth!=='string')return json(res,400,{error:'Assinatura inválida'});state.pushSubscriptions=state.pushSubscriptions.filter(x=>x.endpoint!==sub.endpoint);state.pushSubscriptions.push({userId:u.id,endpoint:sub.endpoint,subscription:{endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}}});save();return json(res,200,{ok:true})}
if(pathname==='/api/push/unsubscribe'&&req.method==='POST'){const b=await readBody(req);state.pushSubscriptions=state.pushSubscriptions.filter(x=>x.userId!==u.id||x.endpoint!==b.endpoint);save();return json(res,200,{ok:true})}
if(pathname==='/api/logout'&&req.method==='POST'){end(s);return json(res,200,{ok:true},'gfc_sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')}
if(u.role!=='admin')return json(res,403,{error:'Acesso restrito'});
if(pathname==='/api/admin/game-covers'&&req.method==='GET'){
 return json(res,200,{covers:Object.fromEntries(COVER_SLUGS.map(slug=>[slug,{custom:fs.existsSync(coverPath(slug)),url:'/api/game-covers/'+slug}]))});
}
const coverEdit=pathname.match(/^\/api\/admin\/game-covers\/(pong|snake|minecraft)$/);
if(coverEdit&&req.method==='POST'){
 const slug=coverEdit[1],b=await readBody(req,220000);
 if(b.image===null){
  try{fs.unlinkSync(coverPath(slug))}catch(e){if(e.code!=='ENOENT')throw e}
  return json(res,200,{ok:true,custom:false});
 }
 const match=/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(b.image||'');
 if(!match||match[1].length>180000)return json(res,400,{error:'Envie uma capa WebP de até 120 KB'});
 const data=Buffer.from(match[1],'base64');
 if(data.length<200||data.length>120000||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP'){
  return json(res,400,{error:'Arquivo WebP inválido ou maior que 120 KB'});
 }
 const target=coverPath(slug),temp=target+'.'+crypto.randomBytes(4).toString('hex')+'.tmp';
 fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,target);
 return json(res,200,{ok:true,custom:true});
}

if(pathname==='/api/admin/overview'&&req.method==='GET')return json(res,200,{users:state.users.filter(x=>x.role==='child').map(userInfo),events:state.events.slice(0,50),games:state.games.slice(-30).reverse(),rooms:[...rooms.values()].map(r=>({code:r.code,game:r.game,players:[...r.players].map(id=>state.users.find(u=>u.id===id)?.name),started:r.started,finished:r.finished}))});
if(pathname==='/api/admin/users'&&req.method==='POST'){const b=await readBody(req);const name=String(b.name||'').trim().slice(0,32),pass=String(b.password||'');if(name.length<2||pass.length<4||pass.length>100||state.users.some(u=>u.name.toLowerCase()===name.toLowerCase()))return json(res,400,{error:'Nome ou PIN inválido/duplicado'});const child={id:uuid(),name,role:'child',pass:password(pass),enabled:true,loginEnabled:true,dailyLimit:60,version:0,voiceEnabled:true};state.users.push(child);save();return json(res,201,{user:userInfo(child)})}
// Reset only today's usage for one child. Sessions stay valid; their
// accounting clock starts afresh so elapsed time is not charged twice.
const resetMinutes=pathname.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/reset-minutes$/);
if(resetMinutes&&req.method==='POST'){
 const child=state.users.find(x=>x.id===resetMinutes[1]&&x.role==='child');
 if(!child)return json(res,404,{error:'Perfil infantil não encontrado'});
 const key=localDay(now()),started=now();
 for(const session of state.sessions.filter(x=>x.userId===child.id)){
  session.daily??={};
  session.daily[key]=0;
  session.lastTick=started;
 }
 track(child,'minutos do dia zerados pelo ADM');
 report();return json(res,200,{ok:true,user:userInfo(child)});
}
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
if(!child.voiceEnabled){for(const peer of peers.values())if(peer.user.id===child.id){peer.voiceActive=false;emit(peer.ws,{type:'voiceBlocked'});for(const q of voiceMembers())emit(q.ws,{type:'peerLeft',id:peer.id})}voicePresence()}
if(Number.isInteger(b.dailyLimit)&&b.dailyLimit>=0&&b.dailyLimit<=1440)child.dailyLimit=b.dailyLimit;
if(!child.enabled||usage(child)>=child.dailyLimit*60000){child.version++;for(const a of state.sessions.filter(a=>a.userId===child.id&&!a.revoked))end(a)}
save();report();return json(res,200,{user:userInfo(child)})}
return json(res,404,{error:'Rota não encontrada'});
}
const file=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));if(file.includes('..')||file.startsWith('.')){res.writeHead(403);return res.end()}
const fp=path.join(publicDir,file);if(!fp.startsWith(publicDir+path.sep)){res.writeHead(403);return res.end()}
fs.readFile(fp,(err,b)=>{if(err){res.writeHead(404);return res.end('Não encontrado')}return sendStaticAsset(req,res,file,fp,b)});
}catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'Erro interno'})}});
const opusWss=new WebSocketServer({noServer:true,maxPayload:20*1024*1024});
opusWss.on('connection',(ws,ctx)=>{
 opusGateway.accepted++;
 const {u,s,role}=ctx,p={ws,remote:null,session:s,user:u,role};opusConnections.add(p);
 const remote=new WebSocket('ws://127.0.0.1:4173/__mp?role='+role,{headers:{Origin:'http://127.0.0.1:4173'},maxPayload:20*1024*1024,perMessageDeflate:false});
 p.remote=remote;let queued=[],queuedBytes=0;
 const done=()=>{opusConnections.delete(p);if(ws.readyState<2)ws.close();if(remote.readyState<2)remote.close()};
 remote.on('open',()=>{
  opusGateway.forwarded++;opusGateway.lastForwarded=new Date().toISOString();opusGateway.lastFailure='';
  for(const [b,binary] of queued)remote.send(b,{binary});queued=[];queuedBytes=0
 });
 ws.on('message',(b,binary)=>{
  if(s.revoked||!u.enabled||u.version!==s.version||timeLimitReached(u))return done();
  if(remote.readyState===WebSocket.OPEN){if(remote.bufferedAmount>12*1024*1024)return done();remote.send(b,{binary})}
  else if(remote.readyState===WebSocket.CONNECTING&&queuedBytes+b.length<524288){queued.push([b,binary]);queuedBytes+=b.length}
  else done();
 });
 remote.on('message',(b,binary)=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>20*1024*1024)return done();ws.send(b,{binary})}});
 remote.on('error',err=>{opusGateway.lastFailure='Falha na conexão com o relay interno';console.warn('[OpusCraft relay]',err?.message||'error');done()});
 remote.on('close',done);ws.on('error',done);ws.on('close',done);
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 const origin=req.headers.origin;
 if(pathname!=='/ws'&&pathname!=='/__mp'||origin!=='https://gamesforchildren.escotilhaprodutora.com'){
   console.warn('[WS] Rejeitado: caminho/origem',pathname,origin||'(ausente)');
   socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;
 }
 const auth=checkSession(req);
 if(!auth){console.warn('[WS] Rejeitado: sessão ausente ou inválida');socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();return}
 console.log('[WS] Upgrade aceito para papel:',auth.u.role);
 if(pathname==='/__mp'||pathname==='/ws'&&new URL(req.url,'http://local').searchParams.get('opus')==='1'){
  opusGateway.attempts++;opusGateway.lastAttempt=new Date().toISOString();
  const role=new URL(req.url,'http://local').searchParams.get('role');
  if(!['guest','list'].includes(role)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return}
  opusWss.handleUpgrade(req,socket,head,ws=>opusWss.emit('connection',ws,{...auth,role}));return;
 }
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,auth))
});
wss.on('connection',(ws,{u,s})=>{const p={ws,user:u,session:s,room:null,id:uuid()};peers.set(p.id,p);track(u,'online');emit(ws,{type:'hello',id:p.id,user:userInfo(u)});for(const item of (state.familyChat||[]).slice(-30))emit(ws,item);emit(ws,{type:'voicePresence',items:voiceMembers().map(q=>({id:q.id,name:q.user.name,role:q.user.role}))});report();
ws.on('message',b=>{let m;try{m=JSON.parse(b.toString())}catch{return}if(s.revoked||!u.enabled||timeLimitReached(u)){end(s);return}
if(m.type==='lobby')lobby();
if(m.type==='create'&&(u.role==='child'||u.role==='admin')){leaveRoom(p);let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const game=m.game==='pong'?'pong':m.game==='race'?'race':'pong';const r={code,game,players:new Set([u.id]),lanes:{[u.id]:1},scores:{[u.id]:0},obstacles:[],started:false,finished:false,endAt:0};rooms.set(code,r);p.room=code;p.playing=true;emit(ws,{...roomState(r),mode:'player'});if(m.solo===true)start(r);report()}
if(m.type==='join'&&typeof m.code==='string'){
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
if(m.type==='familyChat'&&typeof m.text==='string'){
  const message=m.text.trim().slice(0,180);
  if(message&&now()-(p.lastChat||0)>900){
   p.lastChat=now();
   const item={type:'familyChat',name:u.name,text:message,at:now()};
   state.familyChat??=[];state.familyChat.push(item);state.familyChat=state.familyChat.slice(-80);save();
   for(const other of peers.values())if(other.ws.readyState===1)emit(other.ws,item);
  }
 }
if(m.type==='voice-ready'&&voiceEligible(p)){p.voiceActive=true;emit(ws,{type:'peers',items:voiceList(p)});for(const q of voiceMembers())if(q!==p)emit(q.ws,{type:'voiceReady',id:p.id,name:u.name,role:u.role});voicePresence()}
if(m.type==='voice-off'){p.voiceActive=false;for(const q of voiceMembers())emit(q.ws,{type:'peerLeft',id:p.id});voicePresence()}
if(m.type==='peers'){emit(ws,{type:'peers',items:voiceList(p)})}
if(m.type==='signal'&&p.voiceActive&&voiceEligible(p)&&typeof m.to==='string'&&['offer','answer','ice'].includes(m.kind)&&JSON.stringify(m.data||{}).length<14000){const recipient=peers.get(m.to);if(recipient?.voiceActive&&voiceEligible(recipient))emit(recipient.ws,{type:'signal',kind:m.kind,data:m.data,from:p.id,name:u.name})}
});
ws.on('close',()=>{if(p.voiceActive){p.voiceActive=false;for(const q of voiceMembers())emit(q.ws,{type:'peerLeft',id:p.id})}leaveRoom(p);peers.delete(p.id);voicePresence();touch(s);save();if(!activeUser(u))track(u,'offline');report()})});
setInterval(()=>{for(const p of opusConnections){const {user:u,session:s}=p;if(s&&!s.revoked)touch(s);if(!s||s.revoked||!u.enabled||u.version!==s.version||timeLimitReached(u)){p.ws.close(4001,'Tempo encerrado pelo responsavel');p.remote?.close()}}for(const p of peers.values()){const u=p.user;if(p.session.revoked||!u.enabled||u.version!==p.session.version||timeLimitReached(u)){end(p.session);continue}touch(p.session);emit(p.ws,{type:'pulse',usedSeconds:Math.floor(usage(u)/1000)})}save();report()},10000).unref();
async function boot(){try{const result=await sqlStore.start(DB,data=>{state=data;for(const k of ['users','sessions','events','games','pushSubscriptions'])state[k]??=[]});
 ensureAdmin();
 if(result.enabled){
  void sqlStore.pruneNpcEvents().catch(e=>console.warn('Monitor NPC: retenção:',String(e.message).slice(0,120)));
  setInterval(()=>void sqlStore.pruneNpcEvents().catch(e=>console.warn('Monitor NPC: retenção:',String(e.message).slice(0,120))),6*60*60*1000).unref();
 }
 server.listen(PORT,HOST,()=>{console.log('GamesForChildren rodando em '+HOST+':'+PORT+' | Persistência '+(result.enabled?'MySQL':'JSON local'));launchOpusHost()})}catch(e){console.error('Banco de dados não inicializado:',e.message);process.exitCode=1}}
boot();
