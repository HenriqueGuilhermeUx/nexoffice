import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {safeTaxAgentEvidence,taxAgentEvidenceContext} from './taxagent-evidence-adapter.js';

const Period=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

type SignalMetrics={
  operations:number;paidOrClosed:number;revenueWithoutInvoice:number;operationsWithoutDocument:number;
  documents:number;documentsWithoutOperation:number;pendingSignatures:number;fiscalAttention:number;
};

function monthBounds(period:string){const [year,month]=period.split('-').map(Number);const start=`${period}-01T00:00:00.000Z`;const next=month===12?`${year+1}-01-01T00:00:00.000Z`:`${year}-${String(month+1).padStart(2,'0')}-01T00:00:00.000Z`;return {start,next,periodDate:`${period}-01`}}
function n(value:unknown){const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0}
function completeness(components:Array<{status:string}>){const applicable=components.filter(x=>x.status!=='not_observed');if(!applicable.length)return 100;return Math.round(applicable.filter(x=>x.status==='complete').length/applicable.length*100)}

async function localMetrics(workspaceId:string,period?:string):Promise<SignalMetrics>{
  const bounds=period?monthBounds(period):null;
  const timeOperation=bounds?` and bo.updated_at >= $2 and bo.updated_at < $3`:'';
  const timeDocument=bounds?` and dr.updated_at >= $2 and dr.updated_at < $3`:'';
  const params=bounds?[workspaceId,bounds.start,bounds.next]:[workspaceId];
  const [ops,docs,signatures]=await Promise.all([
    query<any>(`select
      count(*)::int operations,
      count(*) filter(where bo.status in ('paid','closed'))::int paid_or_closed,
      count(*) filter(where bo.status in ('paid','closed') and coalesce(bo.fiscal_status,'')<>'authorized')::int revenue_without_invoice,
      count(*) filter(where bo.status not in ('draft','cancelled') and bo.document_ref_id is null)::int operations_without_document,
      count(*) filter(where bo.status='attention' or bo.fiscal_status='rejected')::int fiscal_attention
      from business_operations bo where bo.workspace_id=$1${timeOperation}` ,params),
    query<any>(`select count(*)::int documents,
      count(*) filter(where not exists(select 1 from business_operations bo where bo.workspace_id=dr.workspace_id and bo.document_ref_id=dr.id))::int documents_without_operation
      from document_refs dr where dr.workspace_id=$1${timeDocument}`,params),
    bounds
      ? query<any>(`select count(*) filter(where status in ('processing','pending'))::int pending_signatures from docwallet_signature_usage where workspace_id=$1 and period_start=$2::date`,[workspaceId,bounds.periodDate])
      : query<any>(`select count(*) filter(where status in ('processing','pending'))::int pending_signatures from docwallet_signature_usage where workspace_id=$1`,[workspaceId])
  ]);
  return {
    operations:n(ops[0]?.operations),paidOrClosed:n(ops[0]?.paid_or_closed),revenueWithoutInvoice:n(ops[0]?.revenue_without_invoice),operationsWithoutDocument:n(ops[0]?.operations_without_document),
    documents:n(docs[0]?.documents),documentsWithoutOperation:n(docs[0]?.documents_without_operation),pendingSignatures:n(signatures[0]?.pending_signatures),fiscalAttention:n(ops[0]?.fiscal_attention)
  };
}

function localComponents(metrics:SignalMetrics,regulatoryActions:number|null){
  return [
    {id:'revenue_documented',label:'Receitas recebidas com situação fiscal',status:metrics.revenueWithoutInvoice===0?'complete':'attention',count:metrics.revenueWithoutInvoice},
    {id:'operation_documented',label:'Operações com evidência documental',status:metrics.operationsWithoutDocument===0?'complete':'attention',count:metrics.operationsWithoutDocument},
    {id:'signature_flow',label:'Assinaturas pendentes',status:metrics.pendingSignatures===0?'complete':'attention',count:metrics.pendingSignatures},
    {id:'fiscal_attention',label:'Pendências fiscais observadas',status:metrics.fiscalAttention===0?'complete':'attention',count:metrics.fiscalAttention},
    {id:'regulatory_changes',label:'Mudanças fiscais que pedem ação',status:regulatoryActions===null?'not_observed':regulatoryActions===0?'complete':'attention',count:regulatoryActions}
  ];
}

