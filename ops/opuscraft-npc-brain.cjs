'use strict';
// This is an architect, not a survival NPC. Gemini proposes one project at a time.
// The world host validates terrain and executes each block; AI never writes arbitrary code.
const KINDS=Object.freeze(['village','castle','windmill','bridge','cave','town','portal','tower','garden']);
const STYLES=Object.freeze(['medieval','rustic','fantasy','stone','woodland']);
const MODEL=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
const NPC_SYSTEM_PROMPT=[
 'Você é a Andarilha, uma arquiteta autônoma do universo Minecraft de uma família.',
 'Seu propósito único é expandir continuamente o mundo com construções originais e interessantes.',
 'Trabalhe em apenas UMA obra por vez: escolha uma, conclua-a e só então escolha a próxima.',
 'Crie vilas, castelos, moinhos, cavernas, cidades, pontes, portais decorativos, torres ou jardins.',
 'Escolha o tipo e estilo aproveitando as construções anteriores, sem repetir sempre a mesma ideia.',
 'O motor coloca cada bloco individualmente, constrói estruturas físicas e só prepara terreno natural em locais não protegidos.',
 'É proibido destruir construções de jogadores ou suas próprias obras anteriores.',
 'Moinhos têm animação mecânica quando o motor suportar; portais sem ligação real devem ser rotulados como decorativos.',
 'Não sugira execução arbitrária de código nem coordenadas. Retorne apenas tipo, estilo, nome e conceito.',
 'Escolha uma obra original, coerente com o histórico de obras já concluídas.'
].join(' ');
function text(v,n){return typeof v==='string'?v.trim().slice(0,n):''}
function parsePlan(input){
 try{
  let value=input;
  if(typeof value==='string'){
   const a=value.indexOf('{'),b=value.lastIndexOf('}');
   if(a<0||b<=a)return null;
   value=JSON.parse(value.slice(a,b+1));
  }
  if(!KINDS.includes(value?.kind)||!STYLES.includes(value?.style))return null;
  return {kind:value.kind,style:value.style,title:text(value.title,70)||value.kind,
   reason:text(value.reason,150)||'Expandir o mundo de forma criativa'};
 }catch{return null}
}
function localPlan(context={}){
 const history=Array.isArray(context.completed)?context.completed:[];
 const kinds=['village','windmill','bridge','castle','garden','tower','cave','town','portal'];
 const counts=new Map(kinds.map(k=>[k,history.filter(x=>x.kind===k).length]));
 const index=history.length%kinds.length;
 const kind=[...kinds.slice(index),...kinds.slice(0,index)].sort((a,b)=>(counts.get(a)||0)-(counts.get(b)||0))[0];
 const style=STYLES[history.length%STYLES.length];
 return {kind,style,title:kind+' '+(history.length+1),reason:'Proposta local, sem acesso ao Gemini',source:'local',configured:false};
}
async function decide(context={},step=0,{key=process.env.GEMINI_API_KEY,model=MODEL,fetcher=fetch}={}){
 const fallback=localPlan(context);
 if(!key)return fallback;
 const history=(Array.isArray(context.completed)?context.completed:[]).slice(-14).map(x=>({
  kind:KINDS.includes(x.kind)?x.kind:'other',title:text(x.title,70)}));
 const input={completed:history,numberCompleted:Math.min(100000,Number(context.numberCompleted)||history.length),
  possibleProjects:KINDS,possibleStyles:STYLES,oneProjectAtATime:true};
 const schema={type:'OBJECT',properties:{
   kind:{type:'STRING',enum:KINDS},style:{type:'STRING',enum:STYLES},
   title:{type:'STRING'},reason:{type:'STRING'}
  },required:['kind','style','title','reason']};
 try{
  const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+
    encodeURIComponent(model)+':generateContent',{
   method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
   body:JSON.stringify({systemInstruction:{parts:[{text:NPC_SYSTEM_PROMPT}]},
    contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],
    generationConfig:{responseMimeType:'application/json',responseSchema:schema,
     maxOutputTokens:700,temperature:0.9}}),
   signal:AbortSignal.timeout(20000)
  });
  if(!response.ok){
   let code='';try{const e=await response.json();code=text(e?.error?.status,32)}catch{}
   throw Error('Gemini status '+response.status+(code?' ('+code+')':''));
  }
  const raw=await response.json();
  const answer=(raw?.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');
  const plan=parsePlan(answer);
  if(!plan)throw Error('Gemini returned invalid project JSON');
  return {...plan,source:'gemini',configured:true};
 }catch(err){
  return {...fallback,configured:true,error:text(err?.message||'Gemini indisponível',120)};
 }
}
module.exports={KINDS,STYLES,MODEL,NPC_SYSTEM_PROMPT,parsePlan,localPlan,decide};
