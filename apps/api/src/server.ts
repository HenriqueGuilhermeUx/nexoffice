import 'dotenv/config';
import Fastify, {type FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {BusinessEvent} from '@nexoffice/domain';
import {db, query} from './db.js';
import {processBusinessEvent} from './orchestrator.js';

const app = Fastify({logger: true});
const port = Number(process.env.PORT || 4000);

app.addHook('onSend', async (_req, reply, payload) => {
  reply.header('access-control-allow-origin', '*');
  reply.header('access-control-allow-headers', 'content-type, authorization, x-workspace-id, x-nexoffice-key');
  reply.header('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  return payload;
});
app.options('*', async (_req, reply) => reply.code(204).send());

function workspaceId(req: FastifyRequest): string {
  const value = req.headers['x-workspace-id'];
  if (!value || Array.isArray(value)) throw app.httpErrors?.badRequest?.('x-workspace-id required') || new Error('x-workspace-id required');
  return value;
}

const contactSchema = z.object({
  kind: z.enum(['person', 'company']).default('person'),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.string(), z.unknown()).default({})
});

const dealSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  stage: z.enum(['lead','qualified','meeting','proposal','won','lost']).default('lead'),
  valueMinor: z.number().int().nonnegative().default(0),
  currency: z.string().default('BRL'),
  ownerId: z.string().uuid().optional().nullable(),
  source: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
  expectedCloseAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const ledgerSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  direction: z.enum(['income','expense']),
  category: z.string().min(1),
  description: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().default('BRL'),
  status: z.enum(['planned','open','paid','cancelled','overdue']).default('open'),
  dueAt: z.string().datetime().optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
  recurrenceKey: z.string().optional().nullable(),
  externalRef: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

app.get('/health', async () => ({status: 'ok', service: 'nexoffice-api', version: '0.1.0', database: Boolean(db)}));

app.post('/v1/workspaces', async req => {
  const input = z.object({
    name: z.string().min(2),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    vertical: z.enum(['general','legal','health','condo','commerce']).default('general'),
    timezone: z.string().default('America/Sao_Paulo'),
    currency: z.string().default('BRL')
  }).parse(req.body);
  const rows = await query(
    `insert into workspaces (name, slug, vertical, timezone, currency, modules)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [input.name, input.slug, input.vertical, input.timezone, input.currency, ['crm','agenda','tasks','erp','command-center','agents','usage']]
  );
  return rows[0];
});

app.get('/v1/crm/contacts', async req => {
  const wid = workspaceId(req);
  return query(`select * from crm_contacts where workspace_id=$1 order by updated_at desc limit 500`, [wid]);
});

app.post('/v1/crm/contacts', async req => {
  const wid = workspaceId(req); const input = contactSchema.parse(req.body);
  const rows = await query<{id:string; [key:string]:unknown}>(
    `insert into crm_contacts (workspace_id, kind, name, email, phone, company_name, document_number, source, tags, custom_fields)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [wid,input.kind,input.name,input.email||null,input.phone||null,input.companyName||null,input.documentNumber||null,input.source||null,input.tags,JSON.stringify(input.customFields)]
  );
  await emit(wid, 'lead.created', 'nexoffice.crm', 'contact', rows[0].id, {name: input.name, source: input.source});
  return rows[0];
});

app.get('/v1/crm/deals', async req => {
  const wid = workspaceId(req);
  return query(`select d.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone from crm_deals d left join crm_contacts c on c.id=d.contact_id where d.workspace_id=$1 order by d.updated_at desc limit 500`, [wid]);
});

app.post('/v1/crm/deals', async req => {
  const wid = workspaceId(req); const input = dealSchema.parse(req.body);
  const rows = await query(
    `insert into crm_deals (workspace_id,contact_id,title,stage,value_minor,currency,owner_id,source,next_action,expected_close_at,metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [wid,input.contactId||null,input.title,input.stage,input.valueMinor,input.currency,input.ownerId||null,input.source||null,input.nextAction||null,input.expectedCloseAt||null,JSON.stringify(input.metadata)]
  );
  return rows[0];
});

app.patch('/v1/crm/deals/:id', async req => {
  const wid = workspaceId(req); const id = z.string().uuid().parse((req.params as any).id);
  const input = z.object({stage: z.enum(['lead','qualified','meeting','proposal','won','lost']).optional(), nextAction: z.string().nullable().optional(), valueMinor: z.number().int().nonnegative().optional()}).parse(req.body);
  const rows = await query(
    `update crm_deals set stage=coalesce($3,stage), next_action=case when $4::boolean then $5 else next_action end, value_minor=coalesce($6,value_minor), updated_at=now()
     where workspace_id=$1 and id=$2 returning *`,
    [wid,id,input.stage||null,Object.hasOwn(input,'nextAction'),input.nextAction??null,input.valueMinor??null]
  );
  if (!rows.length) return app.httpErrors?.notFound?.() || {error:'not_found'};
  return rows[0];
});

app.get('/v1/ledger', async req => {
  const wid = workspaceId(req);
  return query(`select * from ledger_entries where workspace_id=$1 order by coalesce(due_at,created_at) desc limit 1000`, [wid]);
});

app.post('/v1/ledger', async req => {
  const wid=workspaceId(req); const input=ledgerSchema.parse(req.body);
  const rows=await query<{id:string; [key:string]:unknown}>(
    `insert into ledger_entries (workspace_id,contact_id,direction,category,description,amount_minor,currency,status,due_at,paid_at,recurrence_key,external_ref,metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [wid,input.contactId||null,input.direction,input.category,input.description,input.amountMinor,input.currency,input.status,input.dueAt||null,input.paidAt||null,input.recurrenceKey||null,input.externalRef||null,JSON.stringify(input.metadata)]
  );
  if (input.status==='overdue') await emit(wid,'payment.overdue','nexoffice.erp','ledger_entry',rows[0].id,{description:input.description,amountMinor:input.amountMinor});
  if (input.status==='paid') await emit(wid,'payment.received','nexoffice.erp','ledger_entry',rows[0].id,{description:input.description,amountMinor:input.amountMinor});
  return rows[0];
});

app.post('/v1/events', async req => {
  const wid=workspaceId(req);
  const input=z.object({type:z.string().min(3),source:z.string().default('api'),subjectType:z.string().optional().nullable(),subjectId:z.string().uuid().optional().nullable(),payload:z.record(z.string(),z.unknown()).default({}),correlationId:z.string().optional().nullable()}).parse(req.body);
  return emit(wid,input.type,input.source,input.subjectType||null,input.subjectId||null,input.payload,input.correlationId||null);
});

app.get('/v1/command/actions', async req => {
  const wid=workspaceId(req);
  return query(`select * from command_actions where workspace_id=$1 and status not in ('done','dismissed') order by case priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end, created_at desc limit 200`,[wid]);
});

app.get('/v1/approvals', async req => {
  const wid=workspaceId(req);
  return query(`select * from approval_requests where workspace_id=$1 and status='pending' order by created_at desc limit 200`,[wid]);
});

app.post('/v1/approvals/:id/decision', async req => {
  const wid=workspaceId(req); const id=z.string().uuid().parse((req.params as any).id);
  const input=z.object({decision:z.enum(['approved','rejected']),userId:z.string().uuid().optional().nullable()}).parse(req.body);
  const rows=await query(`update approval_requests set status=$3, decided_by=$4, decided_at=now() where workspace_id=$1 and id=$2 and status='pending' returning *`,[wid,id,input.decision,input.userId||null]);
  if(rows.length) await query(`update command_actions set status=$3, updated_at=now() where workspace_id=$1 and approval_id=$2`,[wid,id,input.decision==='approved'?'executing':'rejected']);
  return rows[0]||{error:'not_found_or_already_decided'};
});

app.post('/v1/usage', async req => {
  const wid=workspaceId(req);
  const input=z.object({capability:z.string(),operation:z.string(),units:z.number().nonnegative(),unitName:z.string(),provider:z.string().optional().nullable(),costMinorEstimate:z.number().int().nonnegative().optional().nullable(),currency:z.string().default('BRL'),metadata:z.record(z.string(),z.unknown()).default({})}).parse(req.body);
  const rows=await query(`insert into usage_events (workspace_id,capability,operation,units,unit_name,provider,cost_minor_estimate,currency,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[wid,input.capability,input.operation,input.units,input.unitName,input.provider||null,input.costMinorEstimate||null,input.currency,JSON.stringify(input.metadata)]);
  return rows[0];
});

app.get('/v1/dashboard', async req => {
  const wid=workspaceId(req);
  const [crm,finance,actions,approvals,usage]=await Promise.all([
    query<any>(`select count(*)::int deals, count(*) filter(where stage not in ('won','lost'))::int open_deals, coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor from crm_deals where workspace_id=$1`,[wid]),
    query<any>(`select coalesce(sum(amount_minor) filter(where direction='income' and status='paid'),0)::bigint income_paid_minor, coalesce(sum(amount_minor) filter(where direction='expense' and status='paid'),0)::bigint expense_paid_minor, coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','overdue')),0)::bigint receivable_minor, count(*) filter(where status='overdue')::int overdue_count from ledger_entries where workspace_id=$1`,[wid]),
    query<any>(`select count(*)::int open_actions from command_actions where workspace_id=$1 and status in ('open','executing')`,[wid]),
    query<any>(`select count(*)::int pending_approvals from approval_requests where workspace_id=$1 and status='pending'`,[wid]),
    query<any>(`select capability, sum(units)::float units, coalesce(sum(cost_minor_estimate),0)::bigint cost_minor from usage_events where workspace_id=$1 and occurred_at>=date_trunc('month',now()) group by capability order by cost_minor desc`,[wid])
  ]);
  return {workspaceId:wid,crm:crm[0],finance:finance[0],command:actions[0],approvals:approvals[0],usage};
});

app.setErrorHandler((error,_req,reply)=>{
  app.log.error(error);
  const status=(error as any)?.statusCode||((error as any)?.issues?400:500);
  reply.code(status).send({error:error instanceof Error?error.message:String(error),issues:(error as any)?.issues});
});

async function emit(workspaceId:string,type:string,source:string,subjectType:string|null,subjectId:string|null,payload:Record<string,unknown>,correlationId:string|null=null){
  const id=randomUUID(); const occurredAt=new Date().toISOString();
  const rows=await query<any>(`insert into business_events (id,workspace_id,type,source,subject_type,subject_id,payload,correlation_id,occurred_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[id,workspaceId,type,source,subjectType,subjectId,JSON.stringify(payload),correlationId,occurredAt]);
  const event:BusinessEvent={id,workspaceId,type,source,subjectType,subjectId,payload,correlationId,occurredAt};
  const action=await processBusinessEvent(event).catch(error=>({error:error instanceof Error?error.message:String(error)}));
  return {event:rows[0],action};
}

await app.listen({port,host:'0.0.0.0'});
