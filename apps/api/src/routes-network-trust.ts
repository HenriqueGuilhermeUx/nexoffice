import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';

const uuid=z.string().uuid();

function publicTrust(row:any){
  const completed=Number(row?.completed_engagements||0),evidence=Number(row?.operational_evidence||0),outcomes=Number(row?.outcome_records||0),repeat=Number(row?.repeat_clients||0);
  const badges=[{key:'nexoffice_provider',label:'Provider NexOffice'}];
  if(evidence>0)badges.push({key:'operational_evidence',label:'Evidência operacional'});
  if(outcomes>0)badges.push({key:'outcomes_recorded',label:'Outcomes registrados'});
  if(repeat>0)badges.push({key:'repeat_clients',label:'Clientes recorrentes'});
  return {
    workspaceId:String(row?.provider_workspace_id||''),
    completedEngagements:completed,
    distinctClients:Number(row?.distinct_clients||0),
    repeatClients:repeat,
    outcomeRecords:outcomes,
    operationalEvidence:evidence,
    evidenceCoveragePct:Number(row?.evidence_coverage_pct||0),
    outcomeCoveragePct:Number(row?.outcome_coverage_pct||0),
    lastCompletedAt:row?.last_completed_at||null,
    badges
  };
}

const methodology={
  version:'provider-trust-v1',
  ranking:false,
  score:false,
  completedEngagements:'Solicitações da Rede marcadas como concluídas pelo prestador.',
  outcomeRecords:'Resultados registrados pelo workspace contratante após a conclusão.',
  operationalEvidence:'Solicitação concluída com Operação Comercial vinculada marcada como recebida no workspace contratante.',
  repeatClients:'Workspaces contratantes com pelo menos duas solicitações concluídas para o mesmo prestador.',
  caveat:'Evidência operacional não é auditoria independente de pagamento nem garantia de qualidade do serviço. Valores, clientes, documentos e métricas privadas não são expostos.'
} as const;

export async function registerNetworkTrustRoutes(app:FastifyInstance){
  app.get('/v1/network/trust',async req=>{
    await workspaceContext(req,'workspace.read');
    const rows=await query<any>(`select t.* from provider_public_trust_v1 t join provider_profiles p on p.workspace_id=t.provider_workspace_id join workspaces w on w.id=p.workspace_id where p.status='published' and w.status='active' order by p.published_at desc nulls last,p.updated_at desc limit 200`);
    return {providers:rows.map(publicTrust),methodology,privacy:{publicAggregatesOnly:true,clientIdentityExposed:false,revenueAmountExposed:false,rawOutcomeMetricsExposed:false}};
  });

  app.get('/v1/network/provider/me/trust',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const profile=(await query<any>(`select id,status from provider_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];
    if(!profile)throw new ApiError(404,'provider_profile_required','Crie seu perfil profissional para acompanhar evidências da Rede.');
    const row=(await query<any>(`select * from provider_public_trust_v1 where provider_workspace_id=$1`,[ctx.workspaceId]))[0]||{provider_workspace_id:ctx.workspaceId};
    return {trust:publicTrust(row),methodology,profileStatus:profile.status,privacy:{publicViewContainsOnlyAggregates:true}};
  });

  app.get('/v1/network/providers/:workspaceId/trust',async req=>{
    const ctx=await workspaceContext(req,'workspace.read'),providerWorkspaceId=uuid.parse((req.params as any).workspaceId);
    const profile=(await query<any>(`select status from provider_profiles where workspace_id=$1`,[providerWorkspaceId]))[0];
    if(!profile|| (profile.status!=='published'&&providerWorkspaceId!==ctx.workspaceId))throw new ApiError(404,'provider_not_found','Prestador não encontrado ou não publicado.');
    const row=(await query<any>(`select * from provider_public_trust_v1 where provider_workspace_id=$1`,[providerWorkspaceId]))[0]||{provider_workspace_id:providerWorkspaceId};
    return {trust:publicTrust(row),methodology};
  });
}
