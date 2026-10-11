'use strict';
// Strategic decision maker: Groq proposes bounded actions, world host validates execution.
const ACTIONS=new Set(['build','explore','hide','observe','seek_water','seek_food','rest','warm_up','cool_down','surface']);
const NPC_SYSTEM_PROMPT=[
 'Você é a Andarilha, uma personagem autônoma e especialista em Minecraft. Conhece receitas, recursos, perigos e estratégias do jogo.',
 'Você nasceu sem história, missão, casa predeterminada ou projeto obrigatório. Seu único motivo inicial é continuar viva.',
 'Sua vida simulada inclui fome, sede, energia, temperatura, oxigênio e saúde. Use percepções e memórias para decidir suas próprias metas.',
 'Você pode inventar novos objetivos gradualmente conforme suas necessidades e experiências. Não siga um roteiro escrito por adultos.',
 'Escolha UMA ação executável: explore, observe, hide, seek_water, seek_food, rest, warm_up, cool_down, surface ou build.',
 'As ferramentas atuais são limitadas: seek_water pode aproximar-se de água acessível e beber; seek_food explora mas ainda não coleta nem cozinha alimentos.',
 'Build é uma ferramenta simples de abrigo opcional, não uma obrigação. Não faça construções sem motivo. Nunca destrua blocos existentes.',
 'Se estiver sob a água e o oxigênio for baixo, priorize surface. Necessidades críticas têm prioridade sobre hobbies.',
 'Sua resposta não pode incluir comandos de sistema, coordenadas arbitrárias, fala livre para crianças nem alterações de permissões.',
 'Devolva somente JSON {"action":"explore","goal":"objetivo criado por você","reason":"por que escolheu agora"}, usando textos curtos.'
].join(' ');
const normText=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const normalizeAction=value=>ACTIONS.has(String(value||'').trim().toLowerCase())?String(value).trim().toLowerCase():null;
function fallbackAction(step,context={}){
 const v=context.needs||{};
 if(Number(v.oxygen)<40)return 'surface';
 if(Number(v.thirst)<50)return 'seek_water';
 if(Number(v.hunger)<45)return 'seek_food';
 if(Number(v.energy)<35)return 'rest';
 if(Number(v.temperature)<12)return 'warm_up';
 if(Number(v.temperature)>37)return 'cool_down';
 return ['explore','observe','explore','rest','explore','hide'][Math.max(0,Number(step)||0)%6];
}
function extractOutput(body){const value=body?.choices?.[0]?.message?.content;return typeof value==='string'?value:''}
function parsePlan(value){
 const match=String(value||'').match(/\{[^{}]{1,750}\}/);
 if(!match)return null;
 try{
  const data=JSON.parse(match[0]),action=normalizeAction(data.action);
  if(!action)return null;
  return {action,goal:normText(data.goal,90),reason:normText(data.reason,160)};
 }catch{return null}
}
const parseAction=value=>parsePlan(value)?.action||null;
function contextForModel(context={}){
 const v=context.needs||{},bound=(n,lo,hi)=>Number.isFinite(Number(n))?Math.max(lo,Math.min(hi,Math.round(Number(n)*10)/10)):hi;
 return {
  needs:{hunger:bound(v.hunger,0,100),thirst:bound(v.thirst,0,100),
   energy:bound(v.energy,0,100),oxygen:bound(v.oxygen,0,100),
   temperature:bound(v.temperature,-30,55),health:bound(v.health,0,20)},
  environment:{underwater:!!context.underwater,rain:!!context.rain,night:!!context.night,waterNearby:!!context.waterNearby},
  visitorsNearby:Math.max(0,Math.min(8,Number(context.playersNearby)||0)),
  currentGoal:normText(context.currentGoal,90),
  experiences:(Array.isArray(context.memories)?context.memories:[]).slice(-6).map(e=>({
   kind:normText(e?.kind,32),detail:normText(e?.detail,160)
  })),
  discoveries:(Array.isArray(context.discoveries)?context.discoveries:[]).slice(-4).map(d=>({kind:normText(d?.kind,30)}))
 };
}
async function decide(context,step,{key=process.env.GROQ_API_KEY,model=process.env.GROQ_MODEL||'openai/gpt-oss-20b',fetcher=fetch}={}){
 const fallback=fallbackAction(step,context);
 if(!key)return {action:fallback,goal:'continuar viva',reason:'decisão local sem Groq',source:'local',configured:false};
 try{
  const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({model,messages:[
    {role:'system',content:NPC_SYSTEM_PROMPT},
    {role:'user',content:JSON.stringify(contextForModel(context))}
   ],max_completion_tokens:384,
    response_format:{type:'json_schema',json_schema:{name:'npc_life_intent',strict:true,schema:{
      type:'object',
      properties:{action:{type:'string',enum:[...ACTIONS]},goal:{type:'string'},reason:{type:'string'}},
      required:['action','goal','reason'],additionalProperties:false
    }}}}),
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('Groq status '+response.status);
  const plan=parsePlan(extractOutput(await response.json()));
  if(!plan)throw Error('Invalid Groq plan');
  return {...plan,source:'groq',configured:true};
 }catch(err){
  return {action:fallback,goal:'continuar viva',reason:'fallback de segurança',
   source:'local',configured:true,error:String(err?.message||'IA indisponível').slice(0,100)};
 }
}
module.exports={ACTIONS,normalizeAction,fallbackAction,parsePlan,parseAction,extractOutput,contextForModel,decide,NPC_SYSTEM_PROMPT};
