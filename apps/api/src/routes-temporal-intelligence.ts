import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {requirePlatformAdmin} from './platform-admin.js';
import {buildTemporalRisk,listSectorOntologies,readBusinessTrajectory,readInternalRiskDetail} from './business-temporal-risk.js';

const uuid=z.string().uuid();
const ontologyUpdate=z.object({
  active:z.boolean().optional(),maturity:z.enum(['initial','observed','validated']).optional(),operationalAsset:z.string().trim().min(3).max(500).optional(),failureMode:z.string().trim().min(3).max(800).optional(),
  anticipationMinDays:z.number().int().min(0).max(3650).nullable().optional(),anticipationMaxDays:z.number().int().min(0).max(3650).nullable().optional(),leadingSignals:z.array(z.record(z.string(),z.unknown())).optional(),mitigatingActions:z.array(z.string().trim().min(2).max(500)).optional(),description:z.string().trim().max(1500).nullable().optional()
});

export async function registerTemporalIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/trajectory',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');let result=await readBusinessTrajectory(ctx.workspaceId);if(!result.available){await buildTemporalRisk(ctx.workspaceId);result=await readBusinessTrajectory(ctx.workspaceId)}return result;
  });
  app.post('/v1/intelligence/trajectory/refresh',async req=>{const ctx=await workspaceContext(req,'workspace.read');await buildTemporalRisk(ctx.workspaceId);return readBusinessTrajectory(ctx.workspaceId)});

  app.get('/v1/admin/intelligence/trajectory',async req=>{
    await requirePlatformAdmin(req);
    const [summary,companies,signals,sectors]=await Promise.all([
      query<any>(`select count(*)::int companies,count(*) filter(where posture='normal')::int normal,count(*) filter(where posture='attention')::int attention,count(*) filter(where posture='elevated')::int elevated,count(*) filter(where trend='worsening')::int worsening,round(avg(operational_stress_index),1) average_stress,round(avg(confidence),3) average_confidence from (select distinct on(workspace_id) * from intelligence_risk_snapshots order by workspace_id,run_date desc) x`),
      query<any>(`select w.id,w.name,coalesce(p.sector,w.vertical::text,'general') sector,r.operational_stress_index,r.posture,r.trend,r.confidence,r.run_date,(select count(*) from intelligence_temporal_signals s where s.workspace_id=w.id and s.active=true)::int active_signals from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select * from intelligence_risk_snapshots x where x.workspace_id=w.id order by run_date desc limit 1) r on true where w.status<>'cancelled' order by case r.posture when 'elevated' then 1 when 'attention' then 2 when 'normal' then 3 else 4 end,r.operational_stress_index desc nulls last,w.name`),
      query<any>(`select code,title,severity,count(*)::int occurrences,round(avg(confidence),3) confidence,round(avg(horizon_days),1) horizon_days from intelligence_temporal_signals where run_date>=current_date-30 group by code,title,severity order by occurrences desc,severity desc limit 100`),
      query<any>(`select sector,count(*)::int companies,round(avg(operational_stress_index),1) average_stress,count(*) filter(where posture='elevated')::int elevated,count(*) filter(where trend='worsening')::int worsening from (select distinct on(workspace_id) workspace_id,sector,operational_stress_index,posture,trend from intelligence_risk_snapshots order by workspace_id,run_date desc) x group by sector order by companies desc,sector`)
    ]);
    return{summary:summary[0]||{},companies,signals,sectors};
  });
  app.get('/v1/admin/intelligence/companies/:id/trajectory',async req=>{await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const exists=(await query<any>(`select 1 from workspaces where id=$1`,[id]))[0];if(!exists)throw new ApiError(404,'not_found','Empresa não encontrada.');return readInternalRiskDetail(id)});
  app.post('/v1/admin/intelligence/companies/:id/trajectory/refresh',async req=>{await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);await buildTemporalRisk(id);return readInternalRiskDetail(id)});
  app.get('/v1/admin/intelligence/ontologies',async req=>{await requirePlatformAdmin(req);return listSectorOntologies()});
  app.patch('/v1/admin/intelligence/ontologies/:id',async req=>{
    const user=await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const input=ontologyUpdate.parse(req.body||{});const current=(await query<any>(`select * from sector_ontologies where id=$1`,[id]))[0];if(!current)throw new ApiError(404,'not_found','Ontologia não encontrada.');
    const nextVersion=Number(current.version)+1;const min=input.anticipationMinDays===undefined?current.anticipation_min_days:input.anticipationMinDays;const max=input.anticipationMaxDays===undefined?current.anticipation_max_days:input.anticipationMaxDays;if(min!==null&&max!==null&&Number(max)<Number(min))throw new ApiError(400,'invalid_window','A janela máxima precisa ser maior ou igual à mínima.');
    await query(`update sector_ontologies set active=false,updated_at=now() where id=$1`,[id]);
    return (await query<any>(`insert into sector_ontologies(sector,archetype,version,active,maturity,operational_asset,failure_mode,anticipation_min_days,anticipation_max_days,leading_signals,mitigating_actions,description,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,[current.sector,current.archetype,nextVersion,input.active??true,input.maturity??current.maturity,input.operationalAsset??current.operational_asset,input.failureMode??current.failure_mode,min,max,JSON.stringify(input.leadingSignals??current.leading_signals),JSON.stringify(input.mitigatingActions??current.mitigating_actions),input.description===undefined?current.description:input.description,user.email]))[0];
  });
}
