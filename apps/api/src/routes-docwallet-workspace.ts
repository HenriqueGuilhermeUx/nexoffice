import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const signatureMode=z.enum(['electronic','icp_brasil']);
const partyInput=z.object({name:z.string().trim().min(2).max(180),email:z.string().trim().email().max(180).optional().nullable()});
const signatureInput=z.object({parties:z.array(partyInput).min(1).max(12),mode:signatureMode.default('electronic'),humanConfirmed:z.boolean().default(false)}).strict();

function safeBase(value:string){
  const raw=String(value||'').trim();
  if(!raw)return null;
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return null;return url.toString().replace(/\/$/,'')}catch{return null}
}
function bridgeConfig(){
  const base=safeBase(String(process.env.DOCWALLET_BASE_URL||''));
  const key=String(process.env.DOCWALLET_SERVICE_KEY||process.env.DOCWALLET_API_KEY||'').trim();
  return{base,key,configured:Boolean(base&&key)};
}
function icpExternalActionsEnabled(){
  return String(process.env.DOCWALLET_ICP_SIGNATURE_ENABLED||'false').toLowerCase()==='true'&&String(process.env.NEXOFFICE_EXTERNAL_ACTIONS||'false').toLowerCase()==='true';
}
async function docwallet(workspaceId:string,path:string,init:RequestInit={}){
  const cfg=bridgeConfig();
  if(!cfg.configured||!cfg.base)throw new ApiError(409,'docwallet_not_configured','Conecte/configure a DocWallet antes de usar esta função.');
  const headers=new Headers(init.headers||{});
  headers.set('accept','application/json');
  headers.set('content-type','application/json');
  headers.set('x-nexoffice-key',cfg.key);
  headers.set('x-nexoffice-workspace-id',workspaceId);
  let response:Response;
  try{response=await fetch(`${cfg.base}${path}`,{...init,headers,signal:AbortSignal.timeout(12_000)})}
  catch{throw new ApiError(502,'docwallet_unreachable','DocWallet indisponível neste momento.')}
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok){
    const code=String(payload?.code||payload?.error||'docwallet_request_failed');
    const message=typeof payload?.error==='string'?payload.error:'Não foi possível concluir a operação na DocWallet.';
    if(response.status===401)throw new ApiError(502,'docwallet_bridge_unauthorized','Bridge DocWallet recusou a credencial de serviço.');
    if([400,403,409,503].includes(response.status))throw new ApiError(response.status===400?400:409,code,message);
    throw new ApiError(response.status===404?404:502,code,message);
  }
  return payload;
}

async function allowance(workspaceId:string,client?:any){
  const run=client?async(sql:string,args:any[])=>((await client.query(sql,args)).rows):query<any>;
  const entitlement=(await run(`select tier,monthly_limit,source from docwallet_signature_entitlements where workspace_id=$1`,[workspaceId]))[0]||{tier:'included',monthly_limit:6,source:'nexoffice_default'};
  const period=(await run(`select date_trunc('month',now())::date::text period_start,(date_trunc('month',now())+interval '1 month')::date::text next_period_start`,[]))[0];
  const used=Number((await run(`select count(*)::int count from docwallet_signature_usage where workspace_id=$1 and period_start=$2::date`,[workspaceId,period.period_start]))[0]?.count||0);
  const limit=Number(entitlement.monthly_limit||6);
  return{tier:String(entitlement.tier||'included'),included:limit,used,remaining:Math.max(limit-used,0),limitReached:used>=limit,specialPlanRequired:used>=limit&&String(entitlement.tier)!=='signatures_plus',periodStart:period.period_start,nextPeriodStart:period.next_period_start,policy:{perSignatureCharge:false,oneDocumentOneUsage:true,modeChangesPrice:false,cancelledStillCounts:true,workspacesPlanInferred:false,billingActivated:false}};
}

