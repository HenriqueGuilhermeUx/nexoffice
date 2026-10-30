import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {buildCustomer360} from './customer-360.js';

const uuid=z.string().uuid();

export async function registerCustomer360Routes(app:FastifyInstance){
  app.get('/v1/crm/contacts/:id/360',async req=>{
    const ctx=await workspaceContext(req,'crm.read');
    const id=uuid.parse((req.params as any).id);
    const result=await buildCustomer360(ctx.workspaceId,id);
    if(!result)throw new ApiError(404,'not_found','Contato não encontrado.');
    return result;
  });
}
