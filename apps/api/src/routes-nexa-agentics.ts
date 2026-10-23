import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {agenticsBridgeConfigured,getNexaAgenticsPreview,OPERATIONS} from './nexa-agentics-bridge.js';

/**
 * Workspace-authenticated optional Nexa Agentics lab adapter.
 * No data from CRM, contacts, financial accounts or conversations is sent.
 * No writes, delegated actions or product entitlement escalation.
 */
export async function registerNexaAgenticsRoutes(app:FastifyInstance){
 app.get('/v1/agentics/capabilities',async req=>{
  const ctx=await workspaceContext(req,'command.read');
  return {product:'nexoffice',workspaceId:ctx.workspaceId,
   mode:'synthetic_review_only',configured:agenticsBridgeConfigured(),
   operations:[...OPERATIONS],
   realCustomerDataEnabled:false,financialExecutionAllowed:false,
   publicLaunchApproved:false};
 });
 app.post('/v1/agentics/preview',async req=>{
  const ctx=await workspaceContext(req,'command.read');
  if(!agenticsBridgeConfigured())
   throw new ApiError(409,'agentics_not_enabled',
    'Prévia Agentics ainda não habilitada para este ambiente.');
  const input=z.object({operation:z.enum(OPERATIONS)}).strict().parse(req.body);
  try{return await getNexaAgenticsPreview(ctx,input.operation);}
  catch{throw new ApiError(503,'agentics_gateway_unavailable',
   'Prévia Agentics temporariamente indisponível. Nenhuma ação foi executada.');}
 });
}
