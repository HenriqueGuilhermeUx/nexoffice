import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {buildBusinessGraph} from './business-graph.js';
import {query} from './db.js';

const querySchema=z.object({
  days:z.coerce.number().int().min(7).max(365).default(90),
  includeGraph:z.enum(['true','false']).default('false')
});

export async function registerBusinessGraphRoutes(app:FastifyInstance){
  app.get('/v1/business-graph/sources',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const [integrations,signals,counts]=await Promise.all([
      query<any>(`select provider,status,capabilities,connected_at,last_health_status,updated_at from integrations where workspace_id=$1 order by provider`,[ctx.workspaceId]),
      query<any>(`select source_product,count(*)::int signals,max(period_end) last_signal_at from workspace_operational_signals where workspace_id=$1 group by source_product order by source_product`,[ctx.workspaceId]),
      query<any>(`select
        (select count(*) from crm_contacts where workspace_id=$1)::int crm_contacts,
        (select count(*) from crm_deals where workspace_id=$1)::int crm_deals,
        (select count(*) from ledger_entries where workspace_id=$1)::int ledger_entries,
        (select count(*) from tasks where workspace_id=$1)::int tasks,
        (select count(*) from appointments where workspace_id=$1)::int appointments,
        (select count(*) from document_refs where workspace_id=$1)::int documents,
        (select count(*) from business_events where workspace_id=$1)::int events`,[ctx.workspaceId])
    ]);
    const native=counts[0]||{};
    return{
      workspace:{id:ctx.workspaceId,name:ctx.workspaceName},
      native:[
        {source:'nexoffice.crm',kind:'crm',records:Number(native.crm_contacts||0)+Number(native.crm_deals||0),connected:true},
        {source:'nexoffice.finance',kind:'financial',records:Number(native.ledger_entries||0),connected:true},
        {source:'nexoffice.tasks',kind:'operations',records:Number(native.tasks||0),connected:true},
        {source:'nexoffice.agenda',kind:'calendar',records:Number(native.appointments||0),connected:true},
        {source:'nexoffice.documents',kind:'documents',records:Number(native.documents||0),connected:true},
        {source:'nexoffice.events',kind:'events',records:Number(native.events||0),connected:true}
      ],
      integrations:integrations.map(row=>({provider:row.provider,status:row.status,capabilities:Array.isArray(row.capabilities)?row.capabilities:[],connectedAt:row.connected_at||null,lastHealthStatus:row.last_health_status||null,updatedAt:row.updated_at||null})),
      alternativeVentures:signals.map(row=>({sourceProduct:row.source_product,signals:Number(row.signals||0),lastSignalAt:row.last_signal_at||null,privacy:'aggregate_only'})),
      connectorContract:{version:'nex-connect-v1',normalizesTo:'Nex Business Graph',supports:['open_finance','erp','crm','email','calendar','documents','spreadsheet','messaging','commerce','custom']},
      safety:{workspaceScoped:true,secretsReturned:false,externalEffects:false}
    };
  });

  app.get('/v1/business-graph/overview',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const input=querySchema.parse(req.query||{});
    const graph=await buildBusinessGraph(ctx.workspaceId,ctx.workspaceName,input.days);
    const connections=graph.edges.reduce<Record<string,number>>((acc,edge)=>{
      acc[edge.kind]=(acc[edge.kind]||0)+1;
      return acc;
    },{});

    const response={
      workspace:{id:graph.workspaceId,name:graph.workspaceName},
      coverage:graph.coverage,
      executiveSignals:graph.executiveSignals,
      relationships:connections,
      sample:{
        nodes:graph.nodes.slice(0,24),
        edges:graph.edges.slice(0,36)
      },
      safety:graph.safety
    };
    if(input.includeGraph==='true')return{...response,graph:{nodes:graph.nodes,edges:graph.edges}};
    return response;
  });
}
