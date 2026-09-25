import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {providerCapabilityEvidence,providerCapabilityEvidenceOne} from './network-provider-capabilities.js';

const uuid=z.string().uuid();

export async function registerNetworkCapabilityRoutes(app:FastifyInstance){
  app.get('/v1/network/capabilities',async req=>{
    await workspaceContext(req,'workspace.read');
    const rows=await query<any>(`select p.workspace_id from provider_profiles p join workspaces w on w.id=p.workspace_id where p.status='published' and w.status='active' order by p.published_at desc nulls last,p.updated_at desc limit 200`);
    const ids=rows.map(row=>String(row.workspace_id));
    const evidence=await providerCapabilityEvidence(ids);
    return {
      providers:ids.map(id=>evidence.get(id)).filter(Boolean),
      methodology:{ranking:false,score:false,certification:false,observedEvidenceOnly:true,description:'Capacidades são derivadas de uso operacional observado no NexOffice. Não representam certificação, nota ou garantia de qualidade.'},
      privacy:{clientIdentityExposed:false,amountExposed:false,pixSecretExposed:false,rawDocumentContentExposed:false,fiscalPayloadExposed:false}
    };
  });

  app.get('/v1/network/provider/me/capabilities',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const profile=(await query<any>(`select id from provider_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];
    if(!profile)throw new ApiError(404,'provider_profile_required','Crie seu perfil profissional para acompanhar capacidades observadas.');
    return providerCapabilityEvidenceOne(ctx.workspaceId);
  });

  app.get('/v1/network/providers/:workspaceId/capabilities',async req=>{
    const ctx=await workspaceContext(req,'workspace.read'),providerWorkspaceId=uuid.parse((req.params as any).workspaceId);
    const profile=(await query<any>(`select status from provider_profiles where workspace_id=$1`,[providerWorkspaceId]))[0];
    if(!profile||(profile.status!=='published'&&providerWorkspaceId!==ctx.workspaceId))throw new ApiError(404,'provider_not_found','Prestador não encontrado ou não publicado.');
    return providerCapabilityEvidenceOne(providerWorkspaceId);
  });
}
