import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {buildOperationalPriorities,safeOperationalSignal} from './operational-signals.js';

export async function registerSignalRoutes(app:FastifyInstance){
  app.get('/v1/workspace/operational-signals',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const input=z.object({
      sourceProduct:z.string().trim().min(1).max(80).optional(),
      signalType:z.string().trim().min(1).max(120).optional(),
      limit:z.coerce.number().int().min(1).max(100).default(30)
    }).strict().parse(req.query);
    const rows=await query<any>(`
      select id,source_product,signal_type,period_start,period_end,metrics,dimensions,created_at
      from workspace_operational_signals
      where workspace_id=$1
        and ($2::text is null or source_product=$2)
        and ($3::text is null or signal_type=$3)
      order by period_end desc,created_at desc
      limit $4
    `,[ctx.workspaceId,input.sourceProduct||null,input.signalType||null,input.limit]);
    const workspace=(await query<any>(`select vertical from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const signals=rows.map(safeOperationalSignal);
    return {
      privacy:'aggregate_only',
      workspace:{id:ctx.workspaceId,vertical:workspace?.vertical||'general'},
      signals,
      priorities:buildOperationalPriorities(workspace?.vertical||'general',signals)
    };
  });
}