function safeSignature(value:any){
  const parties=Array.isArray(value?.parties)?value.parties.map((p:any)=>({id:String(p?.id||''),name:String(p?.name||''),email:String(p?.email||''),status:String(p?.status||'pending'),signedAt:p?.signedAt||p?.signed_at||null,url:String(p?.url||'')})):[];
  const derivedTotal=parties.length;
  const derivedSigned=parties.filter((party:any)=>party.status==='signed').length;
  const totalParties=Number(value?.totalParties??value?.total_parties??derivedTotal);
  const signedCount=Number(value?.signedCount??value?.signed_count??derivedSigned);
  const pendingCount=Number(value?.pendingCount??value?.pending_count??Math.max(totalParties-signedCount,0));
  const progressPercent=Number(value?.progressPercent??value?.progress_percent??(totalParties?Math.round((signedCount/totalParties)*100):0));
  return{id:String(value?.id||''),title:String(value?.title||''),status:String(value?.status||'pending'),contentHash:String(value?.contentHash||value?.content_hash||''),finalHash:String(value?.finalHash||value?.final_hash||''),createdAt:value?.createdAt||value?.created_at||null,completedAt:value?.completedAt||value?.completed_at||null,totalParties,signedCount,pendingCount,progressPercent,parties};
}
function safeIcpSessions(value:any){
  const sessions=Array.isArray(value?.sessions)?value.sessions:[];
  return sessions.map((item:any)=>({id:String(item?.id||''),status:String(item?.status||'created'),signatureStandard:String(item?.signatureStandard||'PAdES'),providerStatus:item?.providerStatus||null,completedAt:item?.completedAt||null,hasCertificateEvidence:Boolean(item?.hasCertificateEvidence),hasSignedDocument:Boolean(item?.hasSignedDocument)}));
}
function fallbackModes(){
  return{modes:[
    {id:'electronic',label:'Assinatura eletrônica',available:true,signatureStandard:'electronic_evidence',description:'Aceite eletrônico com trilha de evidências DocWallet.'},
    {id:'icp_brasil',label:'Assinatura digital ICP-Brasil',available:false,signatureStandard:'PAdES',description:'Assinatura com certificado digital ICP-Brasil.'}
  ],providerContractReady:false,externalActionsEnabled:icpExternalActionsEnabled(),privacy:{providerRedirectReturned:false,certificateIdentityReturned:false,privateKeyHandled:false,certificatePasswordHandled:false}};
}
async function getSignatureModes(workspaceId:string){
  try{
    const payload=await docwallet(workspaceId,'/api/internal/nexoffice/signature-modes');
    const modes=(Array.isArray(payload?.modes)?payload.modes:[]).map((item:any)=>({id:String(item?.id||''),label:String(item?.label||''),available:Boolean(item?.available),signatureStandard:String(item?.signatureStandard||''),description:String(item?.description||'')}));
    return{modes:modes.length?modes:fallbackModes().modes,providerContractReady:true,externalActionsEnabled:icpExternalActionsEnabled(),privacy:{providerRedirectReturned:false,certificateIdentityReturned:false,privateKeyHandled:false,certificatePasswordHandled:false}};
  }catch(error){
    if(error instanceof ApiError&&[404,409,502].includes(error.statusCode))return fallbackModes();
    throw error;
  }
}
async function ensureIcpAllowed(workspaceId:string,humanConfirmed:boolean){
  if(!humanConfirmed)throw new ApiError(400,'human_confirmation_required','Confirme explicitamente o uso de assinatura digital ICP-Brasil.');
  if(!icpExternalActionsEnabled())throw new ApiError(409,'icp_external_actions_disabled','Assinatura ICP-Brasil ainda não está habilitada neste ambiente.');
  const available=await getSignatureModes(workspaceId);
  const icp=available.modes.find((item:any)=>item.id==='icp_brasil');
  if(!icp?.available)throw new ApiError(409,'icp_signature_unavailable','Assinatura ICP-Brasil não está disponível para este workspace agora.');
  return available;
}
async function prepareIcp(workspaceId:string,signatureId:string){
  const payload=await docwallet(workspaceId,`/api/internal/nexoffice/signatures/${encodeURIComponent(signatureId)}/icp/prepare`,{method:'POST',body:JSON.stringify({humanConfirmed:true})});
  return{sessions:safeIcpSessions(payload),status:safeIcpSessions(payload).length?'prepared':'awaiting_provider',externalEffect:true};
}

