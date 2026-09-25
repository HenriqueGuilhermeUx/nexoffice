import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const CreateContract=z.object({
  templateId:z.string().trim().min(1).max(80),
  partyA:z.string().trim().min(1).max(255),
  partyB:z.string().trim().min(1).max(255),
  description:z.string().trim().min(1).max(8000),
  contactId:uuid.nullable().optional(),
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
    if(response.status===403)throw new ApiError(409,code,message);
    if(response.status===409)throw new ApiError(409,code,message);
    if(response.status===503)throw new ApiError(409,code,message);
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
    if(input.contactId){
      const contact=(await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[input.contactId,ctx.workspaceId]))[0];
      if(!contact)throw new ApiError(404,'contact_not_found','Contato não encontrado neste workspace.');
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
    const rows=await query<any>(`insert into document_refs(workspace_id,contact_id,provider,external_ref,title,status,document_type,metadata) values($1,$2,'docwallet',$3,$4,'draft','contract',$5) on conflict(workspace_id,provider,external_ref) do update set contact_id=excluded.contact_id,title=excluded.title,status=excluded.status,document_type=excluded.document_type,metadata=excluded.metadata,updated_at=now() returning *`,[ctx.workspaceId,input.contactId||null,externalRef,title,JSON.stringify(metadata)]);
    const ref=rows[0];
    await auditLog(ctx,'document.contract.created','document_ref',ref.id,null,{provider:'docwallet',externalRef,contractId,contractType:metadata.contractType,contentStoredInDocWalletOnly:true,externalEffect:false});
    return{contract:{id:contractId,title,type:metadata.contractType,status:metadata.contractStatus,contentHash:metadata.contentHash},document:ref,privacy:{contentStoredInDocWalletOnly:true,rawContentPersistedInNexOffice:false},signatureRequested:false,externalEffects:false};
  });
}
