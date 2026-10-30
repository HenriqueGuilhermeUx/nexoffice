import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {buildDecisionPatterns} from './decision-patterns.js';

const querySchema=z.object({
  days:z.coerce.number().int().min(30).max(365).default(180),
  minSample:z.coerce.number().int().min(3).max(50).default(3)
});

export async function registerDecisionPatternRoutes(app:FastifyInstance){
  app.get('/v1/intelligence/decision-patterns',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const input=querySchema.parse(req.query||{});
    return buildDecisionPatterns(ctx.workspaceId,input.days,input.minSample);
  });
}
