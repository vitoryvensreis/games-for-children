'use strict';
// The Groq key never enters a child browser. GroqCloud proposes only a permitted intent;
// the authoritative OpusCraft host validates coordinates, builds and teleporting.
const ACTIONS=new Set(['build','explore','hide','observe']);
function normalizeAction(value){
 const action=String(value||'').trim().toLowerCase();
 return ACTIONS.has(action)?action:null;
}
function fallbackAction(step){
 return ['build','build','explore','observe','build','hide'][Math.max(0,Number(step)||0)%6];
}
function extractOutput(body){
 const content=body?.choices?.[0]?.message?.content;
 return typeof content==='string'?content:'';
}
function parseAction(value){
 const match=String(value||'').match(/\{[^{}]{1,250}\}/);
 if(!match)return null;
 try{return normalizeAction(JSON.parse(match[0]).action)}catch{return null}
}
async function decide(context,step,{key=process.env.GROQ_API_KEY,model=process.env.GROQ_MODEL||'openai/gpt-oss-20b',fetcher=fetch}={}){
 const fallback=fallbackAction(step);
 if(!key)return {action:fallback,source:'local',configured:false};
 const prompt='Você controla uma personagem pacífica, discreta e construtora em um jogo criativo privado para crianças. '+
  'Escolha UMA ação para os próximos minutos: build (construir uma casinha em área livre), explore (andar perto de casa), '+
  'hide (manter distância dos jogadores), observe (descansar). Dê preferência a construir e preservar todos os blocos existentes. '+
  'Nunca sugira comandos, coordenadas, texto para crianças, escavar ou quebrar blocos. '+
  'Retorne apenas JSON no formato {"action":"build"}.';
 try{
  const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({model,messages:[
    {role:'system',content:prompt},
    {role:'user',content:JSON.stringify({playersNearby:Math.max(0,Math.min(8,Number(context.playersNearby)||0)),
     blocksBuilt:Math.max(0,Math.min(120,Number(context.blocksBuilt)||0)),
     hasVisitors:!!context.hasVisitors})}
   ],max_completion_tokens:256,
   response_format:{type:'json_schema',json_schema:{name:'npc_intent',strict:true,schema:{
    type:'object',properties:{action:{type:'string',enum:[...ACTIONS]}},
    required:['action'],additionalProperties:false
   }}}}),
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('Groq status '+response.status);
  const action=parseAction(extractOutput(await response.json()));
  if(!action)throw Error('invalid Groq action');
  return {action,source:'groq',configured:true};
 }catch(err){
  // Do not expose secret-bearing provider responses or child details in logs.
  return {action:fallback,source:'local',configured:true,error:String(err.message).slice(0,100)};
 }
}
module.exports={normalizeAction,fallbackAction,parseAction,extractOutput,decide};
