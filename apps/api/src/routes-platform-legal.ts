import type {FastifyInstance,FastifyRequest} from 'fastify';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './auth.js';
import {query} from './db.js';
import {LegalOperationalSignal,LEGAL_SIGNAL_TYPES} from './legal-data-firewall.js';
import {syncOperationalActions} from './operational-action-engine.js';

function safeEqual(received:string,expected:string){
  if(!received||!expected)return false;
  const a=Buffer.from(received),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}

function authorize(req:FastifyRequest){
  const expected=String(process.env.NEXOFFICE_INTERNAL_KEY||'').trim();
  if(!expected)throw new ApiError(503,'platform_bridge_not_configured','NEXOFFICE_INTERNAL_KEY não configurada.');
  const received=String(req.headers['x-nexoffice-key']||'');
  if(!safeEqual(received,expected))throw new ApiError(401,'unauthorized','Credencial interna inválida.');
}

async function legalWorkspace(externalWorkspaceRef:string){
  const workspace=(await query<any>(`
    select w.id,w.name,w.vertical
    from workspace_origins o
    join workspaces w on w.id=o.workspace_id
    where o.source_product='nexjud' and o.external_workspace_ref=$1
    limit 1
  `,[externalWorkspaceRef]))[0];
  if(!workspace)throw new ApiError(404,'workspace_not_provisioned','Workspace NexOffice ainda não provisionado para esta origem.');
  if(workspace.vertical!=='legal')throw new ApiError(409,'legal_workspace_required','Sinais jurídicos só podem entrar em workspace do vertical legal.');
  return workspace;
}

export async function registerPlatformLegalRoutes(app:FastifyInstance){
  app.post('/v1/platform/legal-signals',async req=>{
    authorize(req);
    const input=LegalOperationalSignal.parse(req.body);
    const workspace=await legalWorkspace(input.externalWorkspaceRef);
    const rows=await query<any>(`
      insert into workspace_operational_signals(
        workspace_id,source_product,signal_type,period_start,period_end,metrics,dimensions,correlation_id
      ) values($1,'nexjud',$2,$3,$4,$5,$6,$7)
      on conflict (workspace_id,source_product,correlation_id) where correlation_id is not null
      do update set signal_type=excluded.signal_type,period_start=excluded.period_start,period_end=excluded.period_end,
        metrics=excluded.metrics,dimensions=excluded.dimensions
      returning id,workspace_id,source_product,signal_type,period_start,period_end,metrics,dimensions,correlation_id,created_at
    `,[workspace.id,input.signalType,input.periodStart,input.periodEnd,JSON.stringify(input.metrics),JSON.stringify(input.dimensions),input.correlationId||null]);
    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,metadata) values($1,'service','nexjud','platform.legal_signal.accepted','workspace',$1::uuid::text,$2)`,[workspace.id,JSON.stringify({signalType:input.signalType,correlationId:input.correlationId||null,privacy:'aggregate_only'})]).catch(()=>null);
    const actionSync=await syncOperationalActions(workspace.id).catch(error=>({created:0,updated:0,priorities:0,error:error instanceof Error?error.message:String(error)}));
    return {ok:true,privacy:'aggregate_only',signal:rows[0],actionSync};
  });

  app.get('/v1/platform/legal-signals',async req=>{
    authorize(req);
    const input=z.object({
      sourceProduct:z.literal('nexjud').default('nexjud'),
      externalWorkspaceRef:z.string().trim().min(1).max(220),
      limit:z.coerce.number().int().min(1).max(100).default(30)
    }).strict().parse(req.query);
    const workspace=await legalWorkspace(input.externalWorkspaceRef);
    const rows=await query<any>(`
      select id,source_product,signal_type,period_start,period_end,metrics,dimensions,correlation_id,created_at
      from workspace_operational_signals
      where workspace_id=$1 and source_product='nexjud'
      order by created_at desc
      limit $2
    `,[workspace.id,input.limit]);
    return {workspace:{id:workspace.id,name:workspace.name,vertical:workspace.vertical},privacy:'aggregate_only',allowedSignalTypes:LEGAL_SIGNAL_TYPES,signals:rows};
  });
}
