import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

export async function registerSmartBotsRoutes(app:FastifyInstance){
  app.get('/v1/integrations/smartbots',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const row=(await query<any>(`select provider,status,external_account_ref,capabilities,config,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 and provider='smartbots' limit 1`,[ctx.workspaceId]))[0]||null;
    if(!row)return {provider:'smartbots',status:'disconnected',botId:null};
    return {...row,botId:row.external_account_ref||row.config?.botId||null};
  });

  app.put('/v1/integrations/smartbots',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    const input=z.object({botId:z.string().trim().min(3).max(160)}).parse(req.body);
    const before=(await query<any>(`select * from integrations where workspace_id=$1 and provider='smartbots' limit 1`,[ctx.workspaceId]))[0]||null;
    const rows=await query<any>(`insert into integrations(workspace_id,provider,status,external_account_ref,capabilities,config,connected_at) values($1,'smartbots','configured',$2,$3,$4,now()) on conflict(workspace_id,provider) do update set status='configured',external_account_ref=excluded.external_account_ref,capabilities=excluded.capabilities,config=excluded.config,connected_at=coalesce(integrations.connected_at,now()),last_error=null,updated_at=now() returning *`,[ctx.workspaceId,input.botId,['whatsapp','service','qualification','follow-up','human_approval'],JSON.stringify({botId:input.botId,firstOutboundRequiresHumanApproval:true})]);
    await auditLog(ctx,'integration.smartbots.connected','integration',rows[0].id,before,{provider:'smartbots',botId:input.botId},{secretStored:false,firstOutboundRequiresHumanApproval:true});
    return {provider:'smartbots',status:rows[0].status,botId:rows[0].external_account_ref,capabilities:rows[0].capabilities};
  });
}
