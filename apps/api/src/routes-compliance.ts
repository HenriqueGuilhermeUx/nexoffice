import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ApiError,workspaceContext,type WorkspaceContext} from './auth.js';
import {getBusinessProfile} from './business-intelligence.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const Triage=z.object({
  hasEmployees:z.enum(['yes','no','unknown']).default('unknown'),
  companyType:z.enum(['mei','me_epp','other','unknown']).default('unknown'),
  hasSstSupport:z.enum(['yes','no','unknown']).default('unknown'),
  nr1ReviewStatus:z.enum(['managed','reviewed','not_reviewed','unknown']).default('unknown'),
}).strict();
type TriageInput=z.infer<typeof Triage>;
type Relevance='not_relevant_now'|'worth_checking'|'review_recommended'|'already_managed';

function relevanceFor(input:TriageInput):{state:Relevance;title:string;detail:string;nextAction:'none'|'check_nr1'|'open_management'}{
  if(input.nr1ReviewStatus==='managed')return{state:'already_managed',title:'Compliance já está sendo acompanhado',detail:'O NexOffice pode trazer prazos, pendências e progresso para o seu dia a dia quando a conexão estiver ativa.',nextAction:'open_management'};
  if(input.hasEmployees==='no')return{state:'not_relevant_now',title:'Checagem disponível sem prioridade agora',detail:'Como você informou que não possui empregados, o NexOffice não prioriza essa checagem neste momento. Isso não é conclusão jurídica; a função continua disponível e pode ser revisada quando a estrutura da empresa mudar.',nextAction:'none'};
  if(input.hasEmployees==='yes'&&input.nr1ReviewStatus==='not_reviewed')return{state:'review_recommended',title:'Vale revisar a NR-1 agora',detail:'Há empregados e você informou que a revisão ainda não foi feita. O NR1Check pode organizar essa checagem sem repetir os dados básicos da empresa.',nextAction:'check_nr1'};
  if(input.hasEmployees==='yes')return{state:'worth_checking',title:'Vale confirmar sua situação',detail:'O NexOffice mantém a checagem disponível para você confirmar obrigações, gaps e próximos passos com o produto especializado.',nextAction:'check_nr1'};
  return{state:'worth_checking',title:'Uma checagem rápida pode evitar dúvida depois',detail:'Como ainda não sabemos se a empresa possui empregados ou se a NR-1 já foi revisada, o NexOffice pode conduzir uma verificação inicial sem afirmar obrigação automaticamente.',nextAction:'check_nr1'};
}

