import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {meteringCatalog} from './usage-meter.js';

const RangeQuery=z.object({days:z.coerce.number().int().min(1).max(366).default(30)}).strict();
const EventsQuery=z.object({days:z.coerce.number().int().min(1).max(366).default(30),limit:z.coerce.number().int().min(1).max(500).default(100)}).strict();

export async function registerUsageRoutes(app:FastifyInstance){
  app.get('/v1/usage/summary',async req=>{
    const ctx=await workspaceContext(req,'usage.read');
    const {days}=RangeQuery.parse(req.query);
    const [totals,providers,capabilities,daily,workspace]=await Promise.all([
      query<any>(`select count(*)::int events,coalesce(sum(units),0)::numeric units,coalesce(sum(cost_minor_estimate) filter(where cost_minor_estimate is not null),0)::bigint known_cost_minor,count(*) filter(where cost_minor_estimate is null)::int unknown_cost_events,min(occurred_at) first_event_at,max(occurred_at) last_event_at from usage_events where workspace_id=$1 and occurred_at>=now()-($2::text||' days')::interval`,[ctx.workspaceId,String(days)]),
      query<any>(`select coalesce(provider,'core') provider,count(*)::int events,coalesce(sum(units),0)::numeric units,coalesce(sum(cost_minor_estimate) filter(where cost_minor_estimate is not null),0)::bigint known_cost_minor,count(*) filter(where cost_minor_estimate is null)::int unknown_cost_events from usage_events where workspace_id=$1 and occurred_at>=now()-($2::text||' days')::interval group by coalesce(provider,'core') order by known_cost_minor desc,events desc`,[ctx.workspaceId,String(days)]),
      query<any>(`select capability,operation,coalesce(provider,'core') provider,count(*)::int events,coalesce(sum(units),0)::numeric units,coalesce(sum(cost_minor_estimate) filter(where cost_minor_estimate is not null),0)::bigint known_cost_minor,count(*) filter(where cost_minor_estimate is null)::int unknown_cost_events from usage_events where workspace_id=$1 and occurred_at>=now()-($2::text||' days')::interval group by capability,operation,coalesce(provider,'core') order by known_cost_minor desc,events desc`,[ctx.workspaceId,String(days)]),
      query<any>(`select date_trunc('day',occurred_at)::date day,count(*)::int events,coalesce(sum(units),0)::numeric units,coalesce(sum(cost_minor_estimate) filter(where cost_minor_estimate is not null),0)::bigint known_cost_minor,count(*) filter(where cost_minor_estimate is null)::int unknown_cost_events from usage_events where workspace_id=$1 and occurred_at>=now()-($2::text||' days')::interval group by 1 order by 1`,[ctx.workspaceId,String(days)]),
      query<any>(`select plan,status,created_at from workspaces where id=$1 limit 1`,[ctx.workspaceId])
    ]);
    const total=totals[0]||{events:0,units:0,known_cost_minor:0,unknown_cost_events:0};
    const knownCost=Number(total.known_cost_minor||0),activeDays=Math.max(1,daily.length),avgKnownDaily=Math.round(knownCost/activeDays);
    const projection30=avgKnownDaily*30;
    const catalog=meteringCatalog();
    const configuredTopics=catalog.filter(item=>item.costMinorEstimate!==null).length;
    return {
      range:{days,from:new Date(Date.now()-days*86400000).toISOString(),to:new Date().toISOString()},
      workspace:{plan:workspace[0]?.plan||'starter',status:workspace[0]?.status||'trial'},
      totals:{events:Number(total.events||0),units:Number(total.units||0),knownCostMinor:knownCost,unknownCostEvents:Number(total.unknown_cost_events||0),firstEventAt:total.first_event_at||null,lastEventAt:total.last_event_at||null},
      economics:{currency:'BRL',activeUsageDays:activeDays,averageKnownCostPerActiveDayMinor:avgKnownDaily,projected30DayKnownCostMinor:projection30,projectionBasis:'known_cost_only',costCoverage:{configuredTopics,totalTopics:catalog.length,complete:configuredTopics===catalog.length},warning:Number(total.unknown_cost_events||0)>0?'A projeção não inclui eventos cujo custo unitário ainda não foi configurado.':null},
      providers:providers.map(normalizeRow),capabilities:capabilities.map(normalizeRow),daily:daily.map(row=>({...normalizeRow(row),day:String(row.day)})),meteringCatalog:catalog
    };
  });

  app.get('/v1/usage/events',async req=>{
    const ctx=await workspaceContext(req,'usage.read');
    const {days,limit}=EventsQuery.parse(req.query);
    return query<any>(`select id,capability,operation,units,unit_name,provider,cost_minor_estimate,currency,metadata,occurred_at from usage_events where workspace_id=$1 and occurred_at>=now()-($2::text||' days')::interval order by occurred_at desc limit $3`,[ctx.workspaceId,String(days),limit]);
  });
}

function normalizeRow(row:any){return {...row,events:Number(row.events||0),units:Number(row.units||0),known_cost_minor:Number(row.known_cost_minor||0),unknown_cost_events:Number(row.unknown_cost_events||0)}}
