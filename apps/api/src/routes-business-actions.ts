import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {hasPermission,workspaceContext} from './auth.js';
import {BUSINESS_ACTIONS} from './business-action-registry.js';
import {executeLowRiskBusinessAction} from './business-action-engine.js';

export async function registerBusinessActionRoutes(app:FastifyInstance){
  app.get('/v1/business-actions',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    return BUSINESS_ACTIONS.map(action=>({...action,allowed:hasPermission(ctx.role,ctx.permissions,action.permission)}));
  });

  app.post('/v1/business-actions/execute',async req=>{
    const ctx=await workspaceContext(req);
    const input=z.object({action:z.string().min(1),payload:z.record(z.string(),z.unknown()).default({})}).parse(req.body||{});
    return executeLowRiskBusinessAction(ctx as any,input.action,input.payload);
  });
}
