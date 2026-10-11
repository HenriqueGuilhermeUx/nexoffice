import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const qty=z.number().positive().max(1_000_000);
const SIGNED="case when movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then quantity else -quantity end";

export async function registerInventoryRoutes(app:FastifyInstance){
  app.get('/v1/inventory/summary',async req=>{
    const ctx=await workspaceContext(req,'inventory.read');
    const items=await query<any>(`select ci.id,ci.name,ci.sku,ci.unit,ci.price_minor,ci.cost_minor,ci.reorder_point,ci.preferred_supplier_id,s.name preferred_supplier_name,
      coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)::numeric(14,4) on_hand
      from business_catalog_items ci
      left join crm_contacts s on s.id=ci.preferred_supplier_id
      left join inventory_movements im on im.workspace_id=ci.workspace_id and im.catalog_item_id=ci.id
      where ci.workspace_id=$1 and ci.active=true and ci.kind='product' and ci.track_inventory=true
      group by ci.id,s.name order by ci.name`,[ctx.workspaceId]);
    let totalValueMinor=0,belowReorder=0;
    const normalized=items.map(row=>{
      const onHand=Number(row.on_hand||0),reorder=Number(row.reorder_point||0),cost=row.cost_minor===null?null:Number(row.cost_minor);
      const low=reorder>0&&onHand<=reorder;
      if(low)belowReorder++;
      if(cost!==null)totalValueMinor+=Math.round(Math.max(0,onHand)*cost);
      const suggestedQuantity=low?Math.max(1,Math.ceil(reorder*2-onHand)):0;
      return {...row,on_hand:onHand,reorder_point:reorder,cost_minor:cost,below_reorder:low,suggested_purchase_quantity:suggestedQuantity,
        best_options:low?[
          {action:'plan_purchase',label:'Planejar compra',reason:'Estoque em '+onHand+' '+row.unit+'; ponto de reposição '+reorder+'.',catalogItemId:row.id,supplierContactId:row.preferred_supplier_id||null,suggestedQuantity},
          {action:'adjust_inventory',label:'Conferir estoque',reason:'Se o saldo físico for diferente, registre um ajuste rastreável.',catalogItemId:row.id}
        ]:[{action:'view_movements',label:'Ver movimentos',reason:'Acompanhe entradas e saídas deste produto.',catalogItemId:row.id}]
      };
    });
    const firstLow=normalized.find(row=>row.below_reorder);
    return{summary:{trackedProducts:normalized.length,belowReorder,totalValueMinor},items:normalized,bestOptions:firstLow?firstLow.best_options:normalized.length?[{action:'view_movements',label:'Revisar movimentações',reason:'O estoque está acima dos pontos de reposição.'}]:[],safety:{supplierOrderSentAutomatically:false,inventoryAdjustedAutomatically:false,purchasePaymentAutomatically:false}};
  });

  app.get('/v1/inventory/locations',async req=>{
    const ctx=await workspaceContext(req,'inventory.read');
    return query<any>(`select * from inventory_locations where workspace_id=$1 and active=true order by name`,[ctx.workspaceId]);
  });

  app.post('/v1/inventory/locations',async req=>{
    const ctx=await workspaceContext(req,'inventory.write');
    const input=z.object({name:z.string().trim().min(2).max(120),code:z.string().trim().max(40).optional().nullable()}).parse(req.body||{});
    const rows=await query<any>(`insert into inventory_locations(workspace_id,name,code) values($1,$2,$3) on conflict(workspace_id,name) do update set active=true,code=coalesce(excluded.code,inventory_locations.code),updated_at=now() returning *`,[ctx.workspaceId,input.name,input.code||null]);
    await auditLog(ctx,'inventory.location_saved','inventory_location',rows[0].id,null,rows[0]);
    return rows[0];
  });

  app.get('/v1/inventory/movements',async req=>{
    const ctx=await workspaceContext(req,'inventory.read');
    const catalogItemId=String((req.query as any)?.catalogItemId||'');
    return query<any>(`select im.*,ci.name catalog_name,ci.sku,l.name location_name from inventory_movements im join business_catalog_items ci on ci.id=im.catalog_item_id left join inventory_locations l on l.id=im.location_id where im.workspace_id=$1 and ($2='' or im.catalog_item_id::text=$2) order by im.occurred_at desc limit 500`,[ctx.workspaceId,catalogItemId]);
  });

  app.post('/v1/inventory/adjust',async req=>{
    const ctx=await workspaceContext(req,'inventory.write');
    const input=z.object({catalogItemId:uuid,locationId:uuid.optional().nullable(),direction:z.enum(['in','out']),quantity:qty,note:z.string().trim().max(500).optional().nullable()}).parse(req.body||{});
    const item=(await query<any>(`select * from business_catalog_items where id=$1 and workspace_id=$2 and active=true and kind='product' and track_inventory=true`,[input.catalogItemId,ctx.workspaceId]))[0];
    if(!item)throw new ApiError(404,'tracked_product_not_found','Produto com controle de estoque não encontrado.');
    if(input.locationId){const location=(await query<any>(`select id from inventory_locations where id=$1 and workspace_id=$2 and active=true`,[input.locationId,ctx.workspaceId]))[0];if(!location)throw new ApiError(400,'invalid_inventory_location','Local de estoque inválido.');}
    const movementType=input.direction==='in'?'adjustment_in':'adjustment_out';
    if(input.direction==='out'){
      const balance=(await query<any>(`select coalesce(sum(case when movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then quantity else -quantity end),0)::numeric current from inventory_movements where workspace_id=$1 and catalog_item_id=$2`,[ctx.workspaceId,input.catalogItemId]))[0];
      if(Number(balance?.current||0)<input.quantity)throw new ApiError(409,'insufficient_inventory','O ajuste deixaria o estoque negativo. Confira o saldo físico antes de continuar.');
    }
    const rows=await query<any>(`insert into inventory_movements(workspace_id,catalog_item_id,location_id,movement_type,quantity,unit_cost_minor,note,created_by,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[ctx.workspaceId,input.catalogItemId,input.locationId||null,movementType,input.quantity,item.cost_minor,input.note||null,ctx.user.id,JSON.stringify({source:'manual_adjustment',externalEffect:false})]);
    await auditLog(ctx,'inventory.adjusted','inventory_movement',rows[0].id,null,rows[0]);
    return {...rows[0],externalEffect:false};
  });

  app.get('/v1/purchasing/orders',async req=>{
    const ctx=await workspaceContext(req,'purchasing.read');
    return query<any>(`select po.*,c.name supplier_name,l.name location_name,coalesce(json_agg(json_build_object('id',poi.id,'catalogItemId',poi.catalog_item_id,'name',ci.name,'quantity',poi.quantity,'receivedQuantity',poi.received_quantity,'unitCostMinor',poi.unit_cost_minor)) filter(where poi.id is not null),'[]'::json) items from purchase_orders po left join crm_contacts c on c.id=po.supplier_contact_id left join inventory_locations l on l.id=po.location_id left join purchase_order_items poi on poi.purchase_order_id=po.id left join business_catalog_items ci on ci.id=poi.catalog_item_id where po.workspace_id=$1 group by po.id,c.name,l.name order by po.updated_at desc limit 200`,[ctx.workspaceId]);
  });

  app.post('/v1/purchasing/orders',async req=>{
    const ctx=await workspaceContext(req,'purchasing.write');
    const input=z.object({supplierContactId:uuid.optional().nullable(),locationId:uuid.optional().nullable(),expectedAt:z.string().datetime().optional().nullable(),note:z.string().trim().max(1000).optional().nullable(),items:z.array(z.object({catalogItemId:uuid,quantity:qty,unitCostMinor:z.number().int().min(0).optional().nullable()})).min(1).max(100)}).parse(req.body||{});
    if(input.supplierContactId){const supplier=(await query<any>(`select id from crm_contacts where id=$1 and workspace_id=$2`,[input.supplierContactId,ctx.workspaceId]))[0];if(!supplier)throw new ApiError(400,'invalid_supplier','Fornecedor inválido.');}
    if(input.locationId){const location=(await query<any>(`select id from inventory_locations where id=$1 and workspace_id=$2 and active=true`,[input.locationId,ctx.workspaceId]))[0];if(!location)throw new ApiError(400,'invalid_inventory_location','Local de estoque inválido.');}
    const catalog=await query<any>(`select id,name,cost_minor from business_catalog_items where workspace_id=$1 and active=true and kind='product' and track_inventory=true and id=any($2::uuid[])`,[ctx.workspaceId,input.items.map(x=>x.catalogItemId)]);
    const byId=new Map(catalog.map(x=>[String(x.id),x]));
    if(byId.size!==new Set(input.items.map(x=>x.catalogItemId)).size)throw new ApiError(400,'invalid_purchase_item','Todos os itens da compra precisam ser produtos ativos com estoque controlado.');
    const total=input.items.reduce((sum,item)=>sum+Math.round(item.quantity*Number(item.unitCostMinor??byId.get(item.catalogItemId)?.cost_minor??0)),0);
    const result=await transaction(async client=>{
      const order=(await client.query<any>(`insert into purchase_orders(workspace_id,supplier_contact_id,location_id,expected_at,total_minor,note,created_by,metadata) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[ctx.workspaceId,input.supplierContactId||null,input.locationId||null,input.expectedAt||null,total,input.note||null,ctx.user.id,JSON.stringify({source:'nexoffice_purchasing_lite',externalOrderSent:false})])).rows[0];
      for(const item of input.items){const catalogItem=byId.get(item.catalogItemId);await client.query(`insert into purchase_order_items(workspace_id,purchase_order_id,catalog_item_id,quantity,unit_cost_minor) values($1,$2,$3,$4,$5)`,[ctx.workspaceId,order.id,item.catalogItemId,item.quantity,Number(item.unitCostMinor??catalogItem?.cost_minor??0)]);}
      return order;
    });
    await auditLog(ctx,'purchasing.order_planned','purchase_order',result.id,null,{...result,externalOrderSent:false});
    return {...result,externalOrderSent:false};
  });

  app.post('/v1/purchasing/orders/:id/mark-ordered',async req=>{
    const ctx=await workspaceContext(req,'purchasing.write'),id=uuid.parse((req.params as any).id);
    const row=(await query<any>(`update purchase_orders set status='ordered',ordered_at=coalesce(ordered_at,now()),updated_at=now(),metadata=metadata||$3::jsonb where id=$1 and workspace_id=$2 and status='draft' returning *`,[id,ctx.workspaceId,JSON.stringify({markedOrderedManually:true,externalOrderSent:false})]))[0];
    if(!row)throw new ApiError(409,'purchase_order_not_draft','A compra não está mais em rascunho.');
    await auditLog(ctx,'purchasing.order_marked_ordered','purchase_order',id,null,row);
    return {...row,externalOrderSent:false};
  });

  app.post('/v1/purchasing/orders/:id/receive',async req=>{
    const ctx=await workspaceContext(req,'inventory.write'),id=uuid.parse((req.params as any).id);
    const input=z.object({items:z.array(z.object({itemId:uuid,quantity:qty})).min(1).max(100)}).parse(req.body||{});
    const before=(await query<any>(`select * from purchase_orders where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'purchase_order_not_found','Compra não encontrada.');
    if(['received','cancelled'].includes(before.status))throw new ApiError(409,'purchase_order_closed','Esta compra já foi encerrada.');
    const result=await transaction(async client=>{
      for(const received of input.items){
        const item=(await client.query<any>(`select poi.*,ci.name from purchase_order_items poi join business_catalog_items ci on ci.id=poi.catalog_item_id where poi.id=$1 and poi.purchase_order_id=$2 and poi.workspace_id=$3 for update`,[received.itemId,id,ctx.workspaceId])).rows[0];
        if(!item)throw new ApiError(400,'purchase_item_not_found','Item da compra não encontrado.');
        const remaining=Number(item.quantity)-Number(item.received_quantity);
        if(received.quantity>remaining+0.00001)throw new ApiError(409,'receive_quantity_exceeds_remaining','A quantidade recebida excede o saldo pendente do item.');
        await client.query(`update purchase_order_items set received_quantity=received_quantity+$4 where id=$1 and purchase_order_id=$2 and workspace_id=$3`,[received.itemId,id,ctx.workspaceId,received.quantity]);
        await client.query(`insert into inventory_movements(workspace_id,catalog_item_id,location_id,movement_type,quantity,unit_cost_minor,reference_type,reference_id,note,created_by,metadata) values($1,$2,$3,'purchase',$4,$5,'purchase_order',$6,$7,$8,$9)`,[ctx.workspaceId,item.catalog_item_id,before.location_id,received.quantity,item.unit_cost_minor,id,'Recebimento de compra',ctx.user.id,JSON.stringify({purchaseOrderItemId:item.id,externalEffect:false})]);
      }
      const pending=(await client.query<any>(`select count(*)::int pending from purchase_order_items where purchase_order_id=$1 and workspace_id=$2 and received_quantity<quantity`,[id,ctx.workspaceId])).rows[0];
      const complete=Number(pending?.pending||0)===0;
      return (await client.query<any>(`update purchase_orders set status=$3,received_at=case when $3='received' then now() else received_at end,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,complete?'received':'partial'])).rows[0];
    });
    await auditLog(ctx,'purchasing.order_received','purchase_order',id,before,result);
    return {...result,externalEffect:false};
  });
}
