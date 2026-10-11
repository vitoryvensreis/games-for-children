const mysql=require('mysql2/promise');
const fs=require('node:fs');
const path=require('node:path');
let pool, queue=Promise.resolve(), npcAuditReady=false;
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
async function close(){await queue.catch(()=>{});if(pool)await pool.end()}
module.exports={start,persist,close,enabled,appendNpcEvent,listNpcEvents,pruneNpcEvents};
