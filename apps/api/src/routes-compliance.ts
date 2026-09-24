import type {FastifyInstance,FastifyRequest} from 'fastify';
import {timingSafeEqual} from 'node:crypto';
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

function safeBase(value:string){
  const raw=String(value||'').trim();if(!raw)return null;
  try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol))return null;return url.toString().replace(/\/$/,'')}catch{return null}
}

function nr1checkUrl(workspaceId:string,businessName:string,sector:string){
  const base=safeBase(String(process.env.NR1CHECK_WEB_URL||''));if(!base)return null;
  const url=new URL('/nexoffice',base);url.searchParams.set('source','nexoffice');url.searchParams.set('workspaceRef',workspaceId);url.searchParams.set('businessName',businessName);if(sector)url.searchParams.set('sector',sector);return url.toString();
}

function federationConfigured(){return Boolean(safeBase(String(process.env.NR1CHECK_API_URL||''))&&String(process.env.NR1CHECK_BRIDGE_KEY||'').trim())}
function acceptedFederatedUrl(value:unknown){
  if(typeof value!=='string')return null;
  try{
    const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return null;
    const expected=safeBase(String(process.env.NR1CHECK_WEB_URL||''));if(expected&&url.origin!==new URL(expected).origin)return null;
    return url.toString();
  }catch{return null}
}

async function federatedNr1checkHandoff(ctx:WorkspaceContext,businessName:string,sector:string){
  const apiBase=safeBase(String(process.env.NR1CHECK_API_URL||'')),key=String(process.env.NR1CHECK_BRIDGE_KEY||'').trim();
  if(!apiBase||!key)return null;
  try{
    const response=await fetch(`${apiBase}/api/integrations/nexoffice/session`,{
      method:'POST',
      headers:{accept:'application/json','content-type':'application/json','x-nexoffice-key':key},
      body:JSON.stringify({workspaceRef:ctx.workspaceId,businessName,sector,userRef:ctx.user.id,userEmail:ctx.user.email,userName:ctx.user.name}),
      signal:AbortSignal.timeout(10_000),
    });
    if(!response.ok)return null;
    const payload=await response.json() as any,url=acceptedFederatedUrl(payload?.url);if(!url)return null;
    return{url,expiresInSeconds:Number(payload?.expiresInSeconds||120),accountProvisioned:Boolean(payload?.accountProvisioned)};
  }catch{return null}
}

