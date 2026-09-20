import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {buildBusinessIntelligence,businessIntelligenceHistory,getBusinessProfile,readBusinessIntelligence,recordIntelligenceMetric,upsertBusinessProfile} from './business-intelligence.js';
import {buildBusinessRadar} from './business-intelligence-depth.js';
import {buildWeeklyIntelligence,intelligenceAdvisor} from './business-intelligence-weekly.js';
import {getAnonymousBusinessBenchmark} from './business-benchmark.js';
import {getBusinessKnowledge} from './business-knowledge.js';
import {registerIntelligenceLearningRoutes} from './routes-intelligence-learning.js';
import {registerFounderCockpitRoutes} from './routes-founder-cockpit.js';

const profileSchema=z.object({
  sector:z.string().trim().min(2).max(80).optional(),subsector:z.string().trim().max(120).nullable().optional(),revenueModel:z.string().trim().max(80).optional(),
  sellsProducts:z.boolean().optional(),sellsServices:z.boolean().optional(),recurringRevenue:z.boolean().optional(),usesAgenda:z.boolean().optional(),usesInventory:z.boolean().optional(),usesContracts:z.boolean().optional(),
  employeeCount:z.number().int().min(0).max(100000).nullable().optional(),activeCustomersEstimate:z.number().int().min(0).max(100000000).nullable().optional(),primarySalesChannel:z.string().trim().max(120).nullable().optional(),seasonality:z.string().trim().max(300).nullable().optional(),mainDependency:z.string().trim().max(300).nullable().optional(),notes:z.string().trim().max(2000).nullable().optional(),metadata:z.record(z.string(),z.unknown()).optional()
});
const metricSchema=z.object({metricKey:z.string().trim().regex(/^[a-z0-9_.-]{2,120}$/),valueNumeric:z.number().finite().nullable().optional(),valueText:z.string().trim().max(500).nullable().optional(),unit:z.string().trim().max(40).nullable().optional(),source:z.enum(['verified_transaction','integrated_system','imported_document','client_reported','derived']).default('client_reported'),sourceReference:z.string().trim().max(300).nullable().optional(),quality:z.enum(['verified','high','medium','estimated']).default('estimated'),confidence:z.number().min(0).max(1).optional(),periodStart:z.string().datetime().nullable().optional(),periodEnd:z.string().datetime().nullable().optional(),observedAt:z.string().datetime().optional(),metadata:z.record(z.string(),z.unknown()).optional()}).refine(v=>v.valueNumeric!==undefined||v.valueText!==undefined,{message:'Informe valueNumeric ou valueText.'});
const advisorSchema=z.object({mode:z.enum(['today','week']).default('today'),agentRole:z.enum(['secretary','service','crm','erp','collections','controller','documents','growth']).nullable().optional()});

