import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';

const symbol=z.string().trim().toUpperCase().regex(/^[A-Z0-9.^-]{1,24}$/);
const calculation=z.object({type:z.enum(['compound_with_contributions','real_return','fixed_income_scenario','benchmark_percentage_scenario','average_price','dividend_yield']),input:z.record(z.string(),z.unknown())}).strict();

function bridgeConfig(){
  const raw=String(process.env.FINSIGHT_BASE_URL||'').trim();
  const key=String(process.env.FINSIGHT_SERVICE_KEY||'').trim();
  let base:string|null=null;
  try{const url=new URL(raw);if(['https:','http:'].includes(url.protocol))base=url.toString().replace(/\/$/,'')}catch{}
  return{base,key,configured:Boolean(base&&key)};
}

function requiredPolicy(value:any){
  const policy=value?.policy||{};
  const safe=policy.recommendation===false&&policy.execution===false&&policy.ranking===false&&policy.buySellSignal===false&&policy.portfolioAdvice===false&&policy.advisorClientData===false;
  if(!safe)throw new ApiError(502,'finsight_policy_mismatch','O F-Insight respondeu fora do contrato informativo permitido pelo NexOffice.');
  return policy;
}

async function finsight(workspaceId:string,path:string,init:RequestInit={}){
  const cfg=bridgeConfig();
  if(!cfg.configured||!cfg.base)throw new ApiError(409,'finsight_not_configured','Radar de investimentos ainda não está conectado neste ambiente.');
  const headers=new Headers(init.headers||{});
  headers.set('accept','application/json');
  headers.set('content-type','application/json');
  headers.set('x-nexoffice-key',cfg.key);
  headers.set('x-nexoffice-workspace-id',workspaceId);
  let response:Response;
  try{response=await fetch(`${cfg.base}/api/internal/nexoffice${path}`,{...init,headers,signal:AbortSignal.timeout(10_000)})}
  catch{throw new ApiError(502,'finsight_unreachable','F-Insight indisponível neste momento.');}
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok){
    const code=String(payload?.error||'finsight_request_failed');
    if(response.status===401)throw new ApiError(502,'finsight_bridge_unauthorized','A conexão segura com o F-Insight precisa ser revisada.');
    if(response.status===429)throw new ApiError(429,'finsight_rate_limited','Muitas consultas ao Radar em pouco tempo. Tente novamente em instantes.');
    if(response.status===404)throw new ApiError(404,code,'Informação não disponível no F-Insight.');
    if(response.status===503)throw new ApiError(409,code,'Radar F-Insight ainda não está habilitado neste ambiente.');
    throw new ApiError(502,code,'Não foi possível consultar o F-Insight.');
  }
  requiredPolicy(payload);
  return payload;
}

function cleanSymbols(value:unknown){
  const raw=Array.isArray(value)?value:String(value||'').split(',');
  return [...new Set(raw.map(item=>String(item||'').trim().toUpperCase()).filter(Boolean).map(item=>symbol.parse(item)))].slice(0,24);
}

export async function registerFInsightInvestmentRoutes(app:FastifyInstance){
  app.get('/v1/investments/health',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const cfg=bridgeConfig();
    if(!cfg.configured)return{configured:false,provider:'f-insight',externalEffect:false,policy:{recommendation:false,execution:false,ranking:false,buySellSignal:false,portfolioAdvice:false,advisorClientData:false}};
    const payload=await finsight(ctx.workspaceId,'/health');
    return{configured:true,provider:'f-insight',capabilities:payload.capabilities||[],calculators:payload.calculators||[],policy:payload.policy,externalEffect:false};
  });

  app.get('/v1/investments/radar',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const input=z.object({symbols:z.string().optional()}).parse(req.query||{});
    const symbols=cleanSymbols(input.symbols||'PETR4.SA,VALE3.SA,ITUB4.SA,WEGE3.SA,AAPL,MSFT,NVDA,BTC-USD,ETH-USD');
    const payload=await finsight(ctx.workspaceId,`/radar?symbols=${encodeURIComponent(symbols.join(','))}`);
    return{provider:'f-insight',source:payload.source||'unavailable',dataUpdatedAt:payload.dataUpdatedAt||null,dataAgeSeconds:payload.dataAgeSeconds??null,responseAt:payload.responseAt||null,data:Array.isArray(payload.data)?payload.data:[],policy:payload.policy,externalEffect:false};
  });

  app.get('/v1/investments/assets/:symbol',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const value=symbol.parse(String((req.params as any).symbol||''));
    const payload=await finsight(ctx.workspaceId,`/assets/${encodeURIComponent(value)}`);
    return{provider:'f-insight',source:payload.source||'unavailable',dataUpdatedAt:payload.dataUpdatedAt||null,dataAgeSeconds:payload.dataAgeSeconds??null,asset:payload.asset||null,policy:payload.policy,externalEffect:false};
  });

  app.get('/v1/investments/macro',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const payload=await finsight(ctx.workspaceId,'/macro');
    return{provider:'f-insight',source:payload.source||'unavailable',updatedAt:payload.updatedAt||null,degraded:Boolean(payload.degraded),indicators:Array.isArray(payload.indicators)?payload.indicators:[],observations:Array.isArray(payload.observations)?payload.observations:[],policy:payload.policy,externalEffect:false};
  });

  app.get('/v1/investments/news',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const input=z.object({limit:z.coerce.number().int().min(1).max(30).default(12),category:z.string().trim().max(40).default('all')}).parse(req.query||{});
    const payload=await finsight(ctx.workspaceId,`/news?limit=${input.limit}&category=${encodeURIComponent(input.category)}`);
    return{provider:'f-insight',source:payload.source||'unavailable',latestPublishedAt:payload.latestPublishedAt||null,responseAt:payload.responseAt||null,data:Array.isArray(payload.data)?payload.data:[],policy:payload.policy,externalEffect:false};
  });

  app.post('/v1/investments/calculate',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const input=calculation.parse(req.body||{});
    const payload=await finsight(ctx.workspaceId,'/calculate',{method:'POST',body:JSON.stringify(input)});
    return{provider:'f-insight',result:payload.result||null,methodology:payload.methodology||null,policy:payload.policy,externalEffect:false};
  });
}
