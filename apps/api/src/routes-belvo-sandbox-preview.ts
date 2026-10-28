/** Belvo Brazil OFDA sandbox-only preview endpoints. No real bank data. */
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';
import {
 sandboxReady,widgetReady,newSandboxExternalId,createSandboxWidgetAccess,
 authorizedSandboxWebhook,parseSandboxWebhook,BelvoSandboxError
} from './belvo-sandbox-contract.js';
import {verifyBelvoSandboxConsent,BelvoVerificationError} from './belvo-sandbox-verification.js';

const ID=z.string().regex(/^nexa_pf_sb_[a-f0-9]{32}$/);
const requestSchema=z.object({confirmSandbox:z.literal(true)}).strict();
export async function registerBelvoSandboxPreviewRoutes(app:FastifyInstance){
 if(process.env.NEX_PERSONAL_PREVIEW!=='true')return;
 const env=process.env;
 const allowed=new Set(String(env.NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS||'')
  .toLowerCase().split(',').map(x=>x.trim()).filter(Boolean));
 async function owner(req:Parameters<typeof authenticate>[0]):Promise<string>{
  const user=await authenticate(req);
  if(!allowed.has(user.email.toLowerCase()))
   throw new ApiError(403,'sandbox_invite_required','Somente testadores autorizados.');
  const profile=await query<{user_id:string}>(
   'SELECT user_id FROM nex_personal.profiles WHERE user_id=$1',[user.id]);
  if(!profile.length)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nexa PF.');
  return user.id;
 }
 app.get('/v1/personal/belvo-sandbox/status',async req=>{
  await owner(req);
  return {environment:'sandbox',provider:'belvo',institution:'ofmockbank_br_retail',
   sandboxConfigured:sandboxReady(env),widgetAvailable:widgetReady(env),
   walletAccess:false,financialDataAvailable:false,paymentsEnabled:false,
   simulatedData:true,requiresIndividualConsent:true};
 });

 // Deliberate opt-in: only a logged-in invitee can request a token, and ONLY
 // when mock identity, terms, webhook bearer and the opt-in flag are configured.
 app.post('/v1/personal/belvo-sandbox/widget/start',async req=>{
  const actor=await owner(req);
  requestSchema.parse(req.body);
  if(!widgetReady(env))
   throw new ApiError(503,'sandbox_widget_disabled','Integração de demonstração em preparação.');
  const recent=await query<{count:number}>(
   "SELECT count(*)::int AS count FROM nex_personal.belvo_sandbox_attempts WHERE owner_user_id=$1 AND created_at>now()-interval '1 hour'",
   [actor]);
  if((recent[0]?.count||0)>=3)
   throw new ApiError(429,'sandbox_widget_limited','Aguarde antes de repetir a conexão de teste.');
  const externalId=newSandboxExternalId();
  ID.parse(externalId);
  const created=await query<{id:string}>(
   "INSERT INTO nex_personal.belvo_sandbox_attempts(owner_user_id,external_id) VALUES($1,$2) RETURNING id",
   [actor,externalId]);
  try{
   const widgetUrl=await createSandboxWidgetAccess(env,externalId);
   await query(
    "UPDATE nex_personal.belvo_sandbox_attempts SET status='widget_ready',updated_at=now() WHERE id=$1 AND owner_user_id=$2",
    [created[0].id,actor]);
   return {environment:'sandbox',simulatedData:true,
    institution:'ofmockbank_br_retail',widgetUrl,expiresInSeconds:600,
    externalEffect:'short_lived_widget_token_only',paymentInitiated:false};
  }catch(e){
   await query("UPDATE nex_personal.belvo_sandbox_attempts SET status='failed',updated_at=now() WHERE id=$1 AND owner_user_id=$2",
    [created[0].id,actor]).catch(()=>undefined);
   // Never reveal Belvo API bodies, tokens, secrets or fixture identity.
   throw new ApiError(502,'sandbox_widget_unavailable',
    e instanceof BelvoSandboxError?'Não foi possível abrir o banco fictício. Tente novamente.':'Conexão de testes indisponível.');
  }
 });

 // Explicit user action. Check the REAL provider-side link and consent before
 // recording a mockbank-only verification; never infer approval from an
 // untrusted callback, webhook, client-supplied link or CPF.
 app.post('/v1/personal/belvo-sandbox/verify',async req=>{
  const actor=await owner(req);
  requestSchema.parse(req.body);
  if(!widgetReady(env))
   throw new ApiError(503,'sandbox_widget_disabled','Homologação ainda não habilitada.');
  const events=await query<{id:string;external_id:string;link_id:string}>(
   `SELECT a.id,a.external_id,e.link_id
      FROM nex_personal.belvo_sandbox_attempts a
      JOIN nex_personal.belvo_sandbox_events e ON e.attempt_id=a.id
     WHERE a.owner_user_id=$1 AND a.status='widget_ready'
       AND e.link_id IS NOT NULL AND a.created_at>now()-interval '48 hours'
     ORDER BY e.received_at DESC LIMIT 1`,[actor]);
  if(!events.length)return {
   verified:false,status:'awaiting_webhook',sandbox:true,
   bankDataImported:false,paymentsEnabled:false
  };
  // An earlier proof is NOT perpetual authorization. Pin its exact consent
  // reference when rechecking, and never substitute another consent silently.
  const existing=await query<{provider_consent_ref:string}>(
   `SELECT provider_consent_ref FROM nex_personal.belvo_sandbox_verified_consents
      WHERE attempt_id=$1::uuid AND owner_user_id=$2::uuid
        AND provider_link_ref::text=$3 LIMIT 1`,
   [events[0].id,actor,events[0].link_id]);
  let proof;
  try{
   proof=await verifyBelvoSandboxConsent(env,{
    externalId:events[0].external_id,linkId:events[0].link_id,
    expectedConsentId:existing[0]?.provider_consent_ref
   });
  }catch(err){
   if(err instanceof BelvoVerificationError)
    throw new ApiError(502,'sandbox_provider_unavailable',
     'Não foi possível confirmar o consentimento no banco fictício.');
   throw new ApiError(502,'sandbox_provider_unavailable','Verificação indisponível.');
  }
  if(!proof){
   // Provider confirms no currently valid pinned consent. Remove ONLY this
   // owner's obsolete sandbox proof; never touch accounts or transactions.
   if(existing.length)await query(
    `DELETE FROM nex_personal.belvo_sandbox_verified_consents
      WHERE attempt_id=$1::uuid AND owner_user_id=$2::uuid
        AND provider_link_ref::text=$3 AND provider_consent_ref=$4::uuid`,
    [events[0].id,actor,events[0].link_id,existing[0].provider_consent_ref]);
   return {verified:false,status:existing.length?'expired_or_revoked':'not_confirmed',
    sandbox:true,bankDataImported:false,paymentsEnabled:false};
  }
  if(existing.length)return {
   verified:true,status:'verified_sandbox_consent',sandbox:true,
   institution:'ofmockbank_br_retail',bankDataImported:false,
   paymentsEnabled:false,realBankConnection:false
  };
  // Persist only server-checked refs with the authenticated PF owner.
  // Never copy PII, balances, permissions JSON or bank transactions.
  const inserted=await query<{attempt_id:string}>(
   `INSERT INTO nex_personal.belvo_sandbox_verified_consents
       (attempt_id,owner_user_id,provider_link_ref,provider_consent_ref,institution)
     SELECT a.id,a.owner_user_id,$3::uuid,$4::uuid,'ofmockbank_br_retail'
       FROM nex_personal.belvo_sandbox_attempts a
      WHERE a.id=$1::uuid AND a.owner_user_id=$2::uuid AND a.status='widget_ready'
     ON CONFLICT(attempt_id) DO NOTHING RETURNING attempt_id`,
   [events[0].id,actor,proof.linkRef,proof.consentRef]);
  return {
   verified:inserted.length>0,
   status:inserted.length>0?'verified_sandbox_consent':'already_verified_or_changed',
   sandbox:true,institution:'ofmockbank_br_retail',
   bankDataImported:false,paymentsEnabled:false,realBankConnection:false
  };
 });

 // Aggregation webhook, never payments webhook. Not registered at all until
 // bearer secret exists; Belvo does not provide an HMAC signature here.
 if(sandboxReady(env)&&typeof env.BELVO_SANDBOX_WEBHOOK_BEARER==='string'
  &&env.BELVO_SANDBOX_WEBHOOK_BEARER.length>=32){
  app.post('/v1/personal/belvo-sandbox/webhook',{bodyLimit:8192},async(req,reply)=>{
   if(!authorizedSandboxWebhook(env,req.headers.authorization))
    throw new ApiError(401,'unauthorized','Não autorizado.');
   let item;
   try{item=parseSandboxWebhook(req.body);}
   catch{return reply.code(400).send({error:'invalid_webhook'});}
   if(!item.externalId||!item.linkId)
    return reply.code(202).send({accepted:true,processed:false});
   const found=await query<{id:string}>(
    "SELECT id FROM nex_personal.belvo_sandbox_attempts WHERE external_id=$1 AND status='widget_ready' LIMIT 1",
    [item.externalId]);
   if(!found.length)return reply.code(202).send({accepted:true,processed:false});
   // Event metadata only; never mark an account "linked" or accept a balance.
   await query(
    'INSERT INTO nex_personal.belvo_sandbox_events(webhook_id,attempt_id,resource,event_code,link_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(webhook_id) DO NOTHING',
    [item.webhookId,found[0].id,item.resource,item.event,item.linkId]
   );
   return reply.code(202).send({accepted:true,processed:false});
  });
 }
}
