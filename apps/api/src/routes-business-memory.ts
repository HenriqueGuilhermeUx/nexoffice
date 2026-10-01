import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {askBusinessMemory} from './business-memory.js';

const askSchema=z.object({question:z.string().trim().min(3).max(600)}).strict();

export async function registerBusinessMemoryRoutes(app:FastifyInstance){
  app.post('/v1/intelligence/ask',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const input=askSchema.parse(req.body||{});
    const result=await askBusinessMemory(ctx,input.question);
    await auditLog(ctx,'intelligence.business_memory.asked','workspace',ctx.workspaceId,null,{questionLength:input.question.length,confidence:result.confidence,sourceCount:result.sources.length,domains:result.coverage.domains,externalLLMUsed:false,rawDocumentsUsed:false},{externalEffect:false});
    return result;
  });
}
