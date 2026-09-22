import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {approveCommercialCreative,buildCommercialContext,commercialLearning,createCommercialCampaign,qualityGateCommercialCreative,syncProjectLeadsToCrm} from './commercial-growth.js';

const uuid=z.string().uuid();
const campaignSchema=z.object({
  objective:z.string().trim().min(3).max(120).optional(),
  offer:z.string().trim().min(2).max(240).optional(),
  location:z.string().trim().min(2).max(160).optional(),
  audience:z.string().trim().max(1200).optional(),
  monthlyBudget:z.coerce.number().min(0).max(10_000_000),
  ticket:z.coerce.number().min(0).max(100_000_000).optional(),
  provider:z.enum(['google_ads','meta_ads']).default('google_ads'),
  generateLanding:z.boolean().default(true),
  createCreative:z.boolean().default(true),
});

export async function registerCommercialGrowthRoutes(app:FastifyInstance){
  app.get('/v1/marketing/commercial/context',async req=>{
    const ctx=await workspaceContext(req,'integrations.read');
    return buildCommercialContext(ctx.workspaceId);
  });

  app.post('/v1/marketing/commercial/campaigns',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage'),input=campaignSchema.parse(req.body);
    const result=await createCommercialCampaign(ctx.workspaceId,input);
    await auditLog(ctx,'marketing.commercial.campaign.created','marketing_project',String(result.project?.id||ctx.workspaceId),null,{campaignId:result.campaign?.id||null,provider:input.provider,monthlyBudget:input.monthlyBudget,creativeRequestId:result.creative?.request?.id||null,externalEffect:false,externalCampaignActivation:false});
    return result;
  });

  app.get('/v1/marketing/commercial/creatives/:id/quality',async req=>{
    const ctx=await workspaceContext(req,'integrations.read'),id=uuid.parse((req.params as any).id);
    return qualityGateCommercialCreative(ctx.workspaceId,id);
  });

  app.post('/v1/marketing/commercial/creatives/:id/approve',async req=>{
    const ctx=await workspaceContext(req,'integrations.manage'),id=uuid.parse((req.params as any).id),input=z.object({approved:z.literal(true)}).parse(req.body);
    const result=await approveCommercialCreative(ctx.workspaceId,id);
    await auditLog(ctx,'marketing.commercial.creative.approved','content_draft',id,null,{explicitApproval:input.approved,qualityGatePassed:true,externalEffect:false,externalPublication:false});
    return result;
  });

  app.post('/v1/marketing/commercial/projects/:id/sync-crm',async req=>{
    const ctx=await workspaceContext(req,'crm.write'),projectId=uuid.parse((req.params as any).id),result=await syncProjectLeadsToCrm(ctx.workspaceId,projectId);
    await auditLog(ctx,'marketing.commercial.leads.synced','marketing_project',projectId,null,{...result,externalEffect:false,externalCommunication:false});
    return result;
  });

  app.get('/v1/marketing/commercial/projects/:id/learning',async req=>{
    const ctx=await workspaceContext(req,'integrations.read'),projectId=uuid.parse((req.params as any).id);
    return commercialLearning(ctx.workspaceId,projectId);
  });
}
