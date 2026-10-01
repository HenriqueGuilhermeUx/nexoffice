import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const CreateContract=z.object({
  templateId:z.string().trim().min(1).max(80),
  partyA:z.string().trim().min(1).max(255),
  partyB:z.string().trim().min(1).max(255),
  description:z.string().trim().min(1).max(8000),
  contactId:uuid.nullable().optional(),
  operationId:uuid.nullable().optional(),
  createBusinessOperation:z.boolean().default(false),
  dealId:uuid.nullable().optional(),
  amountMinor:z.number().int().min(0).optional().nullable(),
  dueAt:z.string().datetime().optional().nullable(),
  idempotencyKey:z.string().trim().min(8).max(220),
}).strict();

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

async function docwallet(workspaceId:string,path:string,init:RequestInit={}){
  const cfg=bridgeConfig();
  if(!cfg.configured||!cfg.base)throw new ApiError(409,'docwallet_not_configured','Conecte/configure a DocWallet antes de criar contratos.');
  const headers=new Headers(init.headers||{});
  headers.set('accept','application/json');
  headers.set('content-type','application/json');
  headers.set('x-nexoffice-key',cfg.key);
  headers.set('x-nexoffice-workspace-id',workspaceId);
  let response:Response;
  try{response=await fetch(`${cfg.base}${path}`,{...init,headers,signal:AbortSignal.timeout(12_000)})}
  catch{throw new ApiError(502,'docwallet_unreachable','DocWallet indisponível neste momento.');}
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok){
    const code=String(payload?.code||payload?.error||'docwallet_request_failed');
    const message=typeof payload?.error==='string'?payload.error:'Não foi possível concluir a operação na DocWallet.';
    if(response.status===401)throw new ApiError(502,'docwallet_bridge_unauthorized','Bridge DocWallet recusou a credencial de serviço.');
    if([403,409,503].includes(response.status))throw new ApiError(409,code,message);
    throw new ApiError(502,code,message);
  }
  return payload;
}

