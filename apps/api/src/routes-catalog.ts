import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const uuid=z.string().uuid();
const Kind=z.enum(['product','service']);
const BillingCycle=z.enum(['one_time','weekly','monthly','quarterly','yearly','custom']);
const nullableText=z.string().trim().max(240).optional().nullable();

const createSchema=z.object({
  kind:Kind.default('service'),
  name:z.string().trim().min(2).max(160),
  description:z.string().trim().max(2500).optional().nullable(),
  sku:nullableText,
  unit:z.string().trim().min(1).max(40).default('unidade'),
  priceMinor:z.number().int().min(0).default(0),
  costMinor:z.number().int().min(0).optional().nullable(),
  currency:z.string().trim().length(3).default('BRL'),
  billingCycle:BillingCycle.default('one_time'),
  fiscalCode:nullableText,
  nbs:z.string().trim().regex(/^\d{9}$/).optional().nullable(),
  trackInventory:z.boolean().optional(),
  reorderPoint:z.number().min(0).optional(),
  preferredSupplierId:uuid.optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).optional().default({})
}).strict();

const patchSchema=createSchema.partial().extend({active:z.boolean().optional()}).strict();

function rowPayload(input:any){
  return {
    kind:input.kind,
    name:input.name,
    description:input.description||null,
    sku:input.sku||null,
    unit:input.unit,
    price_minor:input.priceMinor,
    cost_minor:input.costMinor??null,
    currency:String(input.currency||'BRL').toUpperCase(),
    billing_cycle:input.billingCycle,
    fiscal_code:input.fiscalCode||null,
    nbs:input.nbs||null,
    track_inventory:Boolean(input.trackInventory),
    reorder_point:Number(input.reorderPoint||0),
    preferred_supplier_id:input.preferredSupplierId||null,
    metadata:input.metadata||{}
  };
}

async function assertUnique(workspaceId:string,name:string,sku?:string|null,excludeId?:string){
  const byName=(await query<any>(`select id from business_catalog_items where workspace_id=$1 and active=true and lower(name)=lower($2) and ($3::uuid is null or id<>$3::uuid) limit 1`,[workspaceId,name,excludeId||null]))[0];
  if(byName)throw new ApiError(409,'catalog_name_exists','Já existe um item ativo com este nome no catálogo.');
  if(sku){
    const bySku=(await query<any>(`select id from business_catalog_items where workspace_id=$1 and active=true and lower(sku)=lower($2) and ($3::uuid is null or id<>$3::uuid) limit 1`,[workspaceId,sku,excludeId||null]))[0];
    if(bySku)throw new ApiError(409,'catalog_sku_exists','Já existe um item ativo com este código/SKU no catálogo.');
  }
}

