#!/usr/bin/env node
// Migração relacional idempotente e manual. Nunca apaga game_state.
const mysql=require('mysql2/promise');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const required=['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'];
for(const k of required)if(!process.env[k]){console.error('Falta variável '+k);process.exit(1)}
const dry=!process.argv.includes('--apply');
const config={host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,timezone:'Z'};
const dt=n=>new Date(Number(n||Date.now())).toISOString().slice(0,23).replace('T',' ');
async function main(){
 const con=await mysql.createConnection(config);
 try{
  const [rows]=await con.query('SELECT payload FROM game_state WHERE id=1');
  if(rows.length!==1)throw Error('Registro game_state id=1 não encontrado');
  const state=JSON.parse(rows[0].payload);
  const users=state.users||[],sessions=state.sessions||[],events=state.events||[],games=state.games||[],push=state.pushSubscriptions||[];
  console.log(JSON.stringify({modo:dry?'SOMENTE ANALISE':'APLICAR',usuarios:users.length,sessoes:sessions.length,eventos:events.length,partidas:games.length,assinaturas_push:push.length},null,2));
  if(dry){console.log('Nenhuma alteração realizada. Use --apply somente após backup verificado.');return}
  const schema=fs.readFileSync(path.join(__dirname,'migrations/001_relational_projection.sql'),'utf8');
  for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean))await con.query(statement);
  await con.beginTransaction();
  try{
   for(const u of users)await con.execute(
    `INSERT INTO gfc_users(id,name,role,password_hash,enabled,login_enabled,voice_enabled,daily_limit_minutes,session_version)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role),password_hash=VALUES(password_hash),enabled=VALUES(enabled),login_enabled=VALUES(login_enabled),voice_enabled=VALUES(voice_enabled),daily_limit_minutes=VALUES(daily_limit_minutes),session_version=VALUES(session_version)`,
    [u.id,u.name,u.role,u.pass,Boolean(u.enabled),Boolean(u.loginEnabled),Boolean(u.voiceEnabled),Number(u.dailyLimit||0),Number(u.version||0)]);
   const userIds=new Set(users.map(u=>u.id));
   for(const s of sessions){if(!userIds.has(s.userId)||!s.key)continue;await con.execute(
    `INSERT INTO gfc_sessions(id,user_id,token_hash,session_version,expires_at,revoked,daily_usage_json,last_tick)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at),revoked=VALUES(revoked),daily_usage_json=VALUES(daily_usage_json),last_tick=VALUES(last_tick)`,
    [s.id,s.userId,s.key,Number(s.version||0),dt(s.expires),Boolean(s.revoked),JSON.stringify(s.daily||{}),s.lastTick?dt(s.lastTick):null])}
   for(const e of events){await con.execute(
    'INSERT IGNORE INTO gfc_activity_events(id,user_id,event_type,occurred_at) VALUES (?,?,?,?)',
    [e.id,userIds.has(e.userId)?e.userId:null,String(e.type||'unknown').slice(0,100),dt(e.at)])}
   for(const g of games){await con.execute('INSERT IGNORE INTO gfc_matches(id,game_key,played_at) VALUES (?,?,?)',[g.id,'race',dt(g.at)]);
    for(let i=0;i<(g.players||[]).length;i++){const p=g.players[i];const matches=users.filter(u=>u.name===p.name);await con.execute(
     'INSERT INTO gfc_match_players(match_id,user_id,player_name,score,position) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),player_name=VALUES(player_name),score=VALUES(score)',
     [g.id,matches.length===1?matches[0].id:null,p.name,Number(p.score||0),i+1])}}
   for(const p of push){if(!userIds.has(p.userId))continue;await con.execute(
    'INSERT INTO gfc_push_subscriptions(endpoint_hash,user_id,endpoint,subscription_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),subscription_json=VALUES(subscription_json)',
    [crypto.createHash('sha256').update(p.endpoint).digest('hex'),p.userId,p.endpoint,JSON.stringify(p.subscription)])}
   await con.commit();console.log('Projeção relacional criada e preenchida. game_state permanece intacta.');
  }catch(e){await con.rollback();throw e}
 }finally{await con.end()}
}
main().catch(e=>{console.error('Falha na migração:',e.message);process.exitCode=1});
