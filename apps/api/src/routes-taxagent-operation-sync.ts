import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {auditLog} from './events.js';
import {syncTaxAgentOperation} from './taxagent-operation-sync.js';

const uuid=z.string().uuid();

export async function registerTaxAgentOperationSyncRoutes(app:FastifyInstance){
  app.post('/v1/business-operations/:id/sync-invoice',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const id=uuid.parse((req.params as any).id);
    const result=await syncTaxAgentOperation(ctx.workspaceId,id);
    if(!result.ok){
      const status=result.error==='operation_not_found'?404:result.error==='taxagent_invoice_not_issued_yet'?409:result.error==='taxagent_company_mismatch'?409:502;
      throw new ApiError(status,result.error,result.error==='taxagent_invoice_not_issued_yet'?'A emissão ainda não produziu um ID de nota no TaxAgent. Aprove a ação fiscal e execute a fila antes de sincronizar.':'Não foi possível sincronizar o status fiscal agora.');
    }
    await auditLog(ctx,'business_operation.invoice_synced','business_operation',id,null,{fiscalId:result.fiscal.id,fiscalStatus:result.fiscal.status,externalEffect:false});
    return result;
  });
}