export async function registerDocWalletContractRoutes(app:FastifyInstance){
  app.get('/v1/contracts/templates',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const payload=await docwallet(ctx.workspaceId,'/api/internal/nexoffice/contracts/templates');
    const templates=Array.isArray(payload?.templates)?payload.templates.map((item:any)=>({id:String(item?.id||''),name:String(item?.name||''),category:String(item?.category||'')})).filter((item:any)=>item.id&&item.name):[];
    return{configured:true,provider:'docwallet',templates,contentStoredInDocWalletOnly:true,externalEffects:false};
  });

  app.post('/v1/contracts/create',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const input=CreateContract.parse(req.body);
    let existingOperation:any=null;
    if(input.operationId){
      existingOperation=(await query<any>(`select id,contact_id,deal_id,document_ref_id,title from business_operations where id=$1 and workspace_id=$2`,[input.operationId,ctx.workspaceId]))[0];
      if(!existingOperation)throw new ApiError(404,'operation_not_found','Operação Comercial não encontrada neste workspace.');
      if(existingOperation.document_ref_id)throw new ApiError(409,'operation_contract_already_linked','Esta Operação Comercial já possui contrato vinculado.');
      if(input.contactId&&existingOperation.contact_id&&input.contactId!==existingOperation.contact_id)throw new ApiError(409,'operation_contact_mismatch','O contato informado não corresponde ao cliente da Operação Comercial.');
    }
    const effectiveContactId=input.contactId||existingOperation?.contact_id||null;
    if(effectiveContactId){
      const contact=(await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[effectiveContactId,ctx.workspaceId]))[0];
      if(!contact)throw new ApiError(404,'contact_not_found','Contato não encontrado neste workspace.');
    }
    if(input.createBusinessOperation&&!effectiveContactId)throw new ApiError(409,'operation_contact_required','Escolha um cliente para criar a Operação Comercial.');
    if(input.dealId){
      const deal=(await query<any>(`select id,contact_id from crm_deals where id=$1 and workspace_id=$2`,[input.dealId,ctx.workspaceId]))[0];
      if(!deal)throw new ApiError(404,'deal_not_found','Oportunidade não encontrada neste workspace.');
      if(effectiveContactId&&deal.contact_id&&deal.contact_id!==effectiveContactId)throw new ApiError(409,'deal_contact_mismatch','A oportunidade selecionada pertence a outro contato.');
    }

    const payload=await docwallet(ctx.workspaceId,'/api/internal/nexoffice/contracts/create',{
      method:'POST',
      headers:{'x-idempotency-key':input.idempotencyKey},
      body:JSON.stringify({type:input.templateId,party_a:input.partyA,party_b:input.partyB,description:input.description}),
    });
    const remoteContract=payload?.contract||{},remoteDocument=payload?.document||{};
    const externalRef=String(remoteDocument?.id||'');
    const contractId=String(remoteContract?.id||'');
    const title=String(remoteContract?.title||remoteDocument?.name||'Contrato DocWallet').slice(0,255);
    if(!externalRef||!contractId)throw new ApiError(502,'invalid_docwallet_contract_response','DocWallet não retornou as referências esperadas.');

    const metadata={
      source:'nexoffice_contract_creator',
      contractId,
      contractType:String(remoteContract?.contractType||input.templateId),
      contractStatus:String(remoteContract?.status||'draft'),
      contentHash:String(remoteContract?.contentHash||''),
      fileHash:String(remoteDocument?.fileHash||''),
      contentStoredInDocWalletOnly:true,
      contentReturned:false,
      signatureRequested:false,
      externalEffects:false,
    };

    const saved=await transaction(async client=>{
      const ref=(await client.query<any>(`insert into document_refs(workspace_id,contact_id,provider,external_ref,title,status,document_type,metadata) values($1,$2,'docwallet',$3,$4,'draft','contract',$5) on conflict(workspace_id,provider,external_ref) do update set contact_id=coalesce(excluded.contact_id,document_refs.contact_id),title=excluded.title,status=excluded.status,document_type=excluded.document_type,metadata=excluded.metadata,updated_at=now() returning *`,[ctx.workspaceId,effectiveContactId,externalRef,title,JSON.stringify(metadata)])).rows[0];
      let operation:any=null;
      if(existingOperation){
        operation=(await client.query<any>(`update business_operations set document_ref_id=$3,status=case when status='draft' then 'contract_ready' else status end,metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[existingOperation.id,ctx.workspaceId,ref.id,JSON.stringify({contractProvider:'docwallet',contractExternalRef:externalRef,contractId})])).rows[0];
      }else if(input.createBusinessOperation){
        operation=(await client.query<any>(`select * from business_operations where workspace_id=$1 and document_ref_id=$2 limit 1`,[ctx.workspaceId,ref.id])).rows[0]||null;
        if(!operation)operation=(await client.query<any>(`insert into business_operations(workspace_id,contact_id,deal_id,document_ref_id,title,description,amount_minor,due_at,status,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,'contract_ready',$9) returning *`,[ctx.workspaceId,effectiveContactId,input.dealId||null,ref.id,title,input.description,input.amountMinor||0,input.dueAt||null,JSON.stringify({contractEngine:'docwallet',contractId,contractExternalRef:externalRef,fiscalEngine:'taxagent',collectionMode:'owner_pix',communicationEngine:'smartbots',source:'contract_creator'})])).rows[0];
      }
      return{ref,operation};
    });

    await auditLog(ctx,'document.contract.created','document_ref',saved.ref.id,null,{provider:'docwallet',externalRef,contractId,contractType:metadata.contractType,contentStoredInDocWalletOnly:true,externalEffect:false,businessOperationId:saved.operation?.id||null});
    if(saved.operation)await auditLog(ctx,existingOperation?'business_operation.document_linked':'business_operation.created_from_contract','business_operation',saved.operation.id,null,{documentRefId:saved.ref.id,contractId,externalEffect:false});
    return{contract:{id:contractId,title,type:metadata.contractType,status:metadata.contractStatus,contentHash:metadata.contentHash},document:saved.ref,operation:saved.operation,privacy:{contentStoredInDocWalletOnly:true,rawContentPersistedInNexOffice:false},signatureRequested:false,externalEffects:false};
  });
}
