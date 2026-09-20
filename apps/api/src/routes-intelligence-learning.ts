import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';
import {requirePlatformAdmin} from './platform-admin.js';
import {applyLearningSuggestion,dismissLearningSuggestion,evaluateIntelligenceAction,generateLearningSuggestions,getLearningOverview,syncAndEvaluateIntelligenceActions} from './business-intelligence-learning.js';
import {readDailyIntelligenceEngineState,runDailyIntelligenceEngine} from './business-intelligence-daily-engine.js';

const uuid=z.string().uuid();

export async function registerIntelligenceLearningRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/actions',async req=>{
    const ctx=await workspaceContext(req,'agenda.read');await syncAndEvaluateIntelligenceActions(ctx.workspaceId,false);
    return query<any>(`select a.id,a.signal_id,a.rule_id,a.task_id,a.title,a.status,a.metric_key,a.baseline_value,a.desired_direction,a.completed_at,a.evaluation_due_at,a.evaluated_at,a.evaluation_status,a.observed_value,a.effect_delta,a.effect_pct,a.effect_summary,a.created_at,t.status task_status,t.due_at,r.code rule_code,r.version rule_version
      from intelligence_actions a left join tasks t on t.id=a.task_id left join intelligence_rules r on r.id=a.rule_id where a.workspace_id=$1 order by a.created_at desc limit 50`,[ctx.workspaceId]);
  });

  app.get('/v1/admin/intelligence/learning',async req=>{await requirePlatformAdmin(req);return getLearningOverview()});
  app.post('/v1/admin/intelligence/learning/refresh',async req=>{
    await requirePlatformAdmin(req);const sync=await syncAndEvaluateIntelligenceActions(undefined,false);const suggestions=await generateLearningSuggestions();const overview=await getLearningOverview();return{sync,suggestions,overview};
  });
  app.get('/v1/admin/intelligence/learning/daily',async req=>{await requirePlatformAdmin(req);return readDailyIntelligenceEngineState()});
  app.post('/v1/admin/intelligence/learning/daily/run',async req=>{await requirePlatformAdmin(req);return runDailyIntelligenceEngine(true)});
  app.post('/v1/admin/intelligence/learning/actions/:id/evaluate',async req=>{
    await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const action=await evaluateIntelligenceAction(id,true);if(!action)throw new ApiError(404,'not_found','Ação de inteligência não encontrada.');return action;
  });
  app.post('/v1/admin/intelligence/learning/suggestions/:id/apply',async req=>{
    const user=await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const result=await applyLearningSuggestion(id,user.id);if(!result)throw new ApiError(404,'not_found','Sugestão não encontrada ou já revisada.');return result;
  });
  app.post('/v1/admin/intelligence/learning/suggestions/:id/dismiss',async req=>{
    const user=await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const result=await dismissLearningSuggestion(id,user.id);if(!result)throw new ApiError(404,'not_found','Sugestão não encontrada ou já revisada.');return result;
  });
}
