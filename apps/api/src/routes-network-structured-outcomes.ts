import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const outcomeType=z.enum(['revenue','cost','time','process','compliance','risk','customer_experience','other']);
const measurementStatus=z.enum(['measured','observed','not_measured']);
const impactTag=z.enum(['revenue_enablement','cost_reduction','time_saved','process_clarity','compliance_improvement','risk_reduction','customer_experience','other']);
const privateMetricValue=z.union([z.string().trim().max(200),z.number().finite(),z.boolean(),z.null()]);
const structuredOutcomeInput=z.object({
  summary:z.string().trim().min(5).max(2000),
  outcomeType,
  measurementStatus,
  impactTags:z.array(impactTag).max(6).default([]),
  privateMetrics:z.record(z.string().trim().min(1).max(60),privateMetricValue).default({})
});
const minimumPublicSample=3;

const publicMethodology={
  version:'structured-outcomes-v1',
  ranking:false,
  score:false,
  rating:false,
  publicMetricValues:false,
  minimumCategorySample:minimumPublicSample,
  minimumDetailSample:minimumPublicSample,
  note:'Outcomes estruturados organizam evidência de trabalho. Não são avaliação, nota ou garantia de qualidade. Características detalhadas só aparecem publicamente com pelo menos três registros para reduzir risco de reidentificação.'
} as const;

export async function registerNetworkStructuredOutcomeRoutes(app:FastifyInstance){
  app.post('/v1/network/requests/:id/structured-outcomes',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const requestId=uuid.parse((req.params as any).id),input=structuredOutcomeInput.parse(req.body||{});
    const request=(await query<any>(`select id,provider_workspace_id from provider_requests where id=$1 and requester_workspace_id=$2 and status='completed'`,[requestId,ctx.workspaceId]))[0];
    if(!request)throw new ApiError(409,'completed_request_required','Somente o workspace contratante pode registrar resultado estruturado de um serviço concluído.');
    const metrics={schemaVersion:'structured-outcomes-v1',outcomeType:input.outcomeType,measurementStatus:input.measurementStatus,impactTags:[...new Set(input.impactTags)],privateMetrics:input.privateMetrics};
    const rows=await query<any>(`insert into provider_outcomes(request_id,recorded_by_workspace_id,summary,metrics) values($1,$2,$3,$4) returning id,request_id,summary,metrics,verified_by_platform,created_at`,[requestId,ctx.workspaceId,input.summary,JSON.stringify(metrics)]);
    await auditLog(ctx,'network.outcome.structured_recorded','provider_outcome',rows[0].id,null,{requestId,providerWorkspaceId:request.provider_workspace_id,outcomeType:input.outcomeType,measurementStatus:input.measurementStatus,impactTagCount:metrics.impactTags.length,privateMetricCount:Object.keys(input.privateMetrics).length,privateMetricValuesLogged:false,summaryLogged:false,externalEffect:false});
    return {outcome:rows[0],privacy:{summaryPublic:false,privateMetricsPublic:false,clientIdentityPublic:false},externalEffect:false};
  });

  app.get('/v1/network/requests/:id/structured-outcomes',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const requestId=uuid.parse((req.params as any).id);
    const request=(await query<any>(`select id from provider_requests where id=$1 and requester_workspace_id=$2`,[requestId,ctx.workspaceId]))[0];
    if(!request)throw new ApiError(404,'request_not_found','Trabalho não encontrado neste workspace contratante.');
    const outcomes=await query<any>(`select id,request_id,summary,metrics,verified_by_platform,created_at from provider_outcomes where request_id=$1 and recorded_by_workspace_id=$2 order by created_at desc`,[requestId,ctx.workspaceId]);
    return {outcomes,privacy:{requesterOnly:true,public:false}};
  });

  app.get('/v1/network/outcomes/evidence',async req=>{
    await workspaceContext(req,'workspace.read');
    const rows=await query<any>(`select r.provider_workspace_id,
      count(*) filter(where o.metrics->>'schemaVersion'='structured-outcomes-v1')::int structured_count,
      count(*) filter(where o.metrics->>'schemaVersion'='structured-outcomes-v1' and o.metrics->>'measurementStatus'='measured')::int measured_count,
      count(*) filter(where o.metrics->>'schemaVersion'='structured-outcomes-v1' and o.metrics->>'measurementStatus'='observed')::int observed_count
      from provider_outcomes o join provider_requests r on r.id=o.request_id
      join provider_profiles p on p.workspace_id=r.provider_workspace_id
      join workspaces w on w.id=r.provider_workspace_id
      where p.status='published' and w.status='active'
      group by r.provider_workspace_id`);
    const categories=await query<any>(`select r.provider_workspace_id,o.metrics->>'outcomeType' outcome_type,count(*)::int count
      from provider_outcomes o join provider_requests r on r.id=o.request_id
      join provider_profiles p on p.workspace_id=r.provider_workspace_id
      join workspaces w on w.id=r.provider_workspace_id
      where p.status='published' and w.status='active' and o.metrics->>'schemaVersion'='structured-outcomes-v1'
      group by r.provider_workspace_id,o.metrics->>'outcomeType'
      having count(*)>=${minimumPublicSample}`);
    const byProvider=new Map<string,Array<{key:string;count:number}>>();
    for(const row of categories){const id=String(row.provider_workspace_id),list=byProvider.get(id)||[];list.push({key:String(row.outcome_type),count:Number(row.count||0)});byProvider.set(id,list);}
    return {providers:rows.map(row=>{const structuredCount=Number(row.structured_count||0),detailVisible=structuredCount>=minimumPublicSample;return {workspaceId:String(row.provider_workspace_id),structuredCount,measuredCount:detailVisible?Number(row.measured_count||0):null,observedCount:detailVisible?Number(row.observed_count||0):null,categories:detailVisible?(byProvider.get(String(row.provider_workspace_id))||[]):[]};}),methodology:publicMethodology,privacy:{summaryExposed:false,privateMetricValuesExposed:false,clientIdentityExposed:false,requestIdentityExposed:false,smallDetailSamplesSuppressed:true}};
  });
}