function safeEqual(received:string,expected:string){if(!received||!expected)return false;const a=Buffer.from(received),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
function authorizeInternal(req:FastifyRequest){const expected=String(process.env.NEXOFFICE_INTERNAL_KEY||'').trim();if(!expected)throw new ApiError(503,'platform_bridge_not_configured','NEXOFFICE_INTERNAL_KEY não configurada.');const received=String(req.headers['x-nexoffice-key']||'');if(!safeEqual(received,expected))throw new ApiError(401,'unauthorized','Credencial interna inválida.')}

const Summary=z.object({
  workspaceRef:z.string().uuid(),
  sourceProduct:z.enum(['nr1check','mindcompliance']),
  diagnosticStatus:z.enum(['not_started','in_progress','completed','not_applicable']).optional(),
  programStatus:z.enum(['not_started','active','attention','up_to_date']).optional(),
  openActions:z.number().int().min(0).max(100000).default(0),
  overdueActions:z.number().int().min(0).max(100000).default(0),
  nextDueAt:z.string().datetime().nullable().optional(),
  completionPct:z.number().min(0).max(100).nullable().optional(),
  categories:z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  deepLink:z.string().url().max(2000).nullable().optional(),
  observedAt:z.string().datetime().optional(),
}).strict();

async function overview(workspaceId:string){
  const [workspace,profile]=await Promise.all([
    query<any>(`select id,name,vertical,settings from workspaces where id=$1`,[workspaceId]).then(rows=>rows[0]),
    getBusinessProfile(workspaceId).catch(()=>null),
  ]);
  if(!workspace)throw new ApiError(404,'workspace_not_found','Empresa não encontrada.');
  const settings=workspace.settings&&typeof workspace.settings==='object'?workspace.settings:{};
  const compliance=settings.compliance&&typeof settings.compliance==='object'?settings.compliance:{};
  const triage=Triage.parse(compliance.triage||{}),relevance=relevanceFor(triage),sector=String(profile?.sector||workspace.vertical||'general');
  const launchUrl=nr1checkUrl(workspaceId,workspace.name,sector);
  const summary=compliance.summary&&typeof compliance.summary==='object'?compliance.summary:null;
  return{
    available:true,
    workspace:{id:workspace.id,name:workspace.name,sector},
    triage,
    relevance,
    nr1check:{configured:Boolean(launchUrl)||federationConfigured(),launchUrl,federated:federationConfigured()},
    mindcompliance:{connected:Boolean(summary),summary},
    privacy:{mode:'aggregate_only',sourceOwnsCanonicalData:true,forbidden:['employee_personal_data','cpf','health_data','psychosocial_answers','complaint_content','raw_documents','confidential_evidence']},
    legalGuidance:{automaticLegalConclusion:false,note:'A triagem indica relevância e próximo passo. Ela não substitui avaliação normativa ou profissional.'},
  };
}

export async function registerComplianceRoutes(app:FastifyInstance){
  app.get('/v1/compliance/overview',async req=>{const ctx=await workspaceContext(req,'integrations.read');return overview(ctx.workspaceId)});

  app.put('/v1/compliance/triage',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage'),input=Triage.parse(req.body),relevance=relevanceFor(input);
    const current=(await query<any>(`select settings from workspaces where id=$1`,[ctx.workspaceId]))[0]?.settings||{};
    const previousCompliance=current.compliance&&typeof current.compliance==='object'?current.compliance:{};
    const compliance={...previousCompliance,triage:input,triageUpdatedAt:new Date().toISOString()};
    await query(`update workspaces set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('compliance',$2::jsonb),updated_at=now() where id=$1`,[ctx.workspaceId,JSON.stringify(compliance)]);
    await auditLog(ctx,'compliance.triage.updated','workspace',ctx.workspaceId,null,{triage:input,relevance:relevance.state,privacy:'business_level_only'});
    return overview(ctx.workspaceId);
  });

  app.post('/v1/compliance/nr1check/handoff',async req=>{
    const ctx=await workspaceContext(req,'integrations.read'),data=await overview(ctx.workspaceId);
    const federated=await federatedNr1checkHandoff(ctx,data.workspace.name,data.workspace.sector);
    if(federated){
      await auditLog(ctx,'compliance.nr1check.handoff.created','workspace',ctx.workspaceId,null,{source:'nexoffice',mode:'federated',sharedBusinessFields:['workspaceRef','businessName','sector'],identityTransferredServerSide:true,sensitiveBusinessDataShared:false,externalEffect:false});
      return{url:federated.url,mode:'federated',expiresInSeconds:federated.expiresInSeconds,accountProvisioned:federated.accountProvisioned,sharedBusinessFields:['workspaceRef','businessName','sector'],identityTransferredServerSide:true,sensitiveBusinessDataShared:false};
    }
    if(!data.nr1check.launchUrl)throw new ApiError(503,'nr1check_not_configured','NR1Check ainda não está configurado neste ambiente.');
    await auditLog(ctx,'compliance.nr1check.handoff.created','workspace',ctx.workspaceId,null,{source:'nexoffice',mode:'fallback',sharedBusinessFields:['workspaceRef','businessName','sector'],identityTransferredServerSide:false,sensitiveBusinessDataShared:false,externalEffect:false});
    return{url:data.nr1check.launchUrl,mode:'fallback',expiresContextAfterHours:24,sharedBusinessFields:['workspaceRef','businessName','sector'],identityTransferredServerSide:false,sensitiveBusinessDataShared:false};
  });

  app.post('/v1/internal/compliance/summary',async req=>{
    authorizeInternal(req);const input=Summary.parse(req.body);
    const workspace=(await query<any>(`select id,settings from workspaces where id=$1`,[input.workspaceRef]))[0];if(!workspace)throw new ApiError(404,'workspace_not_found','Workspace NexOffice não encontrado.');
    const current=workspace.settings&&typeof workspace.settings==='object'?workspace.settings:{};const previousCompliance=current.compliance&&typeof current.compliance==='object'?current.compliance:{};
    const summary={sourceProduct:input.sourceProduct,diagnosticStatus:input.diagnosticStatus||null,programStatus:input.programStatus||null,openActions:input.openActions,overdueActions:input.overdueActions,nextDueAt:input.nextDueAt||null,completionPct:input.completionPct??null,categories:input.categories,deepLink:input.deepLink||null,observedAt:input.observedAt||new Date().toISOString()};
    await query(`update workspaces set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('compliance',$2::jsonb),updated_at=now() where id=$1`,[input.workspaceRef,JSON.stringify({...previousCompliance,summary})]);
    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,after_state,metadata) values($1,'service',$2,'compliance.summary.updated','workspace',$1::text,$3,$4)`,[input.workspaceRef,input.sourceProduct,JSON.stringify(summary),JSON.stringify({privacy:'aggregate_only',rawRecordsAccepted:false})]).catch(()=>null);
    return{ok:true,workspaceId:input.workspaceRef,privacy:'aggregate_only'};
  });
}
