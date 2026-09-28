import type {FastifyInstance} from 'fastify';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

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

function fieldValue(field:any,fallback=''){
  const value=field&&typeof field==='object'&&'value' in field?field.value:field;
  return String(value??fallback).trim();
}

export async function registerDocWalletUploadRoutes(app:FastifyInstance){
  app.post('/v1/documents/upload',async req=>{
    const ctx=await workspaceContext(req,'documents.write');
    const cfg=bridgeConfig();
    if(!cfg.configured||!cfg.base)throw new ApiError(409,'docwallet_not_configured','Conecte/configure a DocWallet antes de enviar documentos.');

    const part=await (req as any).file({
      limits:{files:1,fileSize:25*1024*1024},
    });
    if(!part)throw new ApiError(400,'file_required','Escolha um arquivo para enviar.');

    const filename=String(part.filename||'').trim();
    const mimetype=String(part.mimetype||'application/octet-stream');
    if(!filename)throw new ApiError(400,'invalid_filename','O arquivo precisa ter um nome válido.');

    const lower=filename.toLowerCase();
    if(!['.pdf','.png','.jpg','.jpeg','.txt'].some(ext=>lower.endsWith(ext)))throw new ApiError(400,'unsupported_file_type','Formato não suportado. Use PDF, JPG, PNG ou TXT.');

    let buffer:Buffer;
    try{buffer=await part.toBuffer()}catch(error:any){
      if(error?.code==='FST_REQ_FILE_TOO_LARGE')throw new ApiError(413,'file_too_large','O arquivo ultrapassa o limite de 25 MB.');
      throw error;
    }
    if(!buffer.length)throw new ApiError(400,'empty_file','O arquivo enviado está vazio.');

    const fields=part.fields||{};
    const title=fieldValue(fields.name,filename).slice(0,255)||filename;
    const type=fieldValue(fields.type,'document').slice(0,80)||'document';
    const category=fieldValue(fields.category,'signature').slice(0,80)||'signature';
    const contactId=fieldValue(fields.contactId,'')||null;

    if(contactId){
      const contact=(await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[contactId,ctx.workspaceId]))[0];
      if(!contact)throw new ApiError(404,'contact_not_found','Cliente/contato não encontrado neste workspace.');
    }

    const form=new FormData();
    form.append('file',new Blob([buffer],{type:mimetype}),filename);
    form.append('name',title);
    form.append('type',type);
    form.append('category',category);

    const headers=new Headers();
    headers.set('accept','application/json');
    headers.set('x-nexoffice-key',cfg.key);
    headers.set('x-nexoffice-workspace-id',ctx.workspaceId);

    let response:Response;
    try{response=await fetch(`${cfg.base}/api/internal/nexoffice/documents/upload`,{method:'POST',headers,body:form,signal:AbortSignal.timeout(30_000)})}
    catch{throw new ApiError(502,'docwallet_unreachable','DocWallet indisponível neste momento.');}
    const payload=await response.json().catch(()=>({})) as any;
    if(!response.ok){
      const code=String(payload?.code||payload?.error||'docwallet_upload_failed');
      const message=typeof payload?.error==='string'?payload.error:'Não foi possível enviar o documento para a DocWallet.';
      if(response.status===401)throw new ApiError(502,'docwallet_bridge_unauthorized','Bridge DocWallet recusou a credencial de serviço.');
      if([400,403,409,413,503].includes(response.status))throw new ApiError(response.status===503?409:response.status,code,message);
      throw new ApiError(502,code,message);
    }

    const remote=payload?.document||{};
    const externalRef=String(remote?.id||'').trim();
    if(!externalRef)throw new ApiError(502,'invalid_docwallet_upload_response','DocWallet não retornou a referência do documento.');
    const fileHash=String(remote?.fileHash||'');
    const fileSize=Number(remote?.fileSize||buffer.length);
    const fileType=String(remote?.fileType||mimetype);
    const metadata={
      source:'nexoffice_direct_upload',
      fileHash,
      fileSize,
      fileType,
      category:String(remote?.category||category),
      rawFileStoredInDocWalletOnly:true,
      rawFilePersistedInNexOffice:false,
      signatureRequested:false,
      externalEffects:false,
    };

    const ref=(await query<any>(`insert into document_refs(workspace_id,contact_id,provider,external_ref,title,status,document_type,metadata) values($1,$2,'docwallet',$3,$4,'ready',$5,$6) on conflict(workspace_id,provider,external_ref) do update set contact_id=coalesce(excluded.contact_id,document_refs.contact_id),title=excluded.title,status=excluded.status,document_type=excluded.document_type,metadata=document_refs.metadata||excluded.metadata,updated_at=now() returning *`,[ctx.workspaceId,contactId,externalRef,title,type,JSON.stringify(metadata)]))[0];

    await auditLog(ctx,'document.uploaded','document_ref',ref.id,null,{provider:'docwallet',externalRef,fileSize,fileType,rawFileStoredInDocWalletOnly:true,externalEffect:false});
    return{document:ref,privacy:{rawFileStoredInDocWalletOnly:true,rawFilePersistedInNexOffice:false,rawFileReturned:false},signatureRequested:false,externalEffects:false};
  });
}
