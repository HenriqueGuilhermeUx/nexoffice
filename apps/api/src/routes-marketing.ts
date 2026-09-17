import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {ModoMarketingError,modoMarketingConfigured,modoMarketingRequest} from './modo-marketing-adapter.js';

const briefSchema=z.object({business:z.string().min(2).max(160),offer:z.string().min(2).max(240),objective:z.string().min(2).max(80).default('Gerar novos clientes'),location:z.string().min(2).max(160).default('Brasil'),monthlyBudget:z.number().nonnegative(),ticket:z.number().nonnegative().optional(),customerDescription:z.string().max(1200).optional(),provider:z.enum(['google_ads','meta_ads']).default('google_ads'),generateLanding:z.boolean().default(true)});
const prospectingCampaignSchema=z.object({name:z.string().max(160).optional(),segment:z.string().min(1).max(240),roles:z.array(z.string().min(1).max(120)).max(20).default([]),location:z.string().max(160).optional(),companySize:z.string().max(120).optional(),offer:z.string().max(600).optional(),notes:z.string().max(1600).optional()});
const prospectingLeadSchema=z.object({name:z.string().min(1).max(180),role:z.string().max(160).optional(),company:z.string().min(1).max(180),email:z.string().email().optional(),linkedinUrl:z.string().url().optional(),websiteUrl:z.string().url().optional(),location:z.string().max(160).optional(),fitScore:z.number().min(0).max(100).optional(),reason:z.string().max(1000).optional(),signal:z.string().max(1000).optional(),source:z.string().max(80).optional(),sourceRef:z.string().max(600).optional(),metadata:z.record(z.string(),z.unknown()).optional()});
const discoverySchema=z.object({approved:z.literal(true),limit:z.coerce.number().int().min(1).max(50).default(20)});
const approachSchema=z.object({channel:z.enum(['email','linkedin','whatsapp']).default('email')});
const contentDraftSchema=z.object({
  contentType:z.enum(['static_post','story','carousel','short_video_script','channel_adaptation']),
  objective:z.enum(['autoridade','demanda','relacionamento','conversao','educacao']),
  brief:z.string().trim().min(10).max(2000),
  channel:z.string().trim().min(2).max(60).default('Instagram'),
  niche:z.enum(['saude_estetica','servicos_profissionais','imoveis','varejo','educacao','creator','outro']).default('outro'),
  websiteUrl:z.union([z.literal(''),z.string().url().max(500)]).optional().default(''),
  instagramHandle:z.string().trim().max(80).optional().default('')
});
const marketRadarSchema=z.object({
  approved:z.literal(true),
  name:z.string().trim().min(3).max(140).optional(),
  objective:z.string().trim().min(3).max(1200),
  regions:z.array(z.string().trim().min(2).max(180)).max(20).default([]),
  keywords:z.array(z.string().trim().min(2).max(180)).max(40).default([]),
  competitors:z.array(z.string().trim().min(2).max(1000)).max(40).default([]),
  maxItems:z.coerce.number().int().min(1).max(500).default(50),
  niche:z.string().trim().max(240).optional(),
  websiteUrl:z.union([z.literal(''),z.string().url().max(1000)]).optional(),
  instagramHandle:z.string().trim().max(160).optional()
}).refine(value=>value.keywords.length>0||value.competitors.length>0,{message:'Informe termos de mercado ou concorrentes para o radar.',path:['keywords']});
function fail(error:unknown){if(error instanceof ModoMarketingError)throw Object.assign(new Error(error.message),{statusCode:error.status,code:error.code,payload:error.payload});throw error}

