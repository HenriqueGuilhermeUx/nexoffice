import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';

const uuid=z.string().uuid();
const kind=z.enum(['presentation','proposal','report','onepage','image']);
const theme=z.enum(['executive','bold','light']);
const slide=z.object({
  kicker:z.string().max(120).optional().nullable(),
  title:z.string().min(1).max(220),
  subtitle:z.string().max(800).optional().nullable(),
  bullets:z.array(z.string().max(500)).max(12).optional().default([]),
  cta:z.string().max(500).optional().nullable()
});
const draft=z.object({
  title:z.string().min(1).max(220),
  subtitle:z.string().max(800).optional().nullable(),
  slides:z.array(slide).min(1).max(40),
  generatedBy:z.string().max(120).optional().nullable()
});
const createSchema=z.object({
  kind,theme,
  title:z.string().min(1).max(220),
  subtitle:z.string().max(800).optional().nullable(),
  content:draft,
  contactId:uuid.optional().nullable(),
  dealId:uuid.optional().nullable(),
  metadata:z.record(z.string(),z.unknown()).optional().default({})
});
const patchSchema=createSchema.partial();

export async function registerMaterialsRoutes(app:FastifyInstance){
  app.get('/v1/materials',async req=>{
    const ctx=await workspaceContext(req,'materials.read');
    return query<any>(`select m.id,m.kind,m.theme,m.title,m.subtitle,m.status,m.public_token,m.published_at,m.metadata,m.created_at,m.updated_at,
      c.name contact_name,d.title deal_title
      from materials m
      left join crm_contacts c on c.id=m.contact_id
      left join crm_deals d on d.id=m.deal_id
      where m.workspace_id=$1 and m.status<>'archived'
      order by m.updated_at desc limit 100`,[ctx.workspaceId]);
  });

  app.get('/v1/materials/:id',async req=>{
    const ctx=await workspaceContext(req,'materials.read'),id=uuid.parse((req.params as any).id);
    const row=(await query<any>(`select m.*,c.name contact_name,d.title deal_title
      from materials m
      left join crm_contacts c on c.id=m.contact_id
      left join crm_deals d on d.id=m.deal_id
      where m.id=$1 and m.workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!row)throw new ApiError(404,'not_found','Material não encontrado.');
    return row;
  });

  app.post('/v1/materials',async req=>{
    const ctx=await workspaceContext(req,'materials.write'),input=createSchema.parse(req.body||{});
    if(input.contactId){
      const ok=(await query<any>(`select 1 from crm_contacts where id=$1 and workspace_id=$2`,[input.contactId,ctx.workspaceId]))[0];
      if(!ok)throw new ApiError(400,'invalid_contact','Cliente inválido para este workspace.');
    }
    if(input.dealId){
      const ok=(await query<any>(`select 1 from crm_deals where id=$1 and workspace_id=$2`,[input.dealId,ctx.workspaceId]))[0];
      if(!ok)throw new ApiError(400,'invalid_deal','Oportunidade inválida para este workspace.');
    }
    const rows=await query<any>(`insert into materials(workspace_id,created_by,contact_id,deal_id,kind,theme,title,subtitle,content,metadata)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,[
      ctx.workspaceId,ctx.user.id,input.contactId||null,input.dealId||null,input.kind,input.theme,input.title,input.subtitle||null,JSON.stringify(input.content),JSON.stringify(input.metadata||{})
    ]);
    return rows[0];
  });

  app.patch('/v1/materials/:id',async req=>{
    const ctx=await workspaceContext(req,'materials.write'),id=uuid.parse((req.params as any).id),input=patchSchema.parse(req.body||{});
    const before=(await query<any>(`select * from materials where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'not_found','Material não encontrado.');
    const next={
      kind:input.kind??before.kind,theme:input.theme??before.theme,title:input.title??before.title,subtitle:input.subtitle===undefined?before.subtitle:input.subtitle,
      content:input.content??before.content,contactId:input.contactId===undefined?before.contact_id:input.contactId,dealId:input.dealId===undefined?before.deal_id:input.dealId,
      metadata:input.metadata??before.metadata
    };
    const rows=await query<any>(`update materials set contact_id=$3,deal_id=$4,kind=$5,theme=$6,title=$7,subtitle=$8,content=$9,metadata=$10,updated_at=now()
      where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,next.contactId||null,next.dealId||null,next.kind,next.theme,next.title,next.subtitle||null,JSON.stringify(next.content),JSON.stringify(next.metadata||{})]);
    return rows[0];
  });

  app.post('/v1/materials/:id/publish',async req=>{
    const ctx=await workspaceContext(req,'materials.write'),id=uuid.parse((req.params as any).id);
    const row=(await query<any>(`update materials set status='published',published_at=coalesce(published_at,now()),updated_at=now()
      where id=$1 and workspace_id=$2 returning id,public_token,status,published_at`,[id,ctx.workspaceId]))[0];
    if(!row)throw new ApiError(404,'not_found','Material não encontrado.');
    return {...row,path:`/material/${row.public_token}`};
  });

  app.post('/v1/materials/:id/unpublish',async req=>{
    const ctx=await workspaceContext(req,'materials.write'),id=uuid.parse((req.params as any).id);
    const row=(await query<any>(`update materials set status='draft',published_at=null,updated_at=now()
      where id=$1 and workspace_id=$2 returning id,status`,[id,ctx.workspaceId]))[0];
    if(!row)throw new ApiError(404,'not_found','Material não encontrado.');
    return row;
  });

  app.delete('/v1/materials/:id',async req=>{
    const ctx=await workspaceContext(req,'materials.write'),id=uuid.parse((req.params as any).id);
    const row=(await query<any>(`update materials set status='archived',updated_at=now() where id=$1 and workspace_id=$2 returning id`,[id,ctx.workspaceId]))[0];
    if(!row)throw new ApiError(404,'not_found','Material não encontrado.');
    return {ok:true,id};
  });

  app.get('/v1/public/materials/:token',async req=>{
    const token=uuid.parse((req.params as any).token);
    const row=(await query<any>(`select m.kind,m.theme,m.title,m.subtitle,m.content,m.published_at,m.updated_at,w.name workspace_name
      from materials m join workspaces w on w.id=m.workspace_id
      where m.public_token=$1 and m.status='published' limit 1`,[token]))[0];
    if(!row)throw new ApiError(404,'not_found','Apresentação não encontrada ou não está publicada.');
    return row;
  });
}