function safeRemoteMetrics(data:any){
  const m=data?.metrics||{};return {
    invoices:{total:n(m?.invoices?.total),authorized:n(m?.invoices?.authorized),rejected:n(m?.invoices?.rejected),pending:n(m?.invoices?.pending),cancelled:n(m?.invoices?.cancelled)},
    fiscal_documents:n(m?.fiscal_documents),inbox_documents:n(m?.inbox_documents),
    financial_evidence:{total:n(m?.financial_evidence?.total),amount:String(m?.financial_evidence?.amount||'0')},
    reconciliation:{open_total:n(m?.reconciliation?.open_total),high_open:n(m?.reconciliation?.high_open)},
    document_evidence:{total:n(m?.document_evidence?.total),analyzed:n(m?.document_evidence?.analyzed)},
    regulatory_changes:n(m?.regulatory_changes),regulatory_actions_required:n(m?.regulatory_actions_required)
  }
}

async function closingPayload(workspaceId:string,period:string){
  const local=await localMetrics(workspaceId,period);
  const [remoteDossier,remoteRules]=await Promise.all([
    safeTaxAgentEvidence<any>(workspaceId,`/dossier?period=${encodeURIComponent(period)}`),
    safeTaxAgentEvidence<any[]>(workspaceId,'/regulatory-changes')
  ]);
  const rules=Array.isArray(remoteRules.data)?remoteRules.data:[];
  const regulatoryActions=remoteRules.status==='ok'?rules.filter((r:any)=>r?.requires_action===true).length:null;
  const components=localComponents(local,regulatoryActions);
  return {
    period,
    operational_evidence_completeness:completeness(components),
    methodology:'Deterministic operational evidence coverage across NexOffice lineage plus safe TaxAgent aggregates. It is not a legal, tax or accounting compliance certification.',
    components,
    local_metrics:local,
    taxagent:{status:remoteDossier.status,metrics:remoteDossier.status==='ok'?safeRemoteMetrics(remoteDossier.data):null,operational_evidence_completeness:remoteDossier.status==='ok'?n(remoteDossier.data?.operational_evidence_completeness):null},
    rule_changes:{status:remoteRules.status,total:rules.length,actions_required:regulatoryActions},
    evidence_manifest:{raw_documents_embedded:false,raw_ocr_embedded:false,raw_fiscal_payloads_embedded:false,provider_secrets_embedded:false,document_external_refs_embedded:false},
    externalEffect:false,
    generatedAt:new Date().toISOString()
  };
}