export async function registerCatalogRoutes(app:FastifyInstance){
  app.get('/v1/catalog/items',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const raw=(req.query as any)?.includeInactive;const includeInactive=raw===true||String(raw||'').toLowerCase()==='true';
    return query<any>(`select id,kind,name,description,sku,unit,price_minor,cost_minor,currency,billing_cycle,fiscal_code,nbs,track_inventory,reorder_point,preferred_supplier_id,active,metadata,created_at,updated_at
      from business_catalog_items
      where workspace_id=$1 and ($2::boolean=true or active=true)
      order by active desc,kind,name`,[ctx.workspaceId,includeInactive]);
  });

  app.get('/v1/catalog/summary',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const rows=await query<any>(`select
      count(*) filter(where active) active_items,
      count(*) filter(where active and kind='product') products,
      count(*) filter(where active and kind='service') services,
      count(*) filter(where active and billing_cycle<>'one_time') recurring,
      count(*) filter(where active and kind='product' and track_inventory) tracked_products,
      coalesce(avg(price_minor) filter(where active and price_minor>0),0)::bigint avg_price_minor
      from business_catalog_items where workspace_id=$1`,[ctx.workspaceId]);
    return rows[0]||{active_items:0,products:0,services:0,recurring:0,avg_price_minor:0};
  });

  app.post('/v1/catalog/items',async req=>{
    const ctx=await workspaceContext(req,'workspace.write');
    const input=createSchema.parse(req.body||{}),p=rowPayload(input);
    await assertUnique(ctx.workspaceId,p.name,p.sku);
    const rows=await query<any>(`insert into business_catalog_items(
      workspace_id,created_by,kind,name,description,sku,unit,price_minor,cost_minor,currency,billing_cycle,fiscal_code,nbs,track_inventory,reorder_point,preferred_supplier_id,metadata
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,[
      ctx.workspaceId,ctx.user.id,p.kind,p.name,p.description,p.sku,p.unit,p.price_minor,p.cost_minor,p.currency,p.billing_cycle,p.fiscal_code,p.nbs,p.track_inventory,p.reorder_point,p.preferred_supplier_id,JSON.stringify(p.metadata)
    ]);
    await auditLog(ctx,'catalog.item_created','business_catalog_item',rows[0].id,null,rows[0]);
    return rows[0];
  });

  app.patch('/v1/catalog/items/:id',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id),input=patchSchema.parse(req.body||{});
    const before=(await query<any>(`select * from business_catalog_items where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'catalog_item_not_found','Item do catálogo não encontrado.');
    const next={
      kind:input.kind??before.kind,
      name:input.name??before.name,
      description:input.description===undefined?before.description:input.description,
      sku:input.sku===undefined?before.sku:input.sku,
      unit:input.unit??before.unit,
      priceMinor:input.priceMinor??Number(before.price_minor),
      costMinor:input.costMinor===undefined?(before.cost_minor===null?null:Number(before.cost_minor)):input.costMinor,
      currency:String(input.currency??before.currency).toUpperCase(),
      billingCycle:input.billingCycle??before.billing_cycle,
      fiscalCode:input.fiscalCode===undefined?before.fiscal_code:input.fiscalCode,
      nbs:input.nbs===undefined?before.nbs:input.nbs,
      trackInventory:input.trackInventory===undefined?before.track_inventory:input.trackInventory,
      reorderPoint:input.reorderPoint===undefined?Number(before.reorder_point||0):input.reorderPoint,
      preferredSupplierId:input.preferredSupplierId===undefined?before.preferred_supplier_id:input.preferredSupplierId,
      metadata:input.metadata??before.metadata,
      active:input.active??before.active
    };
    if(next.active)await assertUnique(ctx.workspaceId,next.name,next.sku,id);
    const rows=await query<any>(`update business_catalog_items set kind=$3,name=$4,description=$5,sku=$6,unit=$7,price_minor=$8,cost_minor=$9,currency=$10,billing_cycle=$11,fiscal_code=$12,nbs=$13,track_inventory=$14,reorder_point=$15,preferred_supplier_id=$16,metadata=$17,active=$18,updated_at=now()
      where id=$1 and workspace_id=$2 returning *`,[
      id,ctx.workspaceId,next.kind,next.name,next.description||null,next.sku||null,next.unit,next.priceMinor,next.costMinor,next.currency,next.billingCycle,next.fiscalCode||null,next.nbs||null,next.trackInventory,next.reorderPoint,next.preferredSupplierId||null,JSON.stringify(next.metadata||{}),next.active
    ]);
    await auditLog(ctx,'catalog.item_updated','business_catalog_item',id,before,rows[0]);
    return rows[0];
  });

  app.delete('/v1/catalog/items/:id',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),id=uuid.parse((req.params as any).id);
    const before=(await query<any>(`select * from business_catalog_items where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'catalog_item_not_found','Item do catálogo não encontrado.');
    const rows=await query<any>(`update business_catalog_items set active=false,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId]);
    await auditLog(ctx,'catalog.item_archived','business_catalog_item',id,before,rows[0]);
    return {ok:true,item:rows[0]};
  });
}
