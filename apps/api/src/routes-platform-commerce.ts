import type {FastifyInstance,FastifyRequest} from 'fastify';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {CommerceOperationalSignal,COMMERCE_SIGNAL_TYPES,COMMERCE_SOURCES} from './commerce-data-firewall.js';
import {syncOperationalActions} from './operational-action-engine.js';

const Provider=z.enum(COMMERCE_SOURCES);

function safeEqual(received:string,expected:string){if(!received||!expected)return false;const a=Buffer.from(received),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
function authorize(req:FastifyRequest){const expected=String(process.env.NEXOFFICE_INTERNAL_KEY||'').trim();if(!expected)throw new ApiError(503,'platform_bridge_not_configured','NEXOFFICE_INTERNAL_KEY não configurada.');const received=String(req.headers['x-nexoffice-key']||'');if(!safeEqual(received,expected))throw new ApiError(401,'unauthorized','Credencial interna inválida.')}

async function commerceWorkspace(provider:string,externalWorkspaceRef:string){
  const workspace=(await query<any>(`select w.id,w.name,w.vertical from integrations i join workspaces w on w.id=i.workspace_id where i.provider=$1 and i.external_account_ref=$2 limit 1`,[provider,externalWorkspaceRef]))[0];
  if(!workspace)throw new ApiError(404,'commerce_connection_not_found','Canal de commerce ainda não vinculado a um workspace NexOffice.');
  if(workspace.vertical!=='commerce')throw new ApiError(409,'commerce_workspace_required','Sinais de commerce só podem entrar em workspace do vertical commerce.');
  return workspace;
}

export async function registerPlatformCommerceRoutes(app:FastifyInstance){
  app.get('/v1/integrations/commerce',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    return query<any>(`select provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider=any($2::text[]) order by provider`,[ctx.workspaceId,[...COMMERCE_SOURCES]]);
  });

  app.put('/v1/integrations/commerce/:provider',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const provider=Provider.parse((req.params as any).provider);
    const input=z.object({externalAccountRef:z.string().trim().min(1).max(220),secretRef:z.string().trim().min(1).max(220).optional()}).strict().parse(req.body);
    const workspace=(await query<any>(`select vertical from workspaces where id=$1`,[ctx.workspaceId]))[0];
    if(workspace?.vertical!=='commerce')throw new ApiError(409,'commerce_workspace_required','Conectores de loja ficam disponíveis no NexOffice Commerce.');
    const before=(await query<any>(`select * from integrations where workspace_id=$1 and provider=$2 limit 1`,[ctx.workspaceId,provider]))[0]||null;
    const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,secret_ref,connected_at) values($1,$2,'configured',$3,$4,$5,$6,now()) on conflict(workspace_id,provider) do update set status='configured',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,secret_ref=coalesce(excluded.secret_ref,integrations.secret_ref),connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now() returning provider,status,external_account_ref,capabilities,config,secret_ref,connected_at,updated_at`,[ctx.workspaceId,provider,input.externalAccountRef,['orders','fulfillment','inventory','customers','support','aggregate_signals'],JSON.stringify({privacy:'aggregate_only',rawOrders:false,customerPII:false}),input.secretRef||null]);
    await auditLog(ctx,'integration.commerce.connected','integration',provider,before,rows[0],{provider,externalAccountRef:input.externalAccountRef,privacy:'aggregate_only',secretStored:false});
    return rows[0];
  });

  app.post('/v1/platform/commerce-signals',async req=>{
    authorize(req);
    const input=CommerceOperationalSignal.parse(req.body);
    const workspace=await commerceWorkspace(input.sourceProduct,input.externalWorkspaceRef);
    const rows=await query<any>(`
      insert into workspace_operational_signals(workspace_id,source_product,signal_type,period_start,period_end,metrics,dimensions,correlation_id)
      values($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (workspace_id,source_product,correlation_id) where correlation_id is not null
      do update set signal_type=excluded.signal_type,period_start=excluded.period_start,period_end=excluded.period_end,metrics=excluded.metrics,dimensions=excluded.dimensions
      returning id,workspace_id,source_product,signal_type,period_start,period_end,metrics,dimensions,correlation_id,created_at
    `,[workspace.id,input.sourceProduct,input.signalType,input.periodStart,input.periodEnd,JSON.stringify(input.metrics),JSON.stringify(input.dimensions),input.correlationId||null]);
    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,metadata) values($1,'service',$2,'platform.commerce_signal.accepted','workspace',$1::uuid::text,$3)`,[workspace.id,input.sourceProduct,JSON.stringify({signalType:input.signalType,correlationId:input.correlationId||null,privacy:'aggregate_only'})]).catch(()=>null);
    const actionSync=await syncOperationalActions(workspace.id).catch(error=>({created:0,updated:0,priorities:0,error:error instanceof Error?error.message:String(error)}));
    return {ok:true,privacy:'aggregate_only',signal:rows[0],actionSync};
  });

  app.get('/v1/platform/commerce-signals',async req=>{
    authorize(req);
    const input=z.object({sourceProduct:Provider,externalWorkspaceRef:z.string().trim().min(1).max(220),limit:z.coerce.number().int().min(1).max(100).default(30)}).strict().parse(req.query);
    const workspace=await commerceWorkspace(input.sourceProduct,input.externalWorkspaceRef);
    const rows=await query<any>(`select id,source_product,signal_type,period_start,period_end,metrics,dimensions,correlation_id,created_at from workspace_operational_signals where workspace_id=$1 and source_product=$2 order by created_at desc limit $3`,[workspace.id,input.sourceProduct,input.limit]);
    return {workspace:{id:workspace.id,name:workspace.name,vertical:workspace.vertical},privacy:'aggregate_only',allowedSignalTypes:COMMERCE_SIGNAL_TYPES,signals:rows};
  });
}
