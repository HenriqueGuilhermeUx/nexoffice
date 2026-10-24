/**
 * Optional F-Insight research bridge for Nex Personal.
 *
 * No personal finance data, identity, holdings, tokens or context ever leave
 * this service. Only an explicitly requested market symbol (or generic macro
 * query) is forwarded to the independent F-Insight market-terminal API.
 * Disabled by default, read-only, and entirely separate from PJ workspace auth.
 */
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';
import {verifyFInsightQuote} from './personal-finsight-quote.js';

const symbolSchema=z.string().trim().toUpperCase().regex(/^[A-Z0-9.^-]{1,24}$/,'Símbolo inválido.');
const upstreamPaths=['/api/internal/market-terminal/asset/','/api/internal/market-terminal/macro'] as const;

function connection(){
 const raw=String(process.env.FINSIGHT_PERSONAL_INTERNAL_URL||'').trim();
 const key=String(process.env.FINSIGHT_PERSONAL_INTERNAL_KEY||'').trim();
 if(!raw||!key)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||
     !url.hostname.includes('.')||url.hostname==='localhost')return null;
  return {base:url.origin,key};
 }catch{return null;}
}

async function requirePersonal(req:FastifyRequest){
 const user=await authenticate(req);
 const result=await query<{user_id:string}>('select user_id from nex_personal.profiles where user_id=$1',[user.id]);
 if(result.length===0)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nexa.');
}

async function callMarket(path:string){
 const cfg=connection();
 if(!cfg)throw new ApiError(409,'finsight_personal_not_connected','A pesquisa F-Insight ainda não foi habilitada nesta homologação.');
 if(!upstreamPaths.some(allowed=>path.startsWith(allowed)))
  throw new ApiError(400,'market_path_not_allowed','Operação indisponível.');
 let response:Response;
 try{
  response=await fetch(cfg.base+path,{method:'GET',headers:{accept:'application/json','x-finsight-internal-key':cfg.key},redirect:'error',signal:AbortSignal.timeout(8_000)});
 }catch{throw new ApiError(502,'finsight_unavailable','O F-Insight está indisponível. Nenhum dado demonstrativo será exibido.');}
 if(!response.ok)throw new ApiError(502,'finsight_research_unavailable','A pesquisa do F-Insight não está disponível no momento.');
 if(!String(response.headers.get('content-type')||'').toLowerCase().includes('application/json'))
  throw new ApiError(502,'finsight_unexpected_content','O F-Insight não retornou uma resposta JSON válida.');
 const text=await response.text();
 if(text.length>128_000)throw new ApiError(502,'finsight_response_too_large','Pesquisa indisponível.');
 try{return JSON.parse(text) as Record<string,any>;}
 catch{throw new ApiError(502,'finsight_invalid_response','Pesquisa indisponível.');}
}

export async function registerNexPersonalFInsightRoutes(app:FastifyInstance){
 // This endpoint only reports configuration; it never contacts F-Insight.
 app.get('/v1/personal/finsight/status',async req=>{
  await requirePersonal(req);
  return {provider:'f-insight',configured:Boolean(connection()),readOnly:true,externalEffect:false,
   dataSharing:false,accountLinking:false,portfolioImported:false,liveDataGuaranteed:false};
 });

 app.get('/v1/personal/finsight/asset/:symbol',async req=>{
  await requirePersonal(req);
  const symbol=symbolSchema.parse((req.params as {symbol:string}).symbol);
  const payload=await callMarket('/api/internal/market-terminal/asset/'+encodeURIComponent(symbol)+
   '?history=false&news=false&macro=false&sentiment=false');
  const verified=verifyFInsightQuote(payload.quote,symbol);
  return {symbol,available:Boolean(verified),quote:verified,readOnly:true,externalEffect:false,
   note:valid?'Última cotação informada pelo provedor, com fonte e horário. Pode não ser em tempo real. Confirme na corretora antes de decidir.':
   'Cotação válida não disponível ou desatualizada. Não exibimos valores simulados ou sem data.'};
 });

 app.get('/v1/personal/finsight/macro',async req=>{
  await requirePersonal(req);
  const payload=await callMarket('/api/internal/market-terminal/macro');
  const snapshot=payload?.snapshot||{};
  const authorized=[
   {id:'selicTarget',label:'Selic Meta',code:432},
   {id:'ipcaMonthly',label:'IPCA mensal',code:433},
   {id:'usdBrl',label:'Dólar comercial',code:1}
  ];
  const indicators=authorized.flatMap(meta=>{
   const row=snapshot[meta.id];
   if(!row||row.code!==meta.code||row.source!=='Banco Central do Brasil - SGS'||
      !Number.isFinite(row.value)||typeof row.date!=='string'||!/^[0-9]{2}[/][0-9]{2}[/][0-9]{4}$/.test(row.date))return [];
   return [{id:meta.id,label:meta.label,value:row.value,unit:String(row.unit||''),date:row.date,source:row.source}];
  });
  return {provider:'f-insight',source:'Banco Central do Brasil - SGS',indicators,
   fetchedAt:typeof payload.fetchedAt==='string'?payload.fetchedAt:null,
   readOnly:true,externalEffect:false,demoDataUsed:false};
 });
}
