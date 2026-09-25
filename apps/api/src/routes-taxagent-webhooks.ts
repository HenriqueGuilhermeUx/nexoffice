import type {FastifyInstance} from 'fastify';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';
import {decryptIntegrationSecret,encryptIntegrationSecret,integrationSecretEncryptionConfigured} from './integration-secret-crypto.js';

const uuid=z.string().uuid();
const allowedEvents=['invoice.authorized','invoice.rejected'] as const;

function setupEnabled(){return String(process.env.NEXOFFICE_TAXAGENT_WEBHOOK_SETUP||'false').toLowerCase()==='true'}
function publicApiBase(){return String(process.env.NEXOFFICE_PUBLIC_API_URL||'').trim().replace(/\/$/,'')}
function taxAgentBase(){return String(process.env.TAXAGENT_BASE_URL||'').trim().replace(/\/$/,'')}
function authHeaders(credential:string):Record<string,string>{const custom=String(process.env.TAXAGENT_AUTH_HEADER||'').trim();return custom?{[custom]:credential}:{Authorization:`Bearer ${credential}`}}

async function workspaceTaxAgent(workspaceId:string){
  const mapping=(await query<any>(`select external_account_ref,secret_ref from integrations where workspace_id=$1 and provider='taxagent' limit 1`,[workspaceId]))[0];
  if(!mapping)return {ok:false as const,error:'taxagent_not_connected'};
  const companyId=String(mapping.external_account_ref||'').trim();if(!companyId)return {ok:false as const,error:'taxagent_company_not_connected'};
  const secretRef=String(mapping.secret_ref||'').trim();const workspaceKey=secretRef?String(process.env[secretRef]||'').trim():'';const credential=workspaceKey||String(process.env.TAXAGENT_API_KEY||'').trim();
  if(!credential)return {ok:false as const,error:'taxagent_workspace_credential_not_configured'};
  return {ok:true as const,companyId,credential};
}

function signatureOk(secret:string,timestamp:string,body:string,provided:string){
  const expected=`v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`;
  const a=Buffer.from(expected,'utf8'),b=Buffer.from(provided,'utf8');return a.length===b.length&&timingSafeEqual(a,b);
}

function operationStatus(fiscalStatus:string,currentStatus:string){
  if(['paid','closed','cancelled'].includes(currentStatus))return currentStatus;
  if(fiscalStatus==='authorized')return ['collection_ready','communication_pending'].includes(currentStatus)?currentStatus:'invoice_authorized';
  if(fiscalStatus==='rejected')return 'attention';
  return currentStatus;
}