export async function registerBusinessEvidenceRoutes(app:FastifyInstance){
  app.get('/v1/business-evidence/overview',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const [metrics,rules,remoteOverview,taxContext]=await Promise.all([
      localMetrics(ctx.workspaceId),safeTaxAgentEvidence<any[]>(ctx.workspaceId,'/regulatory-changes'),safeTaxAgentEvidence<any>(ctx.workspaceId,'/'),taxAgentEvidenceContext(ctx.workspaceId)
    ]);
    const ruleRows=Array.isArray(rules.data)?rules.data:[];const actions=rules.status==='ok'?ruleRows.filter((r:any)=>r?.requires_action===true).length:null;
    const components=localComponents(metrics,actions);
    return {
      operational_evidence_completeness:completeness(components),components,metrics,
      taxagent:{...taxContext,evidenceStatus:remoteOverview.status,summary:remoteOverview.status==='ok'?remoteOverview.data?.summary||null:null},
      regulatory:{status:rules.status,total:ruleRows.length,actionsRequired:actions},
      methodology:'Operational completeness and attention signals only. Not a legal/accounting compliance certification.',
      rawDocumentContent:false,rawFiscalPayload:false,externalEffect:false
    };
  });

  app.get('/v1/business-evidence/inbox',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const [revenue,missingDocs,signatures,fiscal,rules]=await Promise.all([
      query<any>(`select id,title,status,amount_minor,currency,updated_at from business_operations where workspace_id=$1 and status in ('paid','closed') and coalesce(fiscal_status,'')<>'authorized' order by updated_at desc limit 40`,[ctx.workspaceId]),
      query<any>(`select id,title,status,amount_minor,currency,updated_at from business_operations where workspace_id=$1 and status not in ('draft','cancelled') and document_ref_id is null order by updated_at desc limit 40`,[ctx.workspaceId]),
      query<any>(`select su.id,su.status,su.signature_mode,su.icp_status,su.updated_at,dr.id document_id,dr.title,bo.id operation_id from docwallet_signature_usage su join document_refs dr on dr.id=su.document_ref_id left join business_operations bo on bo.id=su.business_operation_id where su.workspace_id=$1 and su.status in ('processing','pending') order by su.updated_at desc limit 40`,[ctx.workspaceId]),
      query<any>(`select id,title,status,fiscal_status,updated_at from business_operations where workspace_id=$1 and (status='attention' or fiscal_status='rejected') order by updated_at desc limit 40`,[ctx.workspaceId]),
      safeTaxAgentEvidence<any[]>(ctx.workspaceId,'/regulatory-changes')
    ]);
    const items:any[]=[];
    for(const x of revenue)items.push({type:'revenue_without_invoice',severity:'high',title:x.title,message:'Operação marcada como recebida/encerrada sem nota autorizada vinculada.',operationId:x.id,amountMinor:Number(x.amount_minor),currency:x.currency,updatedAt:x.updated_at,action:{label:'Revisar operação',target:'business_operation'}});
    for(const x of missingDocs)items.push({type:'operation_without_document',severity:'medium',title:x.title,message:'Operação ativa ainda não possui documento vinculado.',operationId:x.id,updatedAt:x.updated_at,action:{label:'Vincular documento',target:'documents'}});
    for(const x of signatures)items.push({type:'signature_pending',severity:'medium',title:x.title,message:x.signature_mode==='icp_brasil'?'Assinatura ICP-Brasil ainda não foi concluída.':'Assinatura eletrônica ainda não foi concluída.',operationId:x.operation_id||null,documentId:x.document_id,signatureMode:x.signature_mode,signatureStatus:x.status,updatedAt:x.updated_at,action:{label:'Abrir Documentos',target:'documents'}});
    for(const x of fiscal)items.push({type:'fiscal_attention',severity:'high',title:x.title,message:`Situação fiscal requer revisão: ${x.fiscal_status||x.status}.`,operationId:x.id,updatedAt:x.updated_at,action:{label:'Abrir Fiscal',target:'fiscal'}});
    if(rules.status==='ok')for(const rule of Array.isArray(rules.data)?rules.data:[])items.push({type:'regulatory_change',severity:rule.requires_action?'high':'info',title:String(rule.title||'Mudança fiscal'),message:String(rule.summary||''),effectiveAt:rule.effective_at||null,sourceUrl:rule.source_url||null,sourceVerifiedByHash:Boolean(rule.source_verified_by_hash),requiresAction:Boolean(rule.requires_action),action:{label:'Ver impacto fiscal',target:'fiscal_rules'}});
    const order:Record<string,number>={high:0,medium:1,info:2};items.sort((a,b)=>(order[a.severity]??9)-(order[b.severity]??9));
    return {items:items.slice(0,120),counts:{high:items.filter(x=>x.severity==='high').length,medium:items.filter(x=>x.severity==='medium').length,info:items.filter(x=>x.severity==='info').length},taxAgentRulesStatus:rules.status,rawDocumentContent:false,externalEffect:false};
  });

  app.get('/v1/business-evidence/operations/:id/dossier',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const {id}=req.params as {id:string};
    const row=(await query<any>(`select bo.id,bo.title,bo.description,bo.amount_minor,bo.currency,bo.due_at,bo.status,bo.fiscal_status,bo.updated_at,
      c.id contact_id,c.name contact_name,dr.id document_id,dr.title document_title,dr.status document_status,dr.document_type,
      le.id ledger_id,le.status ledger_status,le.due_at ledger_due_at,le.paid_at,
      su.status signature_status,su.signature_mode,su.icp_status
      from business_operations bo
      left join crm_contacts c on c.id=bo.contact_id
      left join document_refs dr on dr.id=bo.document_ref_id
      left join ledger_entries le on le.id=bo.ledger_entry_id
      left join lateral(select status,signature_mode,icp_status from docwallet_signature_usage where workspace_id=bo.workspace_id and business_operation_id=bo.id order by created_at desc limit 1) su on true
      where bo.workspace_id=$1 and bo.id=$2 limit 1`,[ctx.workspaceId,id]))[0];
    if(!row)throw new ApiError(404,'operation_not_found','Operação não encontrada.');
    const components=[
      {id:'document',label:'Documento/contrato',status:row.document_id?'complete':'attention'},
      {id:'signature',label:'Assinatura',status:row.signature_status?row.signature_status==='completed'?'complete':'attention':'not_observed'},
      {id:'fiscal',label:'Fiscal',status:row.fiscal_status?row.fiscal_status==='authorized'?'complete':'attention':'not_observed'},
      {id:'finance',label:'Financeiro',status:row.ledger_status==='paid'||['paid','closed'].includes(String(row.status))?'complete':'attention'}
    ];
    return {operation:{id:row.id,title:row.title,description:row.description,status:row.status,amountMinor:Number(row.amount_minor),currency:row.currency,dueAt:row.due_at,updatedAt:row.updated_at},contact:row.contact_id?{id:row.contact_id,name:row.contact_name}:null,document:row.document_id?{id:row.document_id,title:row.document_title,status:row.document_status,type:row.document_type}:null,signature:row.signature_status?{status:row.signature_status,mode:row.signature_mode,icpStatus:row.icp_status}:null,fiscal:{status:row.fiscal_status||null,externalReferenceAvailable:Boolean(row.fiscal_status)},finance:row.ledger_id?{id:row.ledger_id,status:row.ledger_status,dueAt:row.ledger_due_at,paidAt:row.paid_at}:null,operational_evidence_completeness:completeness(components),components,methodology:'Lineage completeness for this workspace operation; not a legal/audit certification.',rawDocumentContent:false,documentExternalRef:false,fiscalExternalRef:false,externalEffect:false};
  });

  app.get('/v1/fiscal/closing',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const period=Period.parse((req.query as any)?.period);return closingPayload(ctx.workspaceId,period);
  });

  app.post('/v1/fiscal/closing/snapshot',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const period=Period.parse((req.body as any)?.period);const payload=await closingPayload(ctx.workspaceId,period);const bounds=monthBounds(period);
    const taxagentMetrics=payload.taxagent.metrics||{};
    const row=(await query<any>(`insert into fiscal_closing_snapshots(workspace_id,period,completeness,local_metrics,taxagent_metrics,evidence_manifest,methodology,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,period,completeness,methodology,created_at`,[ctx.workspaceId,bounds.periodDate,payload.operational_evidence_completeness,JSON.stringify(payload.local_metrics),JSON.stringify(taxagentMetrics),JSON.stringify(payload.evidence_manifest),payload.methodology,ctx.user.id]))[0];
    await auditLog(ctx,'fiscal.closing.snapshot_created','workspace',ctx.workspaceId,null,{period,completeness:payload.operational_evidence_completeness},{externalEffect:false,rawDocumentContent:false,rawFiscalPayload:false});
    return {snapshot:row,externalEffect:false};
  });

  app.get('/v1/fiscal/closing/snapshots',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const period=(req.query as any)?.period;const params:any[]=[ctx.workspaceId];let filter='';if(period){Period.parse(period);params.push(`${period}-01`);filter=' and period=$2::date'}
    const rows=await query<any>(`select id,period,completeness,methodology,created_at from fiscal_closing_snapshots where workspace_id=$1${filter} order by created_at desc limit 24`,params);return {snapshots:rows,externalEffect:false};
  });

  app.get('/v1/fiscal/rule-changes',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const result=await safeTaxAgentEvidence<any[]>(ctx.workspaceId,'/regulatory-changes');return {status:result.status,changes:Array.isArray(result.data)?result.data:[],source:'TaxAgent',rawSourceDocuments:false,externalEffect:false};
  });
}