function safeBase(value:string){const raw=String(value||'').trim();if(!raw)return null;try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return null;return url.toString().replace(/\/$/,'')}catch{return null}}
function bridgeSecret(){return String(process.env.NEXOFFICE_COMPLIANCE_BRIDGE_SECRET||'').trim()}
function browserBridgeConfigured(){return Boolean(safeBase(String(process.env.NR1CHECK_WEB_URL||''))&&bridgeSecret())}
function federationConfigured(){return Boolean(safeBase(String(process.env.NR1CHECK_API_URL||''))&&safeBase(String(process.env.NR1CHECK_WEB_URL||''))&&bridgeSecret())}
function liveSummaryConfigured(){return Boolean(safeBase(String(process.env.NR1CHECK_API_URL||''))&&bridgeSecret())}
function safeEqual(received:string,expected:string){if(!received||!expected)return false;const a=Buffer.from(received),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
function authorizeComplianceBridge(req:FastifyRequest){const expected=bridgeSecret();if(!expected)throw new ApiError(503,'compliance_bridge_not_configured','NEXOFFICE_COMPLIANCE_BRIDGE_SECRET não configurada.');const received=String(req.headers['x-nexoffice-compliance-key']||'');if(!safeEqual(received,expected))throw new ApiError(401,'unauthorized','Credencial de compliance inválida.')}

function signedNr1checkUrl(workspaceId:string,businessName:string,sector:string){
  const base=safeBase(String(process.env.NR1CHECK_WEB_URL||'')),secret=bridgeSecret();if(!base||!secret)return null;
  const payload={v:1,workspaceRef:workspaceId,businessName,sector,exp:Math.floor(Date.now()/1000)+10*60,nonce:randomBytes(12).toString('base64url')};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'),signature=createHmac('sha256',secret).update(encoded).digest('base64url'),token=`${encoded}.${signature}`;
  const url=new URL('/nexoffice',base);url.searchParams.set('handoff',token);return{url:url.toString(),token,expiresAt:new Date(payload.exp*1000).toISOString()};
}

function acceptedComplianceDeepLink(value:unknown){if(typeof value!=='string'||!value.trim())return null;try{const url=new URL(value),expected=safeBase(String(process.env.NR1CHECK_WEB_URL||''));if(!['https:','http:'].includes(url.protocol))return null;if(expected&&url.origin!==new URL(expected).origin)return null;return url.toString()}catch{return null}}
function acceptedFederatedUrl(value:unknown){
  if(typeof value!=='string'||!value.trim())return null;
  try{const url=new URL(value),expected=safeBase(String(process.env.NR1CHECK_WEB_URL||''));if(!expected||url.origin!==new URL(expected).origin||url.pathname!=='/nexoffice/federated')return null;const keys=[...url.searchParams.keys()].sort();if(JSON.stringify(keys)!==JSON.stringify(['handoff','ticket']))return null;if(!url.searchParams.get('handoff')||!url.searchParams.get('ticket'))return null;return url.toString()}catch{return null}
}

async function createFederatedNr1checkEntry(ctx:WorkspaceContext,signedToken:string){
  const apiBase=safeBase(String(process.env.NR1CHECK_API_URL||'')),secret=bridgeSecret();if(!apiBase||!secret)return null;
  try{
    const response=await fetch(`${apiBase}/api/integrations/nexoffice/session`,{method:'POST',headers:{accept:'application/json','content-type':'application/json','x-nexoffice-compliance-key':secret},body:JSON.stringify({handoffToken:signedToken,userRef:ctx.user.id,userEmail:ctx.user.email,userName:ctx.user.name}),signal:AbortSignal.timeout(10_000)});
    if(!response.ok)return null;const payload=await response.json() as any,url=acceptedFederatedUrl(payload?.url);if(!url)return null;
    return{url,expiresInSeconds:Number(payload?.expiresInSeconds||120),accountProvisioned:Boolean(payload?.accountProvisioned),companyCreated:Boolean(payload?.companyCreated)};
  }catch{return null}
}

const Summary=z.object({workspaceRef:z.string().uuid(),sourceProduct:z.enum(['nr1check','mindcompliance']),diagnosticStatus:z.enum(['not_started','in_progress','completed','not_applicable']).optional(),programStatus:z.enum(['not_started','active','attention','up_to_date']).optional(),openActions:z.number().int().min(0).max(100000).default(0),overdueActions:z.number().int().min(0).max(100000).default(0),nextDueAt:z.string().datetime().nullable().optional(),completionPct:z.number().min(0).max(100).nullable().optional(),categories:z.array(z.string().trim().min(1).max(80)).max(20).default([]),deepLink:z.string().url().max(2000).nullable().optional(),observedAt:z.string().datetime().optional()}).strict();
type SummaryInput=z.infer<typeof Summary>;

function sanitizeSummary(payload:any,workspaceId:string):SummaryInput|null{const parsed=Summary.safeParse({workspaceRef:payload?.workspaceRef,sourceProduct:payload?.sourceProduct,diagnosticStatus:payload?.diagnosticStatus,programStatus:payload?.programStatus,openActions:payload?.openActions,overdueActions:payload?.overdueActions,nextDueAt:payload?.nextDueAt,completionPct:payload?.completionPct,categories:payload?.categories,deepLink:payload?.deepLink||undefined,observedAt:payload?.observedAt});if(!parsed.success||parsed.data.workspaceRef!==workspaceId)return null;return{...parsed.data,deepLink:acceptedComplianceDeepLink(parsed.data.deepLink)}}
async function persistSummary(workspaceId:string,input:SummaryInput){const workspace=(await query<any>(`select id,settings from workspaces where id=$1`,[workspaceId]))[0];if(!workspace)return false;const current=workspace.settings&&typeof workspace.settings==='object'?workspace.settings:{},previousCompliance=current.compliance&&typeof current.compliance==='object'?current.compliance:{},summary={sourceProduct:input.sourceProduct,diagnosticStatus:input.diagnosticStatus||null,programStatus:input.programStatus||null,openActions:input.openActions,overdueActions:input.overdueActions,nextDueAt:input.nextDueAt||null,completionPct:input.completionPct??null,categories:input.categories,deepLink:acceptedComplianceDeepLink(input.deepLink),observedAt:input.observedAt||new Date().toISOString()};await query(`update workspaces set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('compliance',$2::jsonb),updated_at=now() where id=$1`,[workspaceId,JSON.stringify({...previousCompliance,summary})]);return true}
async function pullComplianceSummary(workspaceId:string){const apiBase=safeBase(String(process.env.NR1CHECK_API_URL||'')),secret=bridgeSecret();if(!apiBase||!secret)return null;try{const response=await fetch(`${apiBase}/api/internal/nexoffice/compliance-summary?workspaceRef=${encodeURIComponent(workspaceId)}`,{headers:{accept:'application/json','x-nexoffice-compliance-key':secret},signal:AbortSignal.timeout(5000)});if(response.status===404)return null;if(!response.ok)return null;const payload=await response.json() as any,summary=sanitizeSummary(payload,workspaceId);if(!summary)return null;await persistSummary(workspaceId,summary);return summary}catch{return null}}

async function overview(workspaceId:string){
  const [workspace,profile]=await Promise.all([query<any>(`select id,name,vertical,settings from workspaces where id=$1`,[workspaceId]).then(rows=>rows[0]),getBusinessProfile(workspaceId).catch(()=>null)]);if(!workspace)throw new ApiError(404,'workspace_not_found','Empresa não encontrada.');
  const remote=await pullComplianceSummary(workspaceId),freshWorkspace=remote?(await query<any>(`select settings from workspaces where id=$1`,[workspaceId]))[0]:workspace,settings=freshWorkspace?.settings&&typeof freshWorkspace.settings==='object'?freshWorkspace.settings:{},compliance=settings.compliance&&typeof settings.compliance==='object'?settings.compliance:{},triage=Triage.parse(compliance.triage||{}),relevance=relevanceFor(triage),sector=String(profile?.sector||workspace.vertical||'general'),signed=signedNr1checkUrl(workspaceId,workspace.name,sector),summary=remote||((compliance.summary&&typeof compliance.summary==='object')?compliance.summary:null);
  return{available:true,workspace:{id:workspace.id,name:workspace.name,sector},triage,relevance,nr1check:{configured:Boolean(signed),launchUrl:signed?.url||null,signedHandoff:Boolean(signed),expiresAt:signed?.expiresAt||null,federated:federationConfigured(),liveSummary:liveSummaryConfigured()},mindcompliance:{connected:Boolean(summary),summary},privacy:{mode:'aggregate_only',sourceOwnsCanonicalData:true,forbidden:['employee_personal_data','cpf','health_data','psychosocial_answers','complaint_content','raw_documents','confidential_evidence']},legalGuidance:{automaticLegalConclusion:false,note:'A triagem indica relevância e próximo passo. Ela não substitui avaliação normativa ou profissional.'}};
}

export async function registerComplianceRoutes(app:FastifyInstance){
  app.get('/v1/compliance/overview',async req=>{const ctx=await workspaceContext(req,'integrations.read');return overview(ctx.workspaceId)});
  app.put('/v1/compliance/triage',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),input=Triage.parse(req.body),relevance=relevanceFor(input);const current=(await query<any>(`select settings from workspaces where id=$1`,[ctx.workspaceId]))[0]?.settings||{},previousCompliance=current.compliance&&typeof current.compliance==='object'?current.compliance:{},compliance={...previousCompliance,triage:input,triageUpdatedAt:new Date().toISOString()};await query(`update workspaces set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('compliance',$2::jsonb),updated_at=now() where id=$1`,[ctx.workspaceId,JSON.stringify(compliance)]);await auditLog(ctx,'compliance.triage.updated','workspace',ctx.workspaceId,null,{triage:input,relevance:relevance.state,privacy:'business_level_only'});return overview(ctx.workspaceId)});
  app.post('/v1/compliance/nr1check/handoff',async req=>{
    const ctx=await workspaceContext(req,'integrations.read'),data=await overview(ctx.workspaceId),signed=signedNr1checkUrl(ctx.workspaceId,data.workspace.name,data.workspace.sector);if(!signed)throw new ApiError(503,'nr1check_not_configured','NR1Check ainda não está configurado neste ambiente.');
    const federated=await createFederatedNr1checkEntry(ctx,signed.token);
    if(federated){await auditLog(ctx,'compliance.nr1check.handoff.created','workspace',ctx.workspaceId,null,{source:'nexoffice',mode:'federated',passwordless:true,identityInBrowserUrl:false,businessContextOpaque:true,sensitiveBusinessDataShared:false,companyCreated:federated.companyCreated,externalEffect:false});return{url:federated.url,mode:'federated',passwordless:true,expiresInSeconds:federated.expiresInSeconds,accountProvisioned:federated.accountProvisioned,companyCreated:federated.companyCreated,identityInBrowserUrl:false,businessContextOpaque:true,sensitiveBusinessDataShared:false}}
    await auditLog(ctx,'compliance.nr1check.handoff.created','workspace',ctx.workspaceId,null,{source:'nexoffice',mode:'signed_fallback',passwordless:false,sharedBusinessFields:['workspaceRef','businessName','sector'],identityInBrowserUrl:false,sensitiveBusinessDataShared:false,expiresAt:signed.expiresAt,externalEffect:false});return{url:signed.url,mode:'signed_fallback',passwordless:false,expiresAt:signed.expiresAt,sharedBusinessFields:['workspaceRef','businessName','sector'],identityInBrowserUrl:false,businessContextOpaque:true,sensitiveBusinessDataShared:false};
  });
  app.post('/v1/compliance/refresh',async req=>{const ctx=await workspaceContext(req,'integrations.read');const summary=await pullComplianceSummary(ctx.workspaceId);return{refreshed:Boolean(summary),summary,privacy:'aggregate_only'}});
  app.post('/v1/internal/compliance/summary',async req=>{authorizeComplianceBridge(req);const raw=req.body as any,input=sanitizeSummary(raw,raw?.workspaceRef);if(!input)throw new ApiError(400,'invalid_compliance_summary','Resumo de compliance inválido.');const exists=(await query<any>(`select id from workspaces where id=$1`,[input.workspaceRef]))[0];if(!exists)throw new ApiError(404,'workspace_not_found','Workspace NexOffice não encontrado.');await persistSummary(input.workspaceRef,input);await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,after_state,metadata) values($1,'service',$2,'compliance.summary.updated','workspace',$1::text,$3,$4)`,[input.workspaceRef,input.sourceProduct,JSON.stringify(input),JSON.stringify({privacy:'aggregate_only',rawRecordsAccepted:false})]).catch(()=>null);return{ok:true,workspaceId:input.workspaceRef,privacy:'aggregate_only'}});
}
