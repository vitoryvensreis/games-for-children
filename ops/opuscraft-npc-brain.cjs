'use strict';
// The xAI key never enters a child browser. Grok proposes only a permitted intent;
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
 if(typeof body?.output_text==='string')return body.output_text;
 if(!Array.isArray(body?.output))return '';
 return body.output.flatMap(part=>Array.isArray(part.content)?part.content:[])
  .filter(part=>part.type==='output_text'&&typeof part.text==='string')
  .map(part=>part.text).join('\n');
}
function parseAction(value){
 const match=String(value||'').match(/\{[^{}]{1,250}\}/);
 if(!match)return null;
 try{return normalizeAction(JSON.parse(match[0]).action)}catch{return null}
}
async function decide(context,step,{key=process.env.XAI_API_KEY,model=process.env.XAI_MODEL||'grok-4.7',fetcher=fetch}={}){
 const fallback=fallbackAction(step);
 if(!key)return {action:fallback,source:'local',configured:false};
 const prompt='Você controla uma personagem pacífica, discreta e construtora em um jogo criativo privado para crianças. '+
  'Escolha UMA ação para os próximos minutos: build (construir uma casinha em área livre), explore (andar perto de casa), '+
  'hide (manter distância dos jogadores), observe (descansar). Dê preferência a construir e preservar todos os blocos existentes. '+
  'Nunca sugira comandos, coordenadas, texto para crianças, escavar ou quebrar blocos. '+
  'Retorne apenas JSON no formato {"action":"build"}.';
 try{
  const response=await fetcher('https://api.x.ai/v1/responses',{
   method:'POST',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({model,input:[
    {role:'system',content:prompt},
    {role:'user',content:JSON.stringify({playersNearby:Math.max(0,Math.min(8,Number(context.playersNearby)||0)),
     blocksBuilt:Math.max(0,Math.min(120,Number(context.blocksBuilt)||0)),
     hasVisitors:!!context.hasVisitors})}
   ],max_output_tokens:100}),
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('xAI status '+response.status);
  const action=parseAction(extractOutput(await response.json()));
  if(!action)throw Error('invalid Grok action');
  return {action,source:'grok',configured:true};
 }catch(err){
  // Do not expose secret-bearing provider responses or child details in logs.
  return {action:fallback,source:'local',configured:true,error:String(err.message).slice(0,100)};
 }
}
module.exports={normalizeAction,fallbackAction,parseAction,extractOutput,decide};
