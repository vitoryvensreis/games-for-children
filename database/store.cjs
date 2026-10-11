const mysql=require('mysql2/promise');
const fs=require('node:fs');
const path=require('node:path');
let pool, queue=Promise.resolve(), npcAuditReady=false, npcLifeReady=false;
const enabled=()=>Boolean(process.env.DB_HOST&&process.env.DB_NAME&&process.env.DB_USER&&process.env.DB_PASSWORD);
async function start(dbFile,updateState){
 if(!enabled())return {enabled:false};
 pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionLimit:3,waitForConnections:true,timezone:'Z',connectTimeout:8000});
 await pool.query('CREATE TABLE IF NOT EXISTS game_state (id TINYINT UNSIGNED PRIMARY KEY, payload LONGTEXT NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 try{
  const migration=fs.readFileSync(path.join(__dirname,'migrations','002_npc_audit.sql'),'utf8');
  await pool.query(migration);
  npcAuditReady=true;
 }catch(e){
  console.warn('Monitor Andarilha sem histórico MySQL:',String(e.message).slice(0,180));
 }
 try{
  const migration=fs.readFileSync(path.join(__dirname,'migrations','003_npc_life_state.sql'),'utf8');
  await pool.query(migration);
  npcLifeReady=true;
 }catch(e){console.warn('Memória da Andarilha: MySQL indisponível; usando arquivo isolado:',String(e.message).slice(0,130))}
 const [rows]=await pool.query('SELECT payload,updated_at FROM game_state WHERE id=1');
 let local=null;try{local=JSON.parse(fs.readFileSync(dbFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 const localTime=local?fs.statSync(dbFile).mtimeMs:0;
 const remoteTime=rows.length?new Date(rows[0].updated_at).getTime():0;
 if(rows.length&&(!local||remoteTime>=localTime)){updateState(JSON.parse(rows[0].payload));return {enabled:true,source:'mysql'}}
 if(local){await pool.execute('INSERT INTO game_state(id,payload) VALUES (1,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=CURRENT_TIMESTAMP(3)',[JSON.stringify(local)]);return {enabled:true,source:'local-migrated'}}
 return {enabled:true,source:'empty'}
}
function persist(state){
 if(!pool)return;
 const snapshot=JSON.stringify(state);
 queue=queue.catch(()=>{}).then(()=>pool.execute('INSERT INTO game_state(id,payload) VALUES (1,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=CURRENT_TIMESTAMP(3)',[snapshot]));
 queue.catch(e=>console.error('Falha de persistência MySQL:',e.message));
}
const validTypes=new Set(['question','decision','step','error']);
const validActions=new Set(['build','explore','hide','observe']);
async function appendNpcEvent(event){
 if(!npcAuditReady||!pool)return null;
 const eventType=validTypes.has(event?.type)?event.type:null;
 if(!eventType)return null;
 const action=validActions.has(event.action)?event.action:null;
 const source=['groq','local'].includes(event.source)?event.source:null;
 // Enforce a strict allowlist: no credentials or player names from the host.
 const detail=event.details&&typeof event.details==='object'&&!Array.isArray(event.details)?event.details:{};
 const detailsJson=JSON.stringify(detail).slice(0,4096);
 const [result]=await pool.execute(
  'INSERT INTO gfc_npc_audit(event_type,action,source,details_json) VALUES (?,?,?,?)',
  [eventType,action,source,detailsJson]);
 return {id:Number(result.insertId),type:eventType,action,source,details:JSON.parse(detailsJson),at:new Date().toISOString()};
}
async function listNpcEvents(after=0,limit=60){
 if(!npcAuditReady||!pool)return {enabled:false,events:[]};
 const cursor=Number.isSafeInteger(Number(after))?Math.max(0,Number(after)):0;
 const count=Number.isSafeInteger(Number(limit))?Math.max(1,Math.min(80,Number(limit))):60;
 const [rows]=cursor?
  await pool.query('SELECT id,event_type,action,source,details_json,created_at FROM gfc_npc_audit WHERE id > ? ORDER BY id ASC LIMIT ?', [cursor,count]):
  await pool.query('SELECT id,event_type,action,source,details_json,created_at FROM gfc_npc_audit ORDER BY id DESC LIMIT ?', [count]);
 const events=rows.map(r=>{
  let details={};try{details=JSON.parse(r.details_json||'{}')}catch{}
  return {id:Number(r.id),type:r.event_type,action:r.action,source:r.source,details,
   at:r.created_at instanceof Date?r.created_at.toISOString():String(r.created_at).replace(' ','T')+'Z'};
 });
 if(!cursor)events.reverse();
 return {enabled:true,events};
}
async function pruneNpcEvents(){
 if(!npcAuditReady||!pool)return;
 await pool.query('DELETE FROM gfc_npc_audit WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 30 DAY LIMIT 2000');
}
// File mirror works even if the MySQL migration isn't permitted or its connection fails.
const npcLifeFile=()=>path.join(process.env.DATA_DIR||path.join(__dirname,'..','data'),'opuscraft','andarilha-life.json');
const limitedLife=(data)=>{
 if(!data||typeof data!=='object'||data.version!==1)return null;
 const v=data.vitals;
 if(!v||!['hunger','thirst','energy','temperature','oxygen','health'].every(k=>Number.isFinite(v[k])))return null;
 const bound=(n,min,max)=>Math.min(max,Math.max(min,n));
 const cleanText=(x,m)=>typeof x==='string'?x.slice(0,m):'';
 const safe=data.safe||{};
 return {
  version:1,vitals:{hunger:bound(v.hunger,0,100),thirst:bound(v.thirst,0,100),
   energy:bound(v.energy,0,100),temperature:bound(v.temperature,-30,55),
   oxygen:bound(v.oxygen,0,100),health:bound(v.health,0,20)},
  livedSeconds:bound(Number(data.livedSeconds)||0,0,1e9),
  deaths:bound(Number(data.deaths)||0,0,1e6),
  currentGoal:cleanText(data.currentGoal,90),goalReason:cleanText(data.goalReason,160),
  experiences:(Array.isArray(data.experiences)?data.experiences:[]).slice(-25).map(e=>({
   kind:cleanText(e?.kind,32),detail:cleanText(e?.detail,160),at:bound(Number(e?.at)||0,0,1e9)
  })),
  discoveries:(Array.isArray(data.discoveries)?data.discoveries:[]).slice(-12).filter(d=>Number.isFinite(d?.x)&&Number.isFinite(d?.z)).map(d=>({
   x:bound(Math.round(d.x),-30000000,30000000),z:bound(Math.round(d.z),-30000000,30000000),kind:cleanText(d.kind,30)
  })),
  safe:{x:Number.isFinite(safe.x)?safe.x:0,y:Number.isFinite(safe.y)?safe.y:70,z:Number.isFinite(safe.z)?safe.z:0}
 };
};
async function saveNpcLife(data){
 const life=limitedLife(data);if(!life)return false;
 const text=JSON.stringify(life);
 const file=npcLifeFile();fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const tmp=file+'.tmp';fs.writeFileSync(tmp,text,{mode:0o600});fs.renameSync(tmp,file);
 if(npcLifeReady&&pool){
  try{await pool.execute('INSERT INTO gfc_npc_life_state(id,payload_json) VALUES (1,?) ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json),updated_at=CURRENT_TIMESTAMP(3)',[text])}
  catch(e){console.warn('Memória NPC: arquivo local preservado; MySQL:',String(e.message).slice(0,130))}
 }
 return true;
}
async function loadNpcLife(){
 // File is written first; MySQL is a durable second copy.
 const file=npcLifeFile();
 try{const life=limitedLife(JSON.parse(fs.readFileSync(file,'utf8')));if(life)return life}catch(e){if(e.code!=='ENOENT')console.warn('Memória NPC: arquivo:',String(e.message).slice(0,130))}
 if(npcLifeReady&&pool){
  try{
   const [rows]=await pool.query('SELECT payload_json FROM gfc_npc_life_state WHERE id=1');
   if(rows.length)return limitedLife(JSON.parse(rows[0].payload_json));
  }catch(e){console.warn('Memória NPC: restauração MySQL:',String(e.message).slice(0,130))}
 }
 return null;
}
async function close(){await queue.catch(()=>{});if(pool)await pool.end()}
module.exports={start,persist,close,enabled,appendNpcEvent,listNpcEvents,pruneNpcEvents,saveNpcLife,loadNpcLife,limitedLife};
