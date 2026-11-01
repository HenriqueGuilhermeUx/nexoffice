import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {buildCrossSystemIntelligence} from './cross-system-intelligence.js';

export async function registerCrossSystemIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/cross-system',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    return buildCrossSystemIntelligence(ctx.workspaceId);
  });
}
