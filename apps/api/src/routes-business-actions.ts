import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,hasPermission,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';
import {BUSINESS_ACTIONS,businessActionDefinition} from './business-action-registry.js';

const uuid=z.string().uuid();

export async function registerBusinessActionRoutes(app:FastifyInstance){
  app.get('/v1/business-actions',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    return BUSINESS_ACTIONS.map(action=>({...action,allowed:hasPermission(ctx.role,ctx.permissions,action.permission)}));
  });

  app.post('/v1/business-actions/execute',async req=>{
    const ctx=await workspaceContext(req);
    const input=z.object({action:z.string().min(1),payload:z.record(z.string(),z.unknown()).default({})}).parse(req.body||{});
    const definition=businessActionDefinition(input.action);
    if(!definition)throw new ApiError(404,'business_action_not_found','Ação de negócio não reconhecida.');
    if(!hasPermission(ctx.role,ctx.permissions,definition.permission))throw new ApiError(403,'permission_denied','Você não tem permissão para esta ação.');
    if(definition.externalEffect)throw new ApiError(409,'external_action_requires_dedicated_flow','Esta ação possui efeito externo e deve usar o fluxo dedicado com aprovação.');
    if(definition.humanApprovalRequired)throw new ApiError(409,'human_confirmation_required','Esta ação precisa de confirmação humana explícita no fluxo dedicado.');

    if(input.action==='task.followup.create'){
      const payload=z.object({contactId:uuid,title:z.string().trim().min(2).max(180),description:z.string().trim().max(1000).optional().nullable(),priority:z.enum(['low','normal','high','critical']).default('normal'),dueAt:z.string().datetime().optional().nullable()}).parse(input.payload);
      const contact=(await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[payload.contactId,ctx.workspaceId]))[0];
      if(!contact)throw new ApiError(404,'contact_not_found','Cliente não encontrado.');
      const row=(await query<any>(`insert into tasks(workspace_id,contact_id,title,description,priority,due_at,metadata) values($1,$2,$3,$4,$5,$6,$7) returning *`,[ctx.workspaceId,payload.contactId,payload.title,payload.description||null,payload.priority,payload.dueAt||null,JSON.stringify({source:'business_action_engine',action:input.action})]))[0];
      await auditLog(ctx,'business_action.executed','task',row.id,null,{action:input.action,externalEffect:false});
      return{definition,result:row,externalEffect:false};
    }

    if(input.action==='purchasing.plan'){
      const payload=z.object({catalogItemId:uuid,quantity:z.number().positive(),supplierContactId:uuid.optional().nullable(),locationId:uuid.optional().nullable(),note:z.string().trim().max(1000).optional().nullable()}).parse(input.payload);
      const item=(await query<any>(`select id,name,cost_minor,preferred_supplier_id from business_catalog_items where id=$1 and workspace_id=$2 and active=true and kind='product' and track_inventory=true`,[payload.catalogItemId,ctx.workspaceId]))[0];
      if(!item)throw new ApiError(404,'tracked_product_not_found','Produto com controle de estoque não encontrado.');
      const supplierId=payload.supplierContactId||item.preferred_supplier_id||null;
      if(supplierId){const supplier=(await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[supplierId,ctx.workspaceId]))[0];if(!supplier)throw new ApiError(400,'invalid_supplier','Fornecedor inválido.');}
      const result=await transaction(async client=>{
        const order=(await client.query<any>(`insert into purchase_orders(workspace_id,supplier_contact_id,location_id,total_minor,note,created_by,metadata) values($1,$2,$3,$4,$5,$6,$7) returning *`,[ctx.workspaceId,supplierId,payload.locationId||null,Math.round(payload.quantity*Number(item.cost_minor||0)),payload.note||null,ctx.user.id,JSON.stringify({source:'business_action_engine',externalOrderSent:false})])).rows[0];
        await client.query(`insert into purchase_order_items(workspace_id,purchase_order_id,catalog_item_id,quantity,unit_cost_minor) values($1,$2,$3,$4,$5)`,[ctx.workspaceId,order.id,item.id,payload.quantity,Number(item.cost_minor||0)]);
        return order;
      });
      await auditLog(ctx,'business_action.executed','purchase_order',result.id,null,{action:input.action,externalEffect:false});
      return{definition,result,externalEffect:false};
    }

    if(input.action==='materials.proposal.prepare'){
      const payload=z.object({contactId:uuid.optional().nullable(),catalogItemId:uuid.optional().nullable()}).parse(input.payload);
      return{definition,result:{handoff:'materials',contactId:payload.contactId||null,catalogItemId:payload.catalogItemId||null},externalEffect:false};
    }

    throw new ApiError(409,'business_action_requires_dedicated_flow','Esta ação já está catalogada, mas deve ser executada pelo fluxo dedicado correspondente.');
  });
}