export async function registerDocWalletWorkspaceRoutes(app:FastifyInstance){
  app.get('/v1/documents/signature-allowance',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    return{...(await allowance(ctx.workspaceId)),provider:'docwallet',externalEffect:false};
  });

  app.get('/v1/documents/signature-modes',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    return{...(await getSignatureModes(ctx.workspaceId)),externalEffect:false};
  });

  app.get('/v1/documents/docwallet-center',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const [documents,usage,quota,modes]=await Promise.all([
      query<any>(`select d.id,d.contact_id,d.external_ref,d.title,d.status,d.document_type,d.signature_status,d.metadata,d.created_at,d.updated_at,c.name contact_name from document_refs d left join crm_contacts c on c.id=d.contact_id where d.workspace_id=$1 and d.provider='docwallet' order by d.updated_at desc limit 200`,[ctx.workspaceId]),
      query<any>(`select u.id,u.document_ref_id,u.business_operation_id,u.external_signature_request_id,u.status,u.signature_mode,u.icp_status,u.period_start,u.created_at,d.title from docwallet_signature_usage u join document_refs d on d.id=u.document_ref_id where u.workspace_id=$1 order by u.created_at desc limit 100`,[ctx.workspaceId]),
      allowance(ctx.workspaceId),
      getSignatureModes(ctx.workspaceId)
    ]);
    return{documents,signatureUsage:usage,allowance:quota,signatureModes:modes,capabilities:{contracts:true,templates:true,signatures:true,icpBrasil:modes.modes.some((item:any)=>item.id==='icp_brasil'),intelligence:true,docflow:true,validation:true,certificates:true},privacy:{rawDocumentsStoredInNexOffice:false,rawContractContentStoredInNexOffice:false,sensitiveSignatureEvidenceStoredInNexOffice:false,providerRedirectStoredInNexOffice:false,certificateIdentityStoredInNexOffice:false},externalEffect:false};
  });

  app.post('/v1/documents/:id/signatures',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const documentId=uuid.parse((req.params as any).id);
    const input=signatureInput.parse(req.body||{});
    if(input.mode==='icp_brasil')await ensureIcpAllowed(ctx.workspaceId,input.humanConfirmed);

    const reservation=await transaction(async client=>{
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`,[`docwallet-signature:${ctx.workspaceId}`]);
      const document=(await client.query(`select d.*,b.id business_operation_id from document_refs d left join business_operations b on b.workspace_id=d.workspace_id and b.document_ref_id=d.id where d.id=$1 and d.workspace_id=$2 and d.provider='docwallet'`,[documentId,ctx.workspaceId])).rows[0];
      if(!document)throw new ApiError(404,'docwallet_document_not_found','Documento DocWallet não encontrado neste workspace.');
      const externalDocumentId=String(document.external_ref||'').trim();
      if(!externalDocumentId)throw new ApiError(409,'docwallet_document_reference_missing','Este documento ainda não possui uma referência DocWallet apta para assinatura.');

      const existing=(await client.query(`select * from docwallet_signature_usage where workspace_id=$1 and document_ref_id=$2 and status in ('processing','pending') order by created_at desc limit 1`,[ctx.workspaceId,documentId])).rows[0];
      if(existing?.status==='pending')throw new ApiError(409,'signature_request_already_pending','Este documento já possui uma solicitação de assinatura pendente.');
      const quota=await allowance(ctx.workspaceId,client);
      if(existing?.status==='processing'){
        if(String(existing.signature_mode||'electronic')!==input.mode)throw new ApiError(409,'signature_mode_conflict','Há uma solicitação deste documento em processamento com outra modalidade.');
        return{document,externalDocumentId,usage:existing,quota,reservedNew:false};
      }
      if(quota.limitReached)throw new ApiError(409,'signature_allowance_exhausted','Você usou as assinaturas incluídas deste mês. Assinaturas+ amplia a franquia sem cobrança por assinatura avulsa.');

      const idempotencyKey=`nexoffice-signature-${documentId}-${randomUUID()}`;
      const usage=(await client.query(`insert into docwallet_signature_usage(workspace_id,document_ref_id,business_operation_id,idempotency_key,external_signature_request_id,status,signature_mode,icp_status,period_start,requested_by) values($1,$2,$3,$4,null,'processing',$5,$6,$7::date,$8) returning *`,[ctx.workspaceId,documentId,document.business_operation_id||null,idempotencyKey,input.mode,input.mode==='icp_brasil'?'requested':null,quota.periodStart,ctx.user.id])).rows[0];
      return{document,externalDocumentId,usage,quota,reservedNew:true};
    });

    let payload:any;
    try{
      payload=await docwallet(ctx.workspaceId,`/api/internal/nexoffice/documents/${encodeURIComponent(reservation.externalDocumentId)}/signature-request`,{method:'POST',headers:{'x-idempotency-key':reservation.usage.idempotency_key},body:JSON.stringify({parties:input.parties})});
    }catch(error){
      if(error instanceof ApiError&&error.statusCode<500&&error.code!=='operation_in_progress'){
        await query(`delete from docwallet_signature_usage where id=$1 and workspace_id=$2 and status='processing'`,[reservation.usage.id,ctx.workspaceId]);
      }
      throw error;
    }

    const signature=safeSignature(payload?.request);
    if(!signature.id)throw new ApiError(502,'invalid_docwallet_signature_response','DocWallet não retornou a referência de assinatura esperada.');

    const finalized=await transaction(async client=>{
      const usage=(await client.query(`update docwallet_signature_usage set external_signature_request_id=$3,status=$4,signature_mode=$5,updated_at=now() where id=$1 and workspace_id=$2 and status='processing' returning *`,[reservation.usage.id,ctx.workspaceId,signature.id,signature.status==='completed'?'completed':'pending',input.mode])).rows[0];
      if(!usage){
        const recovered=(await client.query(`select * from docwallet_signature_usage where id=$1 and workspace_id=$2`,[reservation.usage.id,ctx.workspaceId])).rows[0];
        if(!recovered)throw new ApiError(409,'signature_reservation_missing','A reserva de assinatura não pôde ser reconciliada.');
      }
      await client.query(`update document_refs set signature_status=$3,metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[documentId,ctx.workspaceId,signature.status,JSON.stringify({signatureRequestId:signature.id,signatureProvider:'docwallet',signatureMode:input.mode,signatureRequestedAt:new Date().toISOString()})]);
      const quota=await allowance(ctx.workspaceId,client);
      return{usage:usage||reservation.usage,quota};
    });

    let icp:any=null;
    if(input.mode==='icp_brasil'){
      try{
        icp=await prepareIcp(ctx.workspaceId,signature.id);
        await query(`update docwallet_signature_usage set icp_status=$3,updated_at=now() where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signature.id,icp.status]);
      }catch(error){
        await query(`update docwallet_signature_usage set icp_status='prepare_failed',updated_at=now() where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signature.id]);
        icp={status:'prepare_failed',sessions:[],requiresRetry:true,message:'A solicitação foi criada, mas a etapa ICP-Brasil precisa ser preparada novamente.'};
      }
    }

    const result={signature,mode:input.mode,icp,usage:finalized.usage,allowance:finalized.quota,privacy:{rawContentReturned:false,sensitiveEvidenceReturned:false,providerRedirectReturned:false,certificateIdentityReturned:false},recoveredReservation:!reservation.reservedNew,externalEffect:true};
    await auditLog(ctx,'document.signature.requested','document_ref',documentId,null,{provider:'docwallet',signatureMode:input.mode,signatureRequestId:result.signature.id,partyCount:result.signature.totalParties,monthlyUsage:result.allowance.used,monthlyLimit:result.allowance.included,recoveredReservation:result.recoveredReservation,icpStatus:icp?.status||null,rawContentExposed:false});
    return result;
  });

  app.get('/v1/documents/signatures/:signatureId',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const signatureId=String((req.params as any).signatureId||'').trim();
    const usage=(await query<any>(`select * from docwallet_signature_usage where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId]))[0];
    if(!usage)throw new ApiError(404,'signature_not_found','Assinatura não encontrada neste workspace.');
    const payload=await docwallet(ctx.workspaceId,`/api/internal/nexoffice/signatures/${encodeURIComponent(signatureId)}`);
    const signature=safeSignature(payload?.request);
    const nextStatus=signature.status==='completed'?'completed':signature.status==='cancelled'?'cancelled':'pending';
    let icp:any=null;
    if(String(usage.signature_mode||'electronic')==='icp_brasil'){
      try{
        const icpPayload=await docwallet(ctx.workspaceId,`/api/internal/nexoffice/signatures/${encodeURIComponent(signatureId)}/icp/sessions`);
        const sessions=safeIcpSessions(icpPayload);
        const statuses=sessions.map((item:any)=>String(item.status).toLowerCase());
        const icpStatus=sessions.length&&statuses.every((status:string)=>['completed','signed','done'].includes(status))?'completed':sessions.length?'in_progress':String(usage.icp_status||'requested');
        icp={status:icpStatus,sessions};
        await query(`update docwallet_signature_usage set icp_status=$3,updated_at=now() where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId,icpStatus]);
      }catch{icp={status:String(usage.icp_status||'unavailable'),sessions:[]};}
    }
    await query(`update docwallet_signature_usage set status=$3,updated_at=now() where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId,nextStatus]);
    await query(`update document_refs set signature_status=$3,metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[usage.document_ref_id,ctx.workspaceId,signature.status,JSON.stringify({signatureFinalHash:signature.finalHash||null,signatureCompletedAt:signature.completedAt||null,signatureMode:usage.signature_mode||'electronic',icpStatus:icp?.status||null})]);
    return{signature,mode:String(usage.signature_mode||'electronic'),icp,externalEffect:false,privacy:{rawContentReturned:false,sensitiveEvidenceReturned:false,providerRedirectReturned:false,certificateIdentityReturned:false}};
  });

  app.post('/v1/documents/signatures/:signatureId/icp/prepare',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const signatureId=String((req.params as any).signatureId||'').trim();
    const input=z.object({humanConfirmed:z.literal(true)}).strict().parse(req.body||{});
    await ensureIcpAllowed(ctx.workspaceId,input.humanConfirmed);
    const usage=(await query<any>(`select * from docwallet_signature_usage where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId]))[0];
    if(!usage)throw new ApiError(404,'signature_not_found','Assinatura não encontrada neste workspace.');
    if(String(usage.signature_mode||'electronic')!=='icp_brasil')throw new ApiError(409,'signature_not_icp','Esta solicitação foi criada como assinatura eletrônica, não ICP-Brasil.');
    const icp=await prepareIcp(ctx.workspaceId,signatureId);
    await query(`update docwallet_signature_usage set icp_status=$3,updated_at=now() where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId,icp.status]);
    await auditLog(ctx,'document.signature.icp_prepared','document_ref',usage.document_ref_id,null,{provider:'docwallet',signatureRequestId:signatureId,humanConfirmed:true,icpStatus:icp.status,externalEffect:true});
    return{mode:'icp_brasil',icp,externalEffect:true,privacy:{providerRedirectReturned:false,certificateIdentityReturned:false}};
  });

  app.post('/v1/documents/signatures/:signatureId/reminder',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const signatureId=String((req.params as any).signatureId||'').trim();
    const input=z.object({partyId:z.string().trim().optional().nullable()}).parse(req.body||{});
    const usage=(await query<any>(`select id,document_ref_id from docwallet_signature_usage where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId]))[0];
    if(!usage)throw new ApiError(404,'signature_not_found','Assinatura não encontrada neste workspace.');
    const payload=await docwallet(ctx.workspaceId,`/api/internal/nexoffice/signatures/${encodeURIComponent(signatureId)}/reminder`,{method:'POST',body:JSON.stringify({partyId:input.partyId||null})});
    await auditLog(ctx,'document.signature.reminder_prepared','document_ref',usage.document_ref_id,null,{provider:'docwallet',signatureRequestId:signatureId,partyId:payload?.party?.id||null,externalEffect:true});
    return{party:payload?.party||null,message:String(payload?.message||''),externalEffect:true};
  });

  app.post('/v1/documents/signatures/:signatureId/cancel',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const signatureId=String((req.params as any).signatureId||'').trim();
    const usage=(await query<any>(`select id,document_ref_id from docwallet_signature_usage where workspace_id=$1 and external_signature_request_id=$2`,[ctx.workspaceId,signatureId]))[0];
    if(!usage)throw new ApiError(404,'signature_not_found','Assinatura não encontrada neste workspace.');
    const payload=await docwallet(ctx.workspaceId,`/api/internal/nexoffice/signatures/${encodeURIComponent(signatureId)}/cancel`,{method:'POST',body:'{}'});
    await query(`update docwallet_signature_usage set status='cancelled',updated_at=now() where id=$1`,[usage.id]);
    await query(`update document_refs set signature_status='cancelled',updated_at=now() where id=$1 and workspace_id=$2`,[usage.document_ref_id,ctx.workspaceId]);
    await auditLog(ctx,'document.signature.cancelled','document_ref',usage.document_ref_id,null,{provider:'docwallet',signatureRequestId:signatureId,allowanceRestored:false,externalEffect:true});
    return{signature:safeSignature(payload?.request),allowanceRestored:false,externalEffect:true};
  });
}
