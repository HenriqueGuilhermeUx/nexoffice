import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {query} from './db.js';
import {requirePlatformAdmin} from './platform-admin.js';
import {buildBusinessIntelligence,businessIntelligenceHistory,getBusinessProfile,recordIntelligenceMetric,upsertBusinessProfile} from './business-intelligence.js';

const uuid=z.string().uuid();
const ruleUpdate=z.object({active:z.boolean().optional(),warningValue:z.number().nullable().optional(),criticalValue:z.number().nullable().optional(),weight:z.number().min(0).max(20).optional(),title:z.string().trim().min(2).max(200).optional(),messageTemplate:z.string().trim().min(2).max(1000).optional(),recommendation:z.string().trim().max(1500).nullable().optional()});
const profileSchema=z.object({sector:z.string().trim().min(2).max(80).optional(),subsector:z.string().trim().max(120).nullable().optional(),revenueModel:z.string().trim().max(80).optional(),sellsProducts:z.boolean().optional(),sellsServices:z.boolean().optional(),recurringRevenue:z.boolean().optional(),usesAgenda:z.boolean().optional(),usesInventory:z.boolean().optional(),usesContracts:z.boolean().optional(),employeeCount:z.number().int().min(0).max(100000).nullable().optional(),activeCustomersEstimate:z.number().int().min(0).max(100000000).nullable().optional(),primarySalesChannel:z.string().trim().max(120).nullable().optional(),seasonality:z.string().trim().max(300).nullable().optional(),mainDependency:z.string().trim().max(300).nullable().optional(),notes:z.string().trim().max(2000).nullable().optional()});
const metricSchema=z.object({metricKey:z.string().trim().regex(/^[a-z0-9_.-]{2,120}$/),valueNumeric:z.number().finite().nullable().optional(),valueText:z.string().trim().max(500).nullable().optional(),unit:z.string().trim().max(40).nullable().optional(),source:z.enum(['verified_transaction','integrated_system','imported_document','client_reported','derived']).default('client_reported'),sourceReference:z.string().trim().max(300).nullable().optional(),quality:z.enum(['verified','high','medium','estimated']).default('estimated'),confidence:z.number().min(0).max(1).optional(),periodStart:z.string().datetime().nullable().optional(),periodEnd:z.string().datetime().nullable().optional(),observedAt:z.string().datetime().optional(),metadata:z.record(z.string(),z.unknown()).optional()});

