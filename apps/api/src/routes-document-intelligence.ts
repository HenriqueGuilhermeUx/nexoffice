import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {readDocWalletAlerts,readDocWalletIntelligence,readDocWalletUpcomingExpirations} from './docwallet-intelligence-adapter.js';

const uuid=z.string().uuid();

async function docRef(workspaceId:string,id:string){
  const row=(await query<any>(`select id,provider,external_ref,title,document_type,status,contact_id,metadata from document_refs where id=$1 and workspace_id=$2 limit 1`,[id,workspaceId]))[0];
  if(!row)throw new ApiError(404,'document_not_found','Documento não encontrado.');
  if(String(row.provider)!=='docwallet')throw new ApiError(409,'document_provider_not_supported','Esta referência documental não usa DocWallet.');
  return row;
}

function unwrap(result:any){
  if(result?.ok)return result.payload;
  const status=Number(result?.httpStatus||503);
  if(status===403)throw new ApiError(403,'docwallet_workspace_not_connected','Este documento não está autorizado para o workspace no DocWallet.');
  if(status===404)throw new ApiError(404,'docwallet_document_not_found','Documento não encontrado no DocWallet.');
  throw new ApiError(status>=400&&status<600?status:503,'docwallet_unavailable',String(result?.error||'DocWallet indisponível.'));
}

export async function registerDocumentIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/documents/upcoming-expirations',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const days=z.coerce.number().int().min(1).max(365).default(60).parse((req.query as any)?.days);
    return unwrap(await readDocWalletUpcomingExpirations(ctx.workspaceId,days));
  });

  app.get('/v1/documents/:id/intelligence',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const id=uuid.parse((req.params as any).id),ref=await docRef(ctx.workspaceId,id);
    const payload=unwrap(await readDocWalletIntelligence(ctx.workspaceId,String(ref.external_ref)));
    return {document:{id:ref.id,title:ref.title,type:ref.document_type,status:ref.status},...payload};
  });

  app.get('/v1/documents/:id/alerts',async req=>{
    const ctx=await workspaceContext(req,'documents.read');
    const id=uuid.parse((req.params as any).id),ref=await docRef(ctx.workspaceId,id);
    const payload=unwrap(await readDocWalletAlerts(ctx.workspaceId,String(ref.external_ref)));
    return {document:{id:ref.id,title:ref.title,type:ref.document_type,status:ref.status},...payload};
  });
}
