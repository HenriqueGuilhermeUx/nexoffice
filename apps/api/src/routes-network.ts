import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const profileInput=z.object({
  displayName:z.string().trim().min(2).max(160),
  headline:z.string().trim().max(220).optional().nullable(),
  bio:z.string().trim().max(3000).optional().nullable(),
  categories:z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  specialties:z.array(z.string().trim().min(1).max(100)).max(24).default([]),
  serviceRegions:z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  remoteAvailable:z.boolean().default(true),
  status:z.enum(['draft','published','paused']).default('draft')
});
const serviceInput=z.object({title:z.string().trim().min(2).max(160),category:z.string().trim().min(2).max(80),description:z.string().trim().min(10).max(2500),pricingModel:z.enum(['quote','fixed','monthly','hourly']).default('quote'),startingPriceMinor:z.number().int().min(0).optional().nullable(),capabilities:z.array(z.string().trim().min(1).max(80)).max(20).default([]),active:z.boolean().default(true)});

export async function registerNetworkRoutes(app:FastifyInstance){
  app.get('/v1/network/providers',async req=>{
    await workspaceContext(req,'workspace.read');
    const q=String((req.query as any)?.q||'').trim().toLowerCase().slice(0,100),category=String((req.query as any)?.category||'').trim().toLowerCase().slice(0,80);
    return query<any>(`select p.id,p.workspace_id,p.display_name,p.headline,p.bio,p.categories,p.specialties,p.service_regions,p.remote_available,p.published_at,w.vertical,
      coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'category',s.category,'description',s.description,'pricingModel',s.pricing_model,'startingPriceMinor',s.starting_price_minor,'currency',s.currency,'capabilities',s.capabilities) order by s.created_at) from provider_services s where s.provider_workspace_id=p.workspace_id and s.active=true),'[]'::jsonb) services,
      coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'summary',i.summary,'outcomeSummary',i.outcome_summary,'referenceUrl',i.reference_url) order by i.sort_order,i.created_at) from provider_portfolio_items i where i.provider_workspace_id=p.workspace_id and i.active=true),'[]'::jsonb) portfolio
      from provider_profiles p join workspaces w on w.id=p.workspace_id
      where p.status='published' and w.status='active'
      and ($1='' or lower(p.display_name||' '||coalesce(p.headline,'')||' '||coalesce(p.bio,'')||' '||array_to_string(p.specialties,' ')) like '%'||$1||'%')
      and ($2='' or exists(select 1 from unnest(p.categories) c where lower(c)=$2) or exists(select 1 from provider_services s where s.provider_workspace_id=p.workspace_id and s.active=true and lower(s.category)=$2))
      order by p.published_at desc nulls last,p.updated_at desc limit 100`,[q,category]);
  });

  app.get('/v1/network/provider/me',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const profile=(await query<any>(`select * from provider_profiles where workspace_id=$1`,[ctx.workspaceId]))[0]||null;
    const [services,portfolio]=await Promise.all([query<any>(`select * from provider_services where provider_workspace_id=$1 order by created_at desc`,[ctx.workspaceId]),query<any>(`select * from provider_portfolio_items where provider_workspace_id=$1 order by sort_order,created_at desc`,[ctx.workspaceId])]);
    return {profile,services,portfolio,eligibility:{workspaceSubscriber:true,workspaceId:ctx.workspaceId,note:'O perfil pertence a um workspace NexOffice. Add-ons como MODO e TaxAgent podem gerar badges/capabilities em etapas seguintes.'}};
  });

  app.put('/v1/network/provider/me',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),input=profileInput.parse(req.body);
    const workspace=(await query<any>(`select status from workspaces where id=$1`,[ctx.workspaceId]))[0];
    if(input.status==='published'&&workspace?.status!=='active')throw new ApiError(409,'workspace_not_active','Somente um workspace ativo pode publicar um perfil na Rede NexOffice.');
    const before=(await query<any>(`select * from provider_profiles where workspace_id=$1`,[ctx.workspaceId]))[0]||null;
    const rows=await query<any>(`insert into provider_profiles(workspace_id,display_name,headline,bio,categories,specialties,service_regions,remote_available,status,published_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $9='published' then now() else null end) on conflict(workspace_id) do update set display_name=excluded.display_name,headline=excluded.headline,bio=excluded.bio,categories=excluded.categories,specialties=excluded.specialties,service_regions=excluded.service_regions,remote_available=excluded.remote_available,status=excluded.status,published_at=case when excluded.status='published' then coalesce(provider_profiles.published_at,now()) else provider_profiles.published_at end,updated_at=now() returning *`,[ctx.workspaceId,input.displayName,input.headline||null,input.bio||null,input.categories,input.specialties,input.serviceRegions,input.remoteAvailable,input.status]);
    await auditLog(ctx,'network.provider_profile.updated','provider_profile',rows[0].id,before,rows[0]);return rows[0];
  });

  app.post('/v1/network/provider/services',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),input=serviceInput.parse(req.body);
    const profile=(await query<any>(`select id from provider_profiles where workspace_id=$1`,[ctx.workspaceId]))[0];if(!profile)throw new ApiError(409,'provider_profile_required','Crie seu perfil profissional antes de cadastrar serviços.');
    const rows=await query<any>(`insert into provider_services(provider_workspace_id,title,category,description,pricing_model,starting_price_minor,capabilities,active) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[ctx.workspaceId,input.title,input.category,input.description,input.pricingModel,input.startingPriceMinor??null,input.capabilities,input.active]);
    await auditLog(ctx,'network.provider_service.created','provider_service',rows[0].id,null,rows[0]);return rows[0];
  });

  app.patch('/v1/network/provider/services/:id',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id),input=serviceInput.partial().parse(req.body);
    const before=(await query<any>(`select * from provider_services where id=$1 and provider_workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'not_found','Serviço não encontrado.');
    const rows=await query<any>(`update provider_services set title=$3,category=$4,description=$5,pricing_model=$6,starting_price_minor=$7,capabilities=$8,active=$9,updated_at=now() where id=$1 and provider_workspace_id=$2 returning *`,[id,ctx.workspaceId,input.title??before.title,input.category??before.category,input.description??before.description,input.pricingModel??before.pricing_model,input.startingPriceMinor===undefined?before.starting_price_minor:input.startingPriceMinor,input.capabilities??before.capabilities,input.active??before.active]);
    await auditLog(ctx,'network.provider_service.updated','provider_service',id,before,rows[0]);return rows[0];
  });

  app.post('/v1/network/provider/portfolio',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');const input=z.object({title:z.string().trim().min(2).max(160),summary:z.string().trim().min(10).max(2000),outcomeSummary:z.string().trim().max(1000).optional().nullable(),referenceUrl:z.string().url().max(1000).optional().nullable()}).parse(req.body);
    const rows=await query<any>(`insert into provider_portfolio_items(provider_workspace_id,title,summary,outcome_summary,reference_url) values($1,$2,$3,$4,$5) returning *`,[ctx.workspaceId,input.title,input.summary,input.outcomeSummary||null,input.referenceUrl||null]);
    await auditLog(ctx,'network.portfolio.created','provider_portfolio_item',rows[0].id,null,rows[0]);return rows[0];
  });

  app.get('/v1/network/requests',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    return query<any>(`select r.*,pp.display_name provider_name,rw.name requester_name,s.title service_title,d.external_ref contract_external_ref,d.status contract_status,d.signature_status contract_signature_status from provider_requests r join workspaces rw on rw.id=r.requester_workspace_id left join provider_profiles pp on pp.workspace_id=r.provider_workspace_id left join provider_services s on s.id=r.service_id left join document_refs d on d.id=r.document_ref_id where r.requester_workspace_id=$1 or r.provider_workspace_id=$1 order by r.created_at desc limit 300`,[ctx.workspaceId]);
  });

  app.post('/v1/network/requests',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');const input=z.object({providerWorkspaceId:uuid,serviceId:uuid.optional().nullable(),contactId:uuid.optional().nullable(),title:z.string().trim().min(2).max(180),needSummary:z.string().trim().min(10).max(4000),budgetMinor:z.number().int().min(0).optional().nullable()}).parse(req.body);
    if(input.providerWorkspaceId===ctx.workspaceId)throw new ApiError(409,'self_request_not_allowed','Não é possível solicitar seu próprio serviço.');
    const provider=(await query<any>(`select workspace_id from provider_profiles where workspace_id=$1 and status='published'`,[input.providerWorkspaceId]))[0];if(!provider)throw new ApiError(404,'provider_not_found','Prestador não encontrado ou não publicado.');
    if(input.serviceId){const service=(await query<any>(`select id from provider_services where id=$1 and provider_workspace_id=$2 and active=true`,[input.serviceId,input.providerWorkspaceId]))[0];if(!service)throw new ApiError(404,'service_not_found','Serviço não encontrado ou indisponível.');}
    const rows=await query<any>(`insert into provider_requests(requester_workspace_id,provider_workspace_id,service_id,contact_id,requested_by,title,need_summary,budget_minor,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[ctx.workspaceId,input.providerWorkspaceId,input.serviceId||null,input.contactId||null,ctx.user.id,input.title,input.needSummary,input.budgetMinor??null,JSON.stringify({contractEngine:'docwallet',paymentMode:'owner_controlled'})]);
    await auditLog(ctx,'network.service_requested','provider_request',rows[0].id,null,{...rows[0],need_summary:'[private between workspaces]'});return rows[0];
  });

  app.patch('/v1/network/requests/:id/status',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id),input=z.object({status:z.enum(['accepted','declined','in_progress','completed','cancelled'])}).parse(req.body);
    const before=(await query<any>(`select * from provider_requests where id=$1 and (requester_workspace_id=$2 or provider_workspace_id=$2)`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'not_found','Solicitação não encontrada.');
    const requester=before.requester_workspace_id===ctx.workspaceId,provider=before.provider_workspace_id===ctx.workspaceId;
    if(input.status==='cancelled'&&!requester)throw new ApiError(403,'forbidden','Somente o solicitante pode cancelar.');
    if(['accepted','declined','in_progress','completed'].includes(input.status)&&!provider)throw new ApiError(403,'forbidden','Somente o prestador pode atualizar este estágio.');
    const allowed:Record<string,string[]>={requested:['accepted','declined','cancelled'],accepted:['in_progress','cancelled'],in_progress:['completed','cancelled'],declined:[],completed:[],cancelled:[]};
    if(!(allowed[String(before.status)]||[]).includes(input.status))throw new ApiError(409,'invalid_transition',`Transição ${before.status} → ${input.status} não permitida.`);
    const rows=await query<any>(`update provider_requests set status=$3,updated_at=now() where id=$1 and (requester_workspace_id=$2 or provider_workspace_id=$2) returning *`,[id,ctx.workspaceId,input.status]);
    await auditLog(ctx,'network.request.status_updated','provider_request',id,before,rows[0]);return rows[0];
  });

  app.post('/v1/network/requests/:id/link-document',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id),input=z.object({documentRefId:uuid}).parse(req.body);
    const request=(await query<any>(`select * from provider_requests where id=$1 and requester_workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!request)throw new ApiError(404,'not_found','Solicitação não encontrada.');
    const doc=(await query<any>(`select id,provider,external_ref from document_refs where id=$1 and workspace_id=$2`,[input.documentRefId,ctx.workspaceId]))[0];if(!doc)throw new ApiError(404,'document_not_found','Documento não encontrado neste workspace.');
    const rows=await query<any>(`update provider_requests set document_ref_id=$3,metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and requester_workspace_id=$2 returning *`,[id,ctx.workspaceId,input.documentRefId,JSON.stringify({contractProvider:doc.provider,contractExternalRef:doc.external_ref})]);
    await auditLog(ctx,'network.request.document_linked','provider_request',id,null,{documentRefId:input.documentRefId,provider:doc.provider});return rows[0];
  });

  app.post('/v1/network/requests/:id/outcomes',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id),input=z.object({summary:z.string().trim().min(5).max(2000),metrics:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({})}).parse(req.body);
    const request=(await query<any>(`select * from provider_requests where id=$1 and requester_workspace_id=$2 and status='completed'`,[id,ctx.workspaceId]))[0];if(!request)throw new ApiError(409,'completed_request_required','Somente o workspace contratante pode registrar resultado de um serviço concluído.');
    const rows=await query<any>(`insert into provider_outcomes(request_id,recorded_by_workspace_id,summary,metrics) values($1,$2,$3,$4) returning *`,[id,ctx.workspaceId,input.summary,JSON.stringify(input.metrics)]);
    await auditLog(ctx,'network.outcome.recorded','provider_outcome',rows[0].id,null,rows[0]);return rows[0];
  });
}