export async function registerAdminIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/admin/intelligence/me',async req=>{const user=await requirePlatformAdmin(req);return{ok:true,user:{id:user.id,name:user.name,email:user.email}}});

  app.get('/v1/admin/intelligence/summary',async req=>{
    await requirePlatformAdmin(req);
    const [totals,sectors,signals,trend]=await Promise.all([
      query<any>(`select count(*)::int companies,
        count(*) filter(where latest.status='healthy')::int healthy,
        count(*) filter(where latest.status='attention')::int attention,
        count(*) filter(where latest.status='critical')::int critical,
        count(*) filter(where latest.status='learning' or latest.status is null)::int learning,
        round(avg(latest.overall_score) filter(where latest.overall_score is not null),1) average_score,
        round(avg(latest.knowledge_pct) filter(where latest.knowledge_pct is not null),1) average_knowledge
        from workspaces w left join lateral(select status,overall_score,knowledge_pct from intelligence_snapshots s where s.workspace_id=w.id order by as_of desc limit 1) latest on true
        where w.status<>'cancelled'`),
      query<any>(`select coalesce(p.sector,w.vertical::text,'general') sector,count(*)::int companies,round(avg(s.overall_score),1) average_score,count(*) filter(where s.status='critical')::int critical,count(*) filter(where s.status='attention')::int attention
        from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select overall_score,status from intelligence_snapshots x where x.workspace_id=w.id order by as_of desc limit 1) s on true where w.status<>'cancelled' group by 1 order by count(*) desc`),
      query<any>(`select severity,count(*)::int count from intelligence_signals where active=true group by severity`),
      query<any>(`select date_trunc('day',as_of)::date day,round(avg(overall_score),1) score from intelligence_snapshots where as_of>=now()-interval '30 days' group by 1 order by 1`)
    ]);
    return{...(totals[0]||{}),sectors,activeSignals:Object.fromEntries(signals.map(x=>[x.severity,Number(x.count)])),trend};
  });

  app.get('/v1/admin/intelligence/companies',async req=>{
    await requirePlatformAdmin(req);const q=req.query as any;const sector=String(q?.sector||'').trim(),status=String(q?.status||'').trim(),search=String(q?.search||'').trim();
    return query<any>(`select w.id,w.name,w.slug,w.vertical::text vertical,w.plan,w.status workspace_status,w.created_at,p.sector,p.subsector,p.revenue_model,p.completeness_pct,
      s.id snapshot_id,s.as_of,s.overall_score,s.finance_score,s.sales_score,s.customer_score,s.operation_score,s.resilience_score,s.knowledge_pct,s.status,s.trend,s.summary,
      (select count(*) from intelligence_signals sg where sg.workspace_id=w.id and sg.active=true and sg.severity='critical')::int critical_signals,
      (select count(*) from intelligence_signals sg where sg.workspace_id=w.id and sg.active=true and sg.severity='attention')::int attention_signals
      from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select * from intelligence_snapshots x where x.workspace_id=w.id order by as_of desc limit 1) s on true
      where w.status<>'cancelled' and ($1='' or coalesce(p.sector,w.vertical::text)=$1) and ($2='' or coalesce(s.status,'learning')=$2) and ($3='' or lower(w.name) like '%'||lower($3)||'%') order by case coalesce(s.status,'learning') when 'critical' then 1 when 'attention' then 2 when 'learning' then 3 else 4 end,s.overall_score nulls first,w.name limit 1000`,[sector,status,search]);
  });

  app.get('/v1/admin/intelligence/companies/:id',async req=>{
    await requirePlatformAdmin(req);const workspaceId=uuid.parse((req.params as any).id);
    const company=(await query<any>(`select id,name,slug,vertical::text vertical,plan,status,created_at,updated_at from workspaces where id=$1`,[workspaceId]))[0];if(!company)return app.httpErrors?.notFound?.()||{error:'not_found'};
    const [profile,latest,history,signals,metrics,outcomes,members,usage]=await Promise.all([
      getBusinessProfile(workspaceId),
      query<any>(`select * from intelligence_snapshots where workspace_id=$1 order by as_of desc limit 1`,[workspaceId]),
      businessIntelligenceHistory(workspaceId,180),
      query<any>(`select * from intelligence_signals where workspace_id=$1 order by created_at desc limit 150`,[workspaceId]),
      query<any>(`select metric_key,value_numeric,value_text,unit,source,quality,confidence,observed_at from intelligence_metrics where workspace_id=$1 order by observed_at desc limit 300`,[workspaceId]),
      query<any>(`select * from intelligence_outcomes where workspace_id=$1 order by occurred_at desc limit 100`,[workspaceId]),
      query<any>(`select m.role,m.active,u.name,u.email from workspace_members m join users u on u.id=m.user_id where m.workspace_id=$1 order by m.created_at`,[workspaceId]),
      query<any>(`select capability,count(*)::int events,coalesce(sum(cost_minor_estimate),0)::bigint cost_minor from usage_events where workspace_id=$1 and occurred_at>=now()-interval '30 days' group by capability order by capability`,[workspaceId])
    ]);
    return{company,profile,latest:latest[0]||null,history,signals,metrics,outcomes,members,usage};
  });

  app.post('/v1/admin/intelligence/companies/:id/refresh',async req=>{await requirePlatformAdmin(req);const workspaceId=uuid.parse((req.params as any).id);return buildBusinessIntelligence(workspaceId)});
  app.put('/v1/admin/intelligence/companies/:id/profile',async req=>{await requirePlatformAdmin(req);const workspaceId=uuid.parse((req.params as any).id);return upsertBusinessProfile(workspaceId,profileSchema.parse(req.body||{}))});
  app.post('/v1/admin/intelligence/companies/:id/metrics',async req=>{await requirePlatformAdmin(req);const workspaceId=uuid.parse((req.params as any).id);return recordIntelligenceMetric(workspaceId,metricSchema.parse(req.body||{}))});
  app.post('/v1/admin/intelligence/companies/:id/outcomes',async req=>{const user=await requirePlatformAdmin(req);const workspaceId=uuid.parse((req.params as any).id);const input=z.object({snapshotId:z.string().uuid().nullable().optional(),signalId:z.string().uuid().nullable().optional(),outcomeType:z.string().trim().min(2).max(120),expected:z.record(z.string(),z.unknown()).default({}),observed:z.record(z.string(),z.unknown()).default({}),occurredAt:z.string().datetime().optional(),notes:z.string().trim().max(3000).nullable().optional()}).parse(req.body||{});return (await query<any>(`insert into intelligence_outcomes(workspace_id,snapshot_id,signal_id,outcome_type,expected,observed,occurred_at,notes,created_by) values($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz,now()),$8,$9) returning *`,[workspaceId,input.snapshotId||null,input.signalId||null,input.outcomeType,JSON.stringify(input.expected),JSON.stringify(input.observed),input.occurredAt||null,input.notes||null,user.id]))[0]});

  app.get('/v1/admin/intelligence/sectors',async req=>{await requirePlatformAdmin(req);return query<any>(`select coalesce(p.sector,w.vertical::text,'general') sector,coalesce(p.subsector,'') subsector,count(*)::int companies,round(avg(s.overall_score),1) average_score,round(avg(s.knowledge_pct),1) average_knowledge,count(*) filter(where s.status='critical')::int critical,count(*) filter(where s.status='attention')::int attention from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select overall_score,knowledge_pct,status from intelligence_snapshots x where x.workspace_id=w.id order by as_of desc limit 1) s on true where w.status<>'cancelled' group by 1,2 order by 1,2`)});
  app.get('/v1/admin/intelligence/rules',async req=>{await requirePlatformAdmin(req);return query<any>(`select * from intelligence_rules order by sector,dimension,code,version desc`)});
  app.patch('/v1/admin/intelligence/rules/:id',async req=>{await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const input=ruleUpdate.parse(req.body||{});const before=(await query<any>(`select * from intelligence_rules where id=$1`,[id]))[0];if(!before)return{error:'not_found'};return (await query<any>(`update intelligence_rules set active=coalesce($2,active),warning_value=case when $3::boolean then $4 else warning_value end,critical_value=case when $5::boolean then $6 else critical_value end,weight=coalesce($7,weight),title=coalesce($8,title),message_template=coalesce($9,message_template),recommendation=case when $10::boolean then $11 else recommendation end,updated_at=now() where id=$1 returning *`,[id,input.active??null,Object.prototype.hasOwnProperty.call(input,'warningValue'),input.warningValue??null,Object.prototype.hasOwnProperty.call(input,'criticalValue'),input.criticalValue??null,input.weight??null,input.title??null,input.messageTemplate??null,Object.prototype.hasOwnProperty.call(input,'recommendation'),input.recommendation??null]))[0]});
}
