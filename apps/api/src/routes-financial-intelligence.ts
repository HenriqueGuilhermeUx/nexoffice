import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {buildFinancialIntelligence,readFinancialIntelligence,simulateFromMetrics} from './financial-intelligence.js';

const uuid=z.string().uuid();

export async function registerFinancialIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/finance/intelligence',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const current=await readFinancialIntelligence(ctx.workspaceId);
    return current||buildFinancialIntelligence(ctx.workspaceId);
  });

  app.post('/v1/finance/intelligence/refresh',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const result=await buildFinancialIntelligence(ctx.workspaceId);
    await auditLog(ctx,'finance.intelligence.refreshed','workspace',ctx.workspaceId,null,{snapshotId:result?.snapshot?.id,signals:result?.signals?.length||0,recommendations:result?.recommendations?.length||0},{externalEffect:false});
    return result;
  });

  app.post('/v1/finance/intelligence/simulate',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const input=z.object({revenueChangePct:z.number().min(-100).max(500).default(0),expenseChangePct:z.number().min(-100).max(500).default(0),oneOffInflowMinor:z.number().int().min(0).default(0),oneOffOutflowMinor:z.number().int().min(0).default(0)}).parse(req.body||{});
    let current=await readFinancialIntelligence(ctx.workspaceId);
    if(!current)current=await buildFinancialIntelligence(ctx.workspaceId);
    if(!current)throw new ApiError(500,'finance_snapshot_failed','Não foi possível gerar a visão financeira.');
    return simulateFromMetrics(current.metrics,input);
  });

  app.post('/v1/finance/recommendations/:id/decision',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const input=z.object({decision:z.enum(['accepted','dismissed']),note:z.string().trim().max(2000).optional(),expected:z.record(z.string(),z.unknown()).default({})}).parse(req.body);
    const recommendation=(await query<any>(`select * from finance_recommendations where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!recommendation)throw new ApiError(404,'not_found','Recomendação não encontrada.');
    await query(`update finance_recommendations set status=$3,updated_at=now() where id=$1 and workspace_id=$2`,[id,ctx.workspaceId,input.decision]);
    const decision=(await query<any>(`insert into finance_decisions(workspace_id,recommendation_id,title,decision,expected) values($1,$2,$3,$4,$5) returning *`,[ctx.workspaceId,id,recommendation.title,input.note||input.decision,JSON.stringify(input.expected)]))[0];
    await auditLog(ctx,'finance.recommendation.decided','finance_recommendation',id,recommendation,{status:input.decision,decisionId:decision.id},{externalEffect:false});
    return decision;
  });

  app.patch('/v1/finance/decisions/:id/outcome',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const input=z.object({outcome:z.record(z.string(),z.unknown()),note:z.string().trim().max(2000).optional()}).parse(req.body);
    const before=(await query<any>(`select * from finance_decisions where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'not_found','Decisão não encontrada.');
    const outcome={...(input.outcome||{}),note:input.note||undefined};
    const updated=(await query<any>(`update finance_decisions set outcome=$3,reviewed_at=now(),updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,JSON.stringify(outcome)]))[0];
    if(updated.recommendation_id)await query(`update finance_recommendations set status='completed',updated_at=now() where id=$1 and workspace_id=$2`,[updated.recommendation_id,ctx.workspaceId]);
    await auditLog(ctx,'finance.decision.outcome_recorded','finance_decision',id,before,updated,{externalEffect:false});
    return updated;
  });

  app.get('/v1/finance/intelligence/history',async req=>{
    const ctx=await workspaceContext(req,'finance.read'),limit=Math.min(90,Math.max(1,Number((req.query as any)?.limit||30)));
    return query<any>(`select id,as_of,window_days,metrics,sources from finance_snapshots where workspace_id=$1 order by as_of desc limit $2`,[ctx.workspaceId,limit]);
  });
}
