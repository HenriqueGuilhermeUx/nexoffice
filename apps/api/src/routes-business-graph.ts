import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {buildBusinessGraph} from './business-graph.js';

const querySchema=z.object({
  days:z.coerce.number().int().min(7).max(365).default(90),
  includeGraph:z.enum(['true','false']).default('false')
});

export async function registerBusinessGraphRoutes(app:FastifyInstance){
  app.get('/v1/business-graph/overview',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const input=querySchema.parse(req.query||{});
    const graph=await buildBusinessGraph(ctx.workspaceId,ctx.workspaceName,input.days);
    const connections=graph.edges.reduce<Record<string,number>>((acc,edge)=>{
      acc[edge.kind]=(acc[edge.kind]||0)+1;
      return acc;
    },{});

    const response={
      workspace:{id:graph.workspaceId,name:graph.workspaceName},
      coverage:graph.coverage,
      executiveSignals:graph.executiveSignals,
      relationships:connections,
      sample:{
        nodes:graph.nodes.slice(0,24),
        edges:graph.edges.slice(0,36)
      },
      safety:graph.safety
    };
    if(input.includeGraph==='true')return{...response,graph:{nodes:graph.nodes,edges:graph.edges}};
    return response;
  });
}
