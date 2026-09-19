import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError} from './auth.js';
import {query} from './db.js';
import {requirePlatformAdmin} from './platform-admin.js';
import {buildBusinessIntelligence,businessIntelligenceHistory,getBusinessProfile,recordIntelligenceMetric,upsertBusinessProfile} from './business-intelligence.js';

const uuid=z.string().uuid();
const ruleUpdate=z.object({active:z.boolean().optional(),warningValue:z.number().nullable().optional(),criticalValue:z.number().nullable().optional(),weight:z.number().min(0).max(20).optional(),title:z.string().trim().min(2).max(200).optional(),messageTemplate:z.string().trim().min(2).max(1000).optional(),recommendation:z.string().trim().max(1500).nullable().optional()});
const profileSchema=z.object({sector:z.string().trim().min(2).max(80).optional(),subsector:z.string().trim().max(120).nullable().optional(),revenueModel:z.string().trim().max(80).optional(),sellsProducts:z.boolean().optional(),sellsServices:z.boolean().optional(),recurringRevenue:z.boolean().optional(),usesAgenda:z.boolean().optional(),usesInventory:z.boolean().optional(),usesContracts:z.boolean().optional(),employeeCount:z.number().int().min(0).max(100000).nullable().optional(),activeCustomersEstimate:z.number().int().min(0).max(100000000).nullable().optional(),primarySalesChannel:z.string().trim().max(120).nullable().optional(),seasonality:z.string().trim().max(300).nullable().optional(),mainDependency:z.string().trim().max(300).nullable().optional(),notes:z.string().trim().max(2000).nullable().optional()});
const metricSchema=z.object({metricKey:z.string().trim().regex(/^[a-z0-9_.-]{2,120}$/),valueNumeric:z.number().finite().nullable().optional(),valueText:z.string().trim().max(500).nullable().optional(),unit:z.string().trim().max(40).nullable().optional(),source:z.enum(['verified_transaction','integrated_system','imported_document','client_reported','derived']).default('client_reported'),sourceReference:z.string().trim().max(300).nullable().optional(),quality:z.enum(['verified','high','medium','estimated']).default('estimated'),confidence:z.number().min(0).max(1).optional(),periodStart:z.string().datetime().nullable().optional(),periodEnd:z.string().datetime().nullable().optional(),observedAt:z.string().datetime().optional(),metadata:z.record(z.string(),z.unknown()).optional()});
const outcomeReview=z.object({verdict:z.enum(['confirmed','partial','not_confirmed','unknown']),impactScore:z.number().int().min(-100).max(100).nullable().optional()});

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
    const company=(await query<any>(`select id,name,slug,vertical::text vertical,plan,status,created_at,updated_at from workspaces where id=$1`,[workspaceId]))[0];if(!company)throw new ApiError(404,'not_found','Empresa não encontrada.');
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
  app.patch('/v1/admin/intelligence/outcomes/:id/review',async req=>{const user=await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const input=outcomeReview.parse(req.body||{});const updated=(await query<any>(`update intelligence_outcomes set verdict=$2,impact_score=$3,reviewed_at=now(),reviewed_by=$4 where id=$1 returning *`,[id,input.verdict,input.impactScore??null,user.id]))[0];if(!updated)throw new ApiError(404,'not_found','Resultado não encontrado.');return updated});

  app.get('/v1/admin/intelligence/sectors',async req=>{await requirePlatformAdmin(req);return query<any>(`select coalesce(p.sector,w.vertical::text,'general') sector,coalesce(p.subsector,'') subsector,count(*)::int companies,round(avg(s.overall_score),1) average_score,round(avg(s.knowledge_pct),1) average_knowledge,count(*) filter(where s.status='critical')::int critical,count(*) filter(where s.status='attention')::int attention from workspaces w left join business_profiles p on p.workspace_id=w.id left join lateral(select overall_score,knowledge_pct,status from intelligence_snapshots x where x.workspace_id=w.id order by as_of desc limit 1) s on true where w.status<>'cancelled' group by 1,2 order by 1,2`)});

  app.get('/v1/admin/intelligence/lab',async req=>{
    await requirePlatformAdmin(req);
    const [summary,rules,sectors,recentOutcomes,pendingSignals]=await Promise.all([
      query<any>(`select
        (select count(*) from intelligence_signals where created_at>=now()-interval '90 days')::int signals_90,
        (select count(*) from intelligence_outcomes where occurred_at>=now()-interval '90 days')::int outcomes_90,
        (select count(*) from intelligence_outcomes where occurred_at>=now()-interval '90 days' and verdict in ('confirmed','partial','not_confirmed'))::int reviewed_90,
        (select count(*) from intelligence_outcomes where occurred_at>=now()-interval '90 days' and verdict='confirmed')::int confirmed_90,
        (select count(*) from intelligence_outcomes where occurred_at>=now()-interval '90 days' and verdict='partial')::int partial_90,
        (select count(*) from intelligence_outcomes where occurred_at>=now()-interval '90 days' and verdict='not_confirmed')::int not_confirmed_90,
        (select round(avg(extract(epoch from(o.occurred_at-s.created_at))/86400.0),1) from intelligence_outcomes o join intelligence_signals s on s.id=o.signal_id where o.occurred_at>=now()-interval '90 days' and o.occurred_at>=s.created_at) avg_lead_days`),
      query<any>(`select r.id,r.code,r.version,r.sector,r.dimension,r.title,r.active,
        count(distinct s.id) filter(where s.created_at>=now()-interval '90 days')::int fired_90,
        count(distinct o.id) filter(where o.occurred_at>=now()-interval '90 days' and o.verdict in ('confirmed','partial','not_confirmed'))::int reviewed_90,
        count(distinct o.id) filter(where o.occurred_at>=now()-interval '90 days' and o.verdict='confirmed')::int confirmed_90,
        count(distinct o.id) filter(where o.occurred_at>=now()-interval '90 days' and o.verdict='partial')::int partial_90,
        count(distinct o.id) filter(where o.occurred_at>=now()-interval '90 days' and o.verdict='not_confirmed')::int not_confirmed_90,
        round(avg(extract(epoch from(o.occurred_at-s.created_at))/86400.0) filter(where o.occurred_at>=s.created_at),1) avg_lead_days
        from intelligence_rules r left join intelligence_signals s on s.rule_id=r.id left join intelligence_outcomes o on o.signal_id=s.id group by r.id order by fired_90 desc,r.code,r.version desc limit 200`),
      query<any>(`select coalesce(p.sector,w.vertical::text,'general') sector,count(distinct w.id)::int companies,
        count(distinct s.id) filter(where s.created_at>=now()-interval '90 days')::int signals_90,
        count(distinct o.id) filter(where o.occurred_at>=now()-interval '90 days')::int outcomes_90,
        count(distinct o.id) filter(where o.verdict='confirmed' and o.occurred_at>=now()-interval '90 days')::int confirmed_90,
        count(distinct o.id) filter(where o.verdict='not_confirmed' and o.occurred_at>=now()-interval '90 days')::int not_confirmed_90
        from workspaces w left join business_profiles p on p.workspace_id=w.id left join intelligence_signals s on s.workspace_id=w.id left join intelligence_outcomes o on o.workspace_id=w.id and o.signal_id=s.id where w.status<>'cancelled' group by 1 order by companies desc`),
      query<any>(`select o.id,o.workspace_id,w.name company,o.signal_id,o.outcome_type,o.verdict,o.impact_score,o.occurred_at,o.reviewed_at,o.notes,s.title signal_title,s.code signal_code,r.code rule_code,r.version rule_version from intelligence_outcomes o join workspaces w on w.id=o.workspace_id left join intelligence_signals s on s.id=o.signal_id left join intelligence_rules r on r.id=s.rule_id order by o.occurred_at desc limit 100`),
      query<any>(`select s.id signal_id,s.workspace_id,w.name company,s.snapshot_id,s.code,s.severity,s.title,s.message,s.recommendation,s.created_at,r.code rule_code,r.version rule_version from intelligence_signals s join workspaces w on w.id=s.workspace_id left join intelligence_rules r on r.id=s.rule_id where s.created_at<=now()-interval '7 days' and not exists(select 1 from intelligence_outcomes o where o.signal_id=s.id) order by case s.severity when 'critical' then 1 when 'attention' then 2 else 3 end,s.created_at desc limit 100`)
    ]);
    const base=summary[0]||{};const reviewed=Number(base.reviewed_90||0),confirmed=Number(base.confirmed_90||0),partial=Number(base.partial_90||0);
    return{summary:{...base,confirmation_rate_pct:reviewed?Math.round((confirmed+partial*.5)/reviewed*1000)/10:null,validation_coverage_pct:Number(base.signals_90||0)?Math.round(Number(base.outcomes_90||0)/Number(base.signals_90||1)*1000)/10:0},rules,sectors,recentOutcomes,pendingSignals};
  });

  app.get('/v1/admin/intelligence/rules',async req=>{await requirePlatformAdmin(req);return query<any>(`select * from intelligence_rules order by sector,dimension,code,version desc`)});
  app.patch('/v1/admin/intelligence/rules/:id',async req=>{
    await requirePlatformAdmin(req);const id=uuid.parse((req.params as any).id);const input=ruleUpdate.parse(req.body||{});const before=(await query<any>(`select * from intelligence_rules where id=$1`,[id]))[0];if(!before)throw new ApiError(404,'not_found','Regra não encontrada.');
    const next={active:input.active??true,warning:Object.prototype.hasOwnProperty.call(input,'warningValue')?input.warningValue:before.warning_value,critical:Object.prototype.hasOwnProperty.call(input,'criticalValue')?input.criticalValue:before.critical_value,weight:input.weight??before.weight,title:input.title??before.title,message:input.messageTemplate??before.message_template,recommendation:Object.prototype.hasOwnProperty.call(input,'recommendation')?input.recommendation:before.recommendation};
    return (await query<any>(`with source as(select * from intelligence_rules where id=$1), deactivated as(update intelligence_rules set active=false,updated_at=now() where code=(select code from source) and active=true returning id)
      insert into intelligence_rules(code,version,active,sector,subsector,dimension,metric_key,operator,warning_value,critical_value,weight,title,message_template,recommendation,config,created_by)
      select s.code,(select coalesce(max(r.version),0)+1 from intelligence_rules r where r.code=s.code),$2,s.sector,s.subsector,s.dimension,s.metric_key,s.operator,$3,$4,$5,$6,$7,$8,s.config,'admin' from source s returning *`,[id,next.active,next.warning,next.critical,next.weight,next.title,next.message,next.recommendation]))[0];
  });
}