export async function registerTaxAgentWebhookRoutes(app:FastifyInstance){
  app.get('/v1/integrations/taxagent/webhook',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    const row=(await query<any>(`select id,provider_endpoint_id,events,status,last_error,created_at,updated_at from taxagent_webhook_receivers where workspace_id=$1`,[ctx.workspaceId]))[0]||null;
    return {configured:Boolean(row?.status==='active'),setupEnabled:setupEnabled(),receiver:row,secretStoredEncrypted:Boolean(row&&integrationSecretEncryptionConfigured())};
  });

  app.post('/v1/integrations/taxagent/webhook/setup',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage');
    if(!setupEnabled())throw new ApiError(409,'taxagent_webhook_setup_disabled','O cadastro automático do webhook TaxAgent está desativado neste ambiente.');
    if(!integrationSecretEncryptionConfigured())throw new ApiError(409,'integration_secret_key_not_configured','Configure NEXOFFICE_INTEGRATION_SECRET_KEY antes de registrar webhooks.');
    const base=publicApiBase();if(!base)throw new ApiError(409,'public_api_url_not_configured','Configure NEXOFFICE_PUBLIC_API_URL.');
    let url:URL;try{url=new URL(base)}catch{throw new ApiError(409,'public_api_url_invalid','NEXOFFICE_PUBLIC_API_URL inválida.');}if(url.protocol!=='https:')throw new ApiError(409,'public_api_url_https_required','O endpoint público precisa usar HTTPS.');
    const existing=(await query<any>(`select id,provider_endpoint_id,events,status from taxagent_webhook_receivers where workspace_id=$1`,[ctx.workspaceId]))[0];
    if(existing?.status==='active')return {reused:true,configured:true,receiver:existing,externalEffect:false};
    const connection=await workspaceTaxAgent(ctx.workspaceId);if(!connection.ok)throw new ApiError(409,connection.error,'Conecte o TaxAgent antes de registrar o webhook.');
    const providerBase=taxAgentBase();if(!providerBase)throw new ApiError(409,'taxagent_base_url_not_configured','Configure TAXAGENT_BASE_URL.');
    const input=z.object({events:z.array(z.enum(allowedEvents)).min(1).max(2).default([...allowedEvents])}).parse(req.body||{});
    const receiverId=existing?.id||randomUUID();const callback=`${base}/v1/integrations/taxagent/webhook/${receiverId}`;
    await query(`insert into taxagent_webhook_receivers(id,workspace_id,events,status,last_error) values($1,$2,$3,'pending',null) on conflict(workspace_id) do update set events=excluded.events,status='pending',last_error=null,updated_at=now()`,[receiverId,ctx.workspaceId,input.events]);
    let response:Response;
    try{response=await fetch(`${providerBase}/v1/companies/${encodeURIComponent(connection.companyId)}/webhooks`,{method:'POST',headers:{accept:'application/json','content-type':'application/json',...authHeaders(connection.credential)},body:JSON.stringify({url:callback,events:input.events}),signal:AbortSignal.timeout(12000)})}
    catch(error){const message=error instanceof Error?error.message:String(error);await query(`update taxagent_webhook_receivers set status='error',last_error=$2,updated_at=now() where id=$1`,[receiverId,message]);throw new ApiError(502,'taxagent_webhook_setup_failed','TaxAgent indisponível para registrar o webhook.');}
    const payload=await response.json().catch(()=>({})) as any;
    if(!response.ok||!payload?.secret||!payload?.id){const message=String(payload?.message||payload?.error||`HTTP ${response.status}`);await query(`update taxagent_webhook_receivers set status='error',last_error=$2,updated_at=now() where id=$1`,[receiverId,message]);throw new ApiError(502,'taxagent_webhook_setup_failed','TaxAgent recusou o cadastro do webhook.');}
    const encrypted=encryptIntegrationSecret(String(payload.secret));
    const row=(await query<any>(`update taxagent_webhook_receivers set provider_endpoint_id=$2,secret_ciphertext=$3,secret_iv=$4,secret_tag=$5,events=$6,status='active',last_error=null,updated_at=now() where id=$1 returning id,provider_endpoint_id,events,status,created_at,updated_at`,[receiverId,String(payload.id),encrypted.ciphertext,encrypted.iv,encrypted.tag,input.events]))[0];
    await auditLog(ctx,'integration.taxagent.webhook_configured','workspace',ctx.workspaceId,null,{receiverId,providerEndpointId:payload.id,events:input.events,secretEncrypted:true,externalEffect:true});
    return {reused:false,configured:true,receiver:row,externalEffect:true,secretEncrypted:true};
  });

  app.post('/v1/integrations/taxagent/webhook/:receiverId',async(req,reply)=>{
    const receiverId=uuid.parse((req.params as any).receiverId);
    const receiver=(await query<any>(`select * from taxagent_webhook_receivers where id=$1 and status='active'`,[receiverId]))[0];if(!receiver)return reply.code(404).send({error:'receiver_not_found'});
    if(!integrationSecretEncryptionConfigured())return reply.code(503).send({error:'integration_secret_key_not_configured'});
    const timestamp=String(req.headers['taxagent-timestamp']||''),provided=String(req.headers['taxagent-signature']||''),eventHeader=String(req.headers['taxagent-event-id']||'');
    const epoch=Number(timestamp);if(!Number.isFinite(epoch)||Math.abs(Math.floor(Date.now()/1000)-epoch)>300)return reply.code(401).send({error:'stale_webhook'});
    const body=(req.body||{}) as any;const canonical=JSON.stringify(body);
    let secret='';try{secret=decryptIntegrationSecret({ciphertext:receiver.secret_ciphertext,iv:receiver.secret_iv,tag:receiver.secret_tag})}catch{return reply.code(503).send({error:'webhook_secret_unreadable'});}
    if(!provided||!signatureOk(secret,timestamp,canonical,provided))return reply.code(401).send({error:'invalid_signature'});
    const eventId=String(body?.id||'');const eventType=String(body?.event||'');if(!eventId||!eventHeader||eventId!==eventHeader)return reply.code(400).send({error:'event_id_mismatch'});
    if(!allowedEvents.includes(eventType as any)||!Array.isArray(receiver.events)||!receiver.events.includes(eventType))return reply.code(202).send({received:true,ignored:true,reason:'event_not_subscribed'});
    const invoiceId=String(body?.data?.invoice_id||'').trim();if(!invoiceId)return reply.code(400).send({error:'invoice_id_required'});
    const result=body?.data?.result||{};const fiscalStatus=String(result?.status||eventType.replace('invoice.',''));
    const operation=(await query<any>(`select distinct o.* from business_operations o left join agent_runs r on r.workspace_id=o.workspace_id and r.action_id=o.invoice_action_id and r.status='succeeded' where o.workspace_id=$1 and (o.fiscal_external_ref=$2 or r.output->'payload'->>'id'=$2) order by o.updated_at desc limit 1`,[receiver.workspace_id,invoiceId]))[0];
    if(!operation)return reply.code(202).send({received:true,ignored:true,reason:'invoice_not_managed_by_nexoffice'});
    const processed=await transaction(async client=>{
      const inserted=await client.query<any>(`insert into taxagent_webhook_events(event_id,receiver_id,workspace_id,event_type,invoice_id,fiscal_status) values($1,$2,$3,$4,$5,$6) on conflict(event_id) do nothing returning event_id`,[eventId,receiverId,receiver.workspace_id,eventType,invoiceId,fiscalStatus]);
      if(!inserted.rowCount)return {reused:true};
      await client.query(`update business_operations set fiscal_external_ref=$3,fiscal_status=$4,status=$5,metadata=metadata||$6::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[operation.id,receiver.workspace_id,invoiceId,fiscalStatus,operationStatus(fiscalStatus,operation.status),JSON.stringify({taxAgentWebhookEventId:eventId,taxAgentWebhookEvent:eventType,taxAgentWebhookAt:new Date().toISOString(),taxAgentProvider:result?.provider||null,taxAgentAccessKey:result?.accessKey||result?.access_key||null,taxAgentProviderReference:result?.providerReference||result?.provider_reference||null,taxAgentRejection:result?.rejection?{code:result.rejection.code||null,message:result.rejection.message||null}:null})]);
      return {reused:false};
    });
    return reply.code(200).send({received:true,reused:processed.reused,operationId:operation.id,fiscalStatus});
  });
}