export async function registerMarketingRoutes(app:FastifyInstance){
  app.get('/v1/marketing/status',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    if(!modoMarketingConfigured())return {configured:false,provider:'modo',contract:'nexoffice-marketing-v1',externalCampaignActivation:false,externalProspectingOutreach:false,projects:[],campaigns:[],connections:[],prospectingCampaigns:[],insights:null};
    try{
      const [health,projects,campaigns,connections,prospectingCampaigns]=await Promise.all([modoMarketingRequest(ctx.workspaceId,'health'),modoMarketingRequest(ctx.workspaceId,'demand/projects'),modoMarketingRequest(ctx.workspaceId,'campaigns'),modoMarketingRequest(ctx.workspaceId,'media/connections'),modoMarketingRequest(ctx.workspaceId,'prospecting/campaigns')]);
      let insights:any=null;try{insights=await modoMarketingRequest(ctx.workspaceId,'insights?days=30')}catch{}
      return {configured:true,provider:'modo',health,projects,campaigns,connections,prospectingCampaigns,insights,externalCampaignActivation:false,externalProspectingOutreach:false};
    }catch(e){return fail(e)}
  });

  app.get('/v1/marketing/insights',async req=>{const ctx=await workspaceContext(req,'integrations.read'),days=Math.min(90,Math.max(1,Number((req.query as any)?.days||30)));try{return await modoMarketingRequest(ctx.workspaceId,`insights?days=${days}`)}catch(e){return fail(e)}});

  app.post('/v1/marketing/brief',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage'),input=briefSchema.parse(req.body);
    try{
      const project=await modoMarketingRequest<any>(ctx.workspaceId,'demand/projects','POST',{name:`${input.business} · ${input.offer}`,business:input.business,offer:input.offer,objective:input.objective,location:input.location,monthlyBudget:input.monthlyBudget,ticket:input.ticket||0});
      const plan=await modoMarketingRequest<any>(ctx.workspaceId,'ads/plan','POST',{business:input.business,offer:input.offer,objective:input.objective,location:input.location,budget:input.monthlyBudget,ticket:input.ticket||0,customerDescription:input.customerDescription||''});
      const campaign=await modoMarketingRequest<any>(ctx.workspaceId,'campaigns','POST',{projectId:project.id,provider:input.provider,name:`${input.business} | ${input.offer}`,monthlyBudget:input.monthlyBudget,plan});
      let landing:any=null;if(input.generateLanding){try{landing=await modoMarketingRequest(ctx.workspaceId,`demand/projects/${project.id}/landing`,'POST',{})}catch{landing=null}}
      await auditLog(ctx,'marketing.brief.created','workspace',ctx.workspaceId,null,{projectId:project.id,campaignId:campaign.id,provider:input.provider,monthlyBudget:input.monthlyBudget,externalEffect:false});
      return {project,plan,campaign,landing,governance:{workflow:['draft','review','ready'],requiresExplicitApproval:true,requiresAuthorizedMediaAccount:true,externalCampaignActivation:false}};
    }catch(e){return fail(e)}
  });

  app.post('/v1/marketing/projects/:id/landing',async req=>{const ctx=await workspaceContext(req,'integrations.manage');try{return await modoMarketingRequest(ctx.workspaceId,`demand/projects/${z.string().uuid().parse((req.params as any).id)}/landing`,'POST',{})}catch(e){return fail(e)}});
  app.get('/v1/marketing/projects/:id/funnel',async req=>{const ctx=await workspaceContext(req,'integrations.read');try{return await modoMarketingRequest(ctx.workspaceId,`demand/projects/${z.string().uuid().parse((req.params as any).id)}/funnel`)}catch(e){return fail(e)}});
  app.get('/v1/marketing/projects/:id/leads',async req=>{const ctx=await workspaceContext(req,'integrations.read');try{return await modoMarketingRequest(ctx.workspaceId,`demand/projects/${z.string().uuid().parse((req.params as any).id)}/leads`)}catch(e){return fail(e)}});
  app.post('/v1/marketing/projects/:id/outcomes',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id),input=z.object({eventName:z.enum(['qualified_lead','customer']),sessionId:z.string().max(128).optional(),utm:z.record(z.string(),z.unknown()).optional(),metadata:z.record(z.string(),z.unknown()).optional()}).parse(req.body);try{const result=await modoMarketingRequest(ctx.workspaceId,`demand/projects/${id}/outcomes`,'POST',input);await auditLog(ctx,'marketing.outcome.recorded','marketing_project',id,null,{eventName:input.eventName,externalEffect:false});return result}catch(e){return fail(e)}});

  app.post('/v1/marketing/media/:provider/prepare',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),provider=z.enum(['google_ads','meta_ads']).parse((req.params as any).provider);try{const prepared=await modoMarketingRequest<any>(ctx.workspaceId,`media/connections/${provider}/prepare`,'POST',{});await auditLog(ctx,'marketing.media.prepare','workspace',ctx.workspaceId,null,{provider,externalEffect:false,officialOAuthRequired:true,oauthReady:Boolean(prepared?.authorization?.authorizationUrl)});return prepared}catch(e){return fail(e)}});
  app.post('/v1/marketing/media/google_ads/connections/:id/select-account',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id),input=z.object({customerId:z.string().min(1),accountName:z.string().max(160).optional()}).parse(req.body);try{const result=await modoMarketingRequest(ctx.workspaceId,`media/google_ads/connections/${id}/select-account`,'POST',input);await auditLog(ctx,'marketing.google_ads.connected','workspace',ctx.workspaceId,null,{connectionId:id,customerId:input.customerId,externalEffect:false,oauthVerified:true});return result}catch(e){return fail(e)}});
  app.get('/v1/marketing/media/google_ads/metrics',async req=>{const ctx=await workspaceContext(req,'integrations.read'),days=Math.min(90,Math.max(1,Number((req.query as any)?.days||30)));try{return await modoMarketingRequest(ctx.workspaceId,`media/google_ads/metrics?days=${days}`)}catch(e){return fail(e)}});

  app.post('/v1/marketing/campaigns/:id/review',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id);try{const result=await modoMarketingRequest(ctx.workspaceId,`campaigns/${id}/review`,'POST',{});await auditLog(ctx,'marketing.campaign.review','marketing_campaign',id,null,{externalEffect:false});return result}catch(e){return fail(e)}});
  app.post('/v1/marketing/campaigns/:id/ready',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id),input=z.object({approved:z.literal(true)}).parse(req.body);try{const result=await modoMarketingRequest(ctx.workspaceId,`campaigns/${id}/ready`,'POST',input);await auditLog(ctx,'marketing.campaign.ready','marketing_campaign',id,null,{clientApproved:true,externalEffect:false});return result}catch(e){return fail(e)}});

  app.get('/v1/marketing/prospecting/campaigns',async req=>{const ctx=await workspaceContext(req,'integrations.read');try{return await modoMarketingRequest(ctx.workspaceId,'prospecting/campaigns')}catch(e){return fail(e)}});
  app.post('/v1/marketing/prospecting/campaigns',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),input=prospectingCampaignSchema.parse(req.body);try{const result=await modoMarketingRequest<any>(ctx.workspaceId,'prospecting/campaigns','POST',input);await auditLog(ctx,'marketing.prospecting.campaign.created','workspace',ctx.workspaceId,null,{campaignId:result?.id||null,segment:input.segment,externalEffect:false,externalCommunication:false});return result}catch(e){return fail(e)}});
  app.get('/v1/marketing/prospecting/campaigns/:id/leads',async req=>{const ctx=await workspaceContext(req,'integrations.read'),id=z.string().uuid().parse((req.params as any).id);try{return await modoMarketingRequest(ctx.workspaceId,`prospecting/campaigns/${id}/leads`)}catch(e){return fail(e)}});
  app.post('/v1/marketing/prospecting/campaigns/:id/leads',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id),input=prospectingLeadSchema.parse(req.body);try{const result=await modoMarketingRequest(ctx.workspaceId,`prospecting/campaigns/${id}/leads`,'POST',input);await auditLog(ctx,'marketing.prospecting.lead.added','prospecting_campaign',id,null,{externalEffect:false,externalCommunication:false});return result}catch(e){return fail(e)}});
  app.post('/v1/marketing/prospecting/campaigns/:id/discover',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id),input=discoverySchema.parse(req.body);try{const result=await modoMarketingRequest<any>(ctx.workspaceId,`prospecting/campaigns/${id}/discover`,'POST',input);await auditLog(ctx,'marketing.prospecting.discovery','prospecting_campaign',id,null,{explicitApproval:true,limit:input.limit,provider:result?.provider||null,externalCommunication:false,providerCompute:true});return result}catch(e){return fail(e)}});
  app.post('/v1/marketing/prospecting/leads/:id/approach',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),id=z.string().uuid().parse((req.params as any).id),input=approachSchema.parse(req.body||{});try{const result=await modoMarketingRequest(ctx.workspaceId,`prospecting/leads/${id}/approach`,'POST',input);await auditLog(ctx,'marketing.prospecting.approach.prepared','prospecting_lead',id,null,{channel:input.channel,externalEffect:false,externalCommunication:false});return result}catch(e){return fail(e)}});

  app.get('/v1/marketing/content/drafts',async req=>{const ctx=await workspaceContext(req,'integrations.read');try{return await modoMarketingRequest(ctx.workspaceId,'content/drafts')}catch(e){return fail(e)}});
  app.get('/v1/marketing/content/drafts/:id',async req=>{const ctx=await workspaceContext(req,'integrations.read'),id=z.string().uuid().parse((req.params as any).id);try{return await modoMarketingRequest(ctx.workspaceId,`content/drafts/${id}`)}catch(e){return fail(e)}});
  app.post('/v1/marketing/content/drafts',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),input=contentDraftSchema.parse(req.body);try{const result=await modoMarketingRequest<any>(ctx.workspaceId,'content/drafts','POST',{brandName:ctx.workspaceName,niche:input.niche,websiteUrl:input.websiteUrl,instagramHandle:input.instagramHandle,contentType:input.contentType,objective:input.objective,brief:input.brief,channel:input.channel});await auditLog(ctx,'marketing.content.draft.created','workspace',ctx.workspaceId,null,{contentRequestId:result?.request?.id||null,contentType:input.contentType,objective:input.objective,channel:input.channel,billingMode:'nexoffice_entitlement',modoCreditsCharged:0,externalEffect:false,externalPublication:false});return result}catch(e){return fail(e)}});

  app.get('/v1/marketing/market-radar/missions',async req=>{const ctx=await workspaceContext(req,'integrations.read');try{return await modoMarketingRequest(ctx.workspaceId,'intelligence/market-radar/missions')}catch(e){return fail(e)}});
  app.get('/v1/marketing/market-radar/missions/:id/results',async req=>{const ctx=await workspaceContext(req,'integrations.read'),id=z.string().uuid().parse((req.params as any).id),limit=Math.min(200,Math.max(1,Number((req.query as any)?.limit||50)));try{return await modoMarketingRequest(ctx.workspaceId,`intelligence/market-radar/missions/${id}/results?limit=${limit}`)}catch(e){return fail(e)}});
  app.post('/v1/marketing/market-radar/missions',async req=>{const ctx=await workspaceContext(req,'integrations.manage'),input=marketRadarSchema.parse(req.body);try{const result=await modoMarketingRequest<any>(ctx.workspaceId,'intelligence/market-radar/missions','POST',{approved:true,name:input.name||`Radar de Mercado · ${ctx.workspaceName}`,objective:input.objective,brandName:ctx.workspaceName,niche:input.niche||'',websiteUrl:input.websiteUrl||'',instagramHandle:input.instagramHandle||'',regions:input.regions,keywords:input.keywords,competitors:input.competitors,maxItems:input.maxItems});await auditLog(ctx,'marketing.market_radar.collection_requested','workspace',ctx.workspaceId,null,{missionId:result?.mission?.id||null,explicitApproval:true,providerCompute:Boolean(result?.governance?.providerCompute),externalCommunication:false,externalEffect:false});return result}catch(e){return fail(e)}});
}