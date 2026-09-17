import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {ModoMarketingError,modoMarketingConfigured,modoMarketingRequest} from './modo-marketing-adapter.js';

const briefSchema=z.object({business:z.string().min(2).max(160),offer:z.string().min(2).max(240),objective:z.string().min(2).max(80).default('Gerar novos clientes'),location:z.string().min(2).max(160).default('Brasil'),monthlyBudget:z.number().nonnegative(),ticket:z.number().nonnegative().optional(),customerDescription:z.string().max(1200).optional(),provider:z.enum(['google_ads','meta_ads']).default('google_ads'),generateLanding:z.boolean().default(true)});
function fail(error:unknown){if(error instanceof ModoMarketingError)throw Object.assign(new Error(error.message),{statusCode:error.status,code:error.code,payload:error.payload});throw error}

export async function registerMarketingRoutes(app:FastifyInstance){
  app.get('/v1/marketing/status',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    if(!modoMarketingConfigured())return {configured:false,provider:'modo',contract:'nexoffice-marketing-v1',externalCampaignActivation:false,projects:[],campaigns:[],connections:[],insights:null};
    try{
      const [health,projects,campaigns,connections]=await Promise.all([modoMarketingRequest(ctx.workspaceId,'health'),modoMarketingRequest(ctx.workspaceId,'demand/projects'),modoMarketingRequest(ctx.workspaceId,'campaigns'),modoMarketingRequest(ctx.workspaceId,'media/connections')]);
      let insights:any=null;try{insights=await modoMarketingRequest(ctx.workspaceId,'insights?days=30')}catch{}
      return {configured:true,provider:'modo',health,projects,campaigns,connections,insights,externalCampaignActivation:false};
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
}
