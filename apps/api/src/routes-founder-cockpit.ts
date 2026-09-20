import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog,emitBusinessEvent} from './events.js';
import {requirePlatformAdmin} from './platform-admin.js';
import {buildSevenDayPlan,createSevenDayPlanTask,getActivationAnalytics,getFounderCockpit,getGlobalActivationAnalytics,syncActivationJourneys,trackActivationJourney} from './business-founder-cockpit.js';

const uuid=z.string().uuid();
const activationEvent=z.object({recommendationKey:z.string().trim().regex(/^[a-z0-9_.:-]{2,120}$/),target:z.enum(['profile','crm','finance','agenda','documents','trajectory']),event:z.enum(['shown','clicked']),metadata:z.record(z.string(),z.unknown()).default({})});

export async function registerFounderCockpitRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/founder-cockpit',async req=>{const ctx=await workspaceContext(req,'workspace.read');return getFounderCockpit(ctx.workspaceId)});
  app.get('/v1/intelligence/activation',async req=>{const ctx=await workspaceContext(req,'workspace.read');await syncActivationJourneys(ctx.workspaceId);return getActivationAnalytics(ctx.workspaceId)});
  app.post('/v1/intelligence/activation/event',async req=>{const ctx=await workspaceContext(req,'workspace.read');const input=activationEvent.parse(req.body||{});const result=await trackActivationJourney(ctx.workspaceId,input.recommendationKey,input.target,input.event,{...input.metadata,userId:ctx.user.id});if(input.event==='clicked')await emitBusinessEvent(ctx.workspaceId,'intelligence.activation.clicked','nexoffice.intelligence','workspace',ctx.workspaceId,{recommendationKey:input.recommendationKey,target:input.target});return result});
  app.get('/v1/intelligence/plan/7-days',async req=>{const ctx=await workspaceContext(req,'workspace.read');return buildSevenDayPlan(ctx.workspaceId)});
  app.post('/v1/intelligence/plan/7-days/refresh',async req=>{const ctx=await workspaceContext(req,'workspace.read');const plan=await buildSevenDayPlan(ctx.workspaceId);await auditLog(ctx,'intelligence.seven_day_plan.refreshed','workspace',ctx.workspaceId,null,{planId:plan.plan?.id,items:plan.items?.length||0},{externalEffect:false});return plan});
  app.post('/v1/intelligence/plan/7-days/items/:id/task',async req=>{const ctx=await workspaceContext(req,'agenda.write');const id=uuid.parse((req.params as any).id);const result=await createSevenDayPlanTask(ctx.workspaceId,ctx.user.id,id);if(!result)throw new ApiError(404,'plan_item_not_found','Este item não está mais disponível no Plano de 7 dias.');await auditLog(ctx,'intelligence.seven_day_plan.task_created','task',result.task?.id||id,null,{planItemId:id,existing:result.existing},{externalEffect:false});await emitBusinessEvent(ctx.workspaceId,'intelligence.plan.task_created','nexoffice.intelligence','task',result.task?.id||null,{planItemId:id,title:result.task?.title||null});return result});
  app.get('/v1/admin/intelligence/activation',async req=>{await requirePlatformAdmin(req);return getGlobalActivationAnalytics()});
}
