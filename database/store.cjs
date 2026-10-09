const mysql=require('mysql2/promise');
const fs=require('node:fs');
const path=require('node:path');
let pool, queue=Promise.resolve();
const enabled=()=>Boolean(process.env.DB_HOST&&process.env.DB_NAME&&process.env.DB_USER&&process.env.DB_PASSWORD);
async function start(dbFile,updateState){
 if(!enabled())return {enabled:false};
 pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionLimit:3,waitForConnections:true,timezone:'Z',connectTimeout:8000});
 await pool.query('CREATE TABLE IF NOT EXISTS game_state (id TINYINT UNSIGNED PRIMARY KEY, payload LONGTEXT NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
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
async function close(){await queue.catch(()=>{});if(pool)await pool.end()}
module.exports={start,persist,close,enabled};
