import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {buildBusinessIntelligence,businessIntelligenceHistory,getBusinessProfile,readBusinessIntelligence,recordIntelligenceMetric,upsertBusinessProfile} from './business-intelligence.js';

const profileSchema=z.object({
  sector:z.string().trim().min(2).max(80).optional(),subsector:z.string().trim().max(120).nullable().optional(),revenueModel:z.string().trim().max(80).optional(),
  sellsProducts:z.boolean().optional(),sellsServices:z.boolean().optional(),recurringRevenue:z.boolean().optional(),usesAgenda:z.boolean().optional(),usesInventory:z.boolean().optional(),usesContracts:z.boolean().optional(),
  employeeCount:z.number().int().min(0).max(100000).nullable().optional(),activeCustomersEstimate:z.number().int().min(0).max(100000000).nullable().optional(),primarySalesChannel:z.string().trim().max(120).nullable().optional(),seasonality:z.string().trim().max(300).nullable().optional(),mainDependency:z.string().trim().max(300).nullable().optional(),notes:z.string().trim().max(2000).nullable().optional(),metadata:z.record(z.string(),z.unknown()).optional()
});
const metricSchema=z.object({metricKey:z.string().trim().regex(/^[a-z0-9_.-]{2,120}$/),valueNumeric:z.number().finite().nullable().optional(),valueText:z.string().trim().max(500).nullable().optional(),unit:z.string().trim().max(40).nullable().optional(),source:z.enum(['verified_transaction','integrated_system','imported_document','client_reported','derived']).default('client_reported'),sourceReference:z.string().trim().max(300).nullable().optional(),quality:z.enum(['verified','high','medium','estimated']).default('estimated'),confidence:z.number().min(0).max(1).optional(),periodStart:z.string().datetime().nullable().optional(),periodEnd:z.string().datetime().nullable().optional(),observedAt:z.string().datetime().optional(),metadata:z.record(z.string(),z.unknown()).optional()}).refine(v=>v.valueNumeric!==undefined||v.valueText!==undefined,{message:'Informe valueNumeric ou valueText.'});

export async function registerBusinessIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/profile',async req=>{const ctx=await workspaceContext(req,'workspace.read');return getBusinessProfile(ctx.workspaceId)});
  app.put('/v1/intelligence/profile',async req=>{const ctx=await workspaceContext(req,'workspace.read');const input=profileSchema.parse(req.body||{});const before=await getBusinessProfile(ctx.workspaceId);const updated=await upsertBusinessProfile(ctx.workspaceId,input);await auditLog(ctx,'intelligence.profile.updated','workspace',ctx.workspaceId,before,updated,{externalEffect:false});return updated});
  app.get('/v1/intelligence/health',async req=>{const ctx=await workspaceContext(req,'workspace.read');return (await readBusinessIntelligence(ctx.workspaceId))||buildBusinessIntelligence(ctx.workspaceId)});
  app.post('/v1/intelligence/health/refresh',async req=>{const ctx=await workspaceContext(req,'workspace.read');const result=await buildBusinessIntelligence(ctx.workspaceId);await auditLog(ctx,'intelligence.health.refreshed','workspace',ctx.workspaceId,null,{snapshotId:result?.snapshot?.id,score:result?.scores?.overall,knowledge:result?.knowledge?.percent},{externalEffect:false});return result});
  app.get('/v1/intelligence/history',async req=>{const ctx=await workspaceContext(req,'workspace.read');const limit=Math.min(365,Math.max(1,Number((req.query as any)?.limit||60)));return businessIntelligenceHistory(ctx.workspaceId,limit)});
  app.post('/v1/intelligence/metrics',async req=>{const ctx=await workspaceContext(req,'workspace.read');const input=metricSchema.parse(req.body||{});const metric=await recordIntelligenceMetric(ctx.workspaceId,input);await auditLog(ctx,'intelligence.metric.recorded','workspace',ctx.workspaceId,null,{metricKey:input.metricKey,source:input.source,quality:input.quality},{externalEffect:false});return metric});
}