export async function registerBusinessIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/profile',async req=>{const ctx=await workspaceContext(req,'workspace.read');return getBusinessProfile(ctx.workspaceId)});
  app.put('/v1/intelligence/profile',async req=>{const ctx=await workspaceContext(req,'workspace.read');const input=profileSchema.parse(req.body||{});const before=await getBusinessProfile(ctx.workspaceId);const updated=await upsertBusinessProfile(ctx.workspaceId,input);await auditLog(ctx,'intelligence.profile.updated','workspace',ctx.workspaceId,before,updated,{externalEffect:false});return updated});
  app.get('/v1/intelligence/health',async req=>{const ctx=await workspaceContext(req,'workspace.read');return (await readBusinessIntelligence(ctx.workspaceId))||buildBusinessIntelligence(ctx.workspaceId)});
  app.post('/v1/intelligence/health/refresh',async req=>{const ctx=await workspaceContext(req,'workspace.read');const result=await buildBusinessIntelligence(ctx.workspaceId);await auditLog(ctx,'intelligence.health.refreshed','workspace',ctx.workspaceId,null,{snapshotId:result?.snapshot?.id,score:result?.scores?.overall,knowledge:result?.knowledge?.percent},{externalEffect:false});return result});
  app.get('/v1/intelligence/knowledge',async req=>{const ctx=await workspaceContext(req,'workspace.read');return getBusinessKnowledge(ctx.workspaceId)});
  app.get('/v1/intelligence/history',async req=>{const ctx=await workspaceContext(req,'workspace.read');const limit=Math.min(365,Math.max(1,Number((req.query as any)?.limit||60)));return businessIntelligenceHistory(ctx.workspaceId,limit)});
  app.get('/v1/intelligence/radar',async req=>{const ctx=await workspaceContext(req,'workspace.read');return buildBusinessRadar(ctx.workspaceId)});
  app.get('/v1/intelligence/benchmark',async req=>{const ctx=await workspaceContext(req,'workspace.read');return getAnonymousBusinessBenchmark(ctx.workspaceId)});
  app.get('/v1/intelligence/weekly',async req=>{const ctx=await workspaceContext(req,'workspace.read');return buildWeeklyIntelligence(ctx.workspaceId)});
  app.post('/v1/intelligence/advisor',async req=>{const ctx=await workspaceContext(req,'command.read');const input=advisorSchema.parse(req.body||{});return intelligenceAdvisor(ctx.workspaceId,input.mode,input.agentRole||null)});
  app.post('/v1/intelligence/actions/task',async req=>{
    const ctx=await workspaceContext(req,'agenda.write');const input=z.object({priorityIndex:z.number().int().min(0).max(2)}).parse(req.body||{});const radar=await buildBusinessRadar(ctx.workspaceId);const priority=(radar.priorities||[])[input.priorityIndex];if(!priority)throw new ApiError(404,'priority_not_found','Esta prioridade não está mais disponível no Radar. Atualize a leitura.');
    let signal:any=null;if(priority.signalId)signal=(await query<any>(`select * from intelligence_signals where id=$1 and workspace_id=$2`,[priority.signalId,ctx.workspaceId]))[0]||null;
    if(signal?.id){const existing=(await query<any>(`select a.* from intelligence_actions a left join tasks t on t.id=a.task_id where a.workspace_id=$1 and a.signal_id=$2 and coalesce(t.status,'todo') not in ('done','cancelled') order by a.created_at desc limit 1`,[ctx.workspaceId,signal.id]))[0];if(existing){const task=(await query<any>(`select * from tasks where id=$1 and workspace_id=$2`,[existing.task_id,ctx.workspaceId]))[0]||null;return{task,action:existing,existing:true}}}
    const severity=String(priority.severity||signal?.severity||'attention');const dueDays=severity==='critical'?2:5;const dueAt=new Date(Date.now()+dueDays*86400000).toISOString();
    const title=`Ação NexOffice · ${String(priority.title||'Prioridade').slice(0,180)}`;const description=`Motivo: ${String(priority.reason||signal?.message||'Prioridade identificada pelo Radar.')}\nPróximo passo: ${String(priority.action||signal?.recommendation||'Revise este ponto e registre o resultado.')}`;
    const task=(await query<any>(`insert into tasks(workspace_id,title,description,status,priority,assigned_to,due_at,metadata) values($1,$2,$3,'todo',$4,$5,$6,$7) returning *`,[ctx.workspaceId,title,description,severity==='critical'?'critical':'high',ctx.user.id,dueAt,JSON.stringify({origin:'nexoffice_intelligence',priorityIndex:input.priorityIndex,signalId:priority.signalId||null,dimension:priority.dimension||null})]))[0];
    const sourceType=priority.signalId?'signal':priority.source==='sector'?'sector':'radar';const action=(await query<any>(`insert into intelligence_actions(workspace_id,signal_id,task_id,source_type,source_key,title,created_by,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[ctx.workspaceId,priority.signalId||null,task.id,sourceType,String(priority.signalId||priority.title||''),title,ctx.user.id,JSON.stringify({reason:priority.reason||null,recommendation:priority.action||null,severity})]))[0];
    await auditLog(ctx,'intelligence.priority.task_created','task',task.id,null,{taskId:task.id,actionId:action.id,signalId:priority.signalId||null},{externalEffect:false});return{task,action,existing:false};
  });
  app.post('/v1/intelligence/metrics',async req=>{const ctx=await workspaceContext(req,'workspace.read');const input=metricSchema.parse(req.body||{});const metric=await recordIntelligenceMetric(ctx.workspaceId,input);await auditLog(ctx,'intelligence.metric.recorded','workspace',ctx.workspaceId,null,{metricKey:input.metricKey,source:input.source,quality:input.quality},{externalEffect:false});return metric});
  await registerIntelligenceLearningRoutes(app);
  await registerFounderCockpitRoutes(app);
}
