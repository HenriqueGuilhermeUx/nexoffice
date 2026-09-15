import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';

const uuid=z.string().uuid();
const txSchema=z.object({externalRef:z.string().optional().nullable(),provider:z.string().default('manual'),occurredAt:z.string().datetime(),direction:z.enum(['income','expense']),amountMinor:z.number().int().nonnegative(),currency:z.string().length(3).default('BRL'),description:z.string().min(1),counterparty:z.string().optional().nullable(),documentNumber:z.string().optional().nullable(),metadata:z.record(z.string(),z.unknown()).default({})});

export async function registerReconciliationRoutes(app:FastifyInstance){
  app.get('/v1/reconciliation/summary',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const rows=await query<any>(`select count(*)::int total,count(*) filter(where status='unmatched')::int unmatched,count(*) filter(where status='matched')::int matched,count(*) filter(where status='ignored')::int ignored,coalesce(sum(amount_minor) filter(where status='unmatched' and direction='income'),0)::bigint unmatched_income_minor,coalesce(sum(amount_minor) filter(where status='unmatched' and direction='expense'),0)::bigint unmatched_expense_minor from bank_transactions where workspace_id=$1`,[ctx.workspaceId]);return rows[0]
  });
  app.get('/v1/reconciliation/transactions',async req=>{
    const ctx=await workspaceContext(req,'finance.read');const status=String((req.query as any)?.status||'');const accountId=String((req.query as any)?.accountId||'');return query<any>(`select b.*,a.name account_name,m.ledger_entry_id,m.match_type,m.confidence,l.description ledger_description,l.status ledger_status from bank_transactions b join finance_accounts a on a.id=b.account_id left join reconciliation_matches m on m.bank_transaction_id=b.id left join ledger_entries l on l.id=m.ledger_entry_id where b.workspace_id=$1 and ($2='' or b.status=$2) and ($3='' or b.account_id::text=$3) order by b.occurred_at desc limit 1000`,[ctx.workspaceId,status,accountId])
  });
  app.post('/v1/reconciliation/import',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const input=z.object({accountId:uuid,provider:z.string().default('manual'),items:z.array(txSchema).min(1).max(1000)}).parse(req.body);const account=(await query<any>(`select id from finance_accounts where id=$1 and workspace_id=$2 and active=true`,[input.accountId,ctx.workspaceId]))[0];if(!account)throw new ApiError(404,'account_not_found','Conta financeira não encontrada.');let inserted=0,duplicates=0;
    for(const item of input.items){const provider=item.provider||input.provider;const rows=await query<any>(`insert into bank_transactions(workspace_id,account_id,provider,external_ref,occurred_at,direction,amount_minor,currency,description,counterparty,document_number,raw_metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(workspace_id,account_id,provider,external_ref) where external_ref is not null do nothing returning id`,[ctx.workspaceId,input.accountId,provider,item.externalRef||null,item.occurredAt,item.direction,item.amountMinor,item.currency,item.description,item.counterparty||null,item.documentNumber||null,JSON.stringify(item.metadata)]);if(rows.length)inserted++;else duplicates++}
    await auditLog(ctx,'reconciliation.imported','finance_account',input.accountId,null,{inserted,duplicates,provider:input.provider});return {inserted,duplicates,total:input.items.length}
  });
  app.get('/v1/reconciliation/:id/candidates',async req=>{
    const ctx=await workspaceContext(req,'finance.read'),id=uuid.parse((req.params as any).id);const tx=(await query<any>(`select * from bank_transactions where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!tx)throw new ApiError(404,'not_found','Transação importada não encontrada.');return candidateRows(ctx.workspaceId,tx)
  });
  app.post('/v1/reconciliation/:id/match',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);const input=z.object({ledgerEntryId:uuid}).parse(req.body);const tx=(await query<any>(`select * from bank_transactions where id=$1 and workspace_id=$2 for update`,[id,ctx.workspaceId]))[0];if(!tx)throw new ApiError(404,'not_found','Transação importada não encontrada.');if(tx.status==='matched')throw new ApiError(409,'already_matched','Esta transação já foi conciliada.');const ledger=(await query<any>(`select * from ledger_entries where id=$1 and workspace_id=$2`,[input.ledgerEntryId,ctx.workspaceId]))[0];if(!ledger)throw new ApiError(404,'ledger_not_found','Lançamento não encontrado.');if(ledger.direction!==tx.direction)throw new ApiError(400,'direction_mismatch','A natureza da transação não corresponde ao lançamento.');
    await applyMatch(ctx.workspaceId,ctx.user.id,tx,ledger,'manual',1);await auditLog(ctx,'reconciliation.matched','bank_transaction',id,tx,{ledgerEntryId:ledger.id,matchType:'manual'});return {ok:true,transactionId:id,ledgerEntryId:ledger.id}
  });
  app.post('/v1/reconciliation/:id/ignore',async req=>{const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);const rows=await query<any>(`update bank_transactions set status='ignored',updated_at=now() where id=$1 and workspace_id=$2 and status='unmatched' returning *`,[id,ctx.workspaceId]);if(!rows.length)throw new ApiError(404,'not_found_or_processed','Transação não encontrada ou já processada.');await auditLog(ctx,'reconciliation.ignored','bank_transaction',id,null,rows[0]);return rows[0]});
  app.post('/v1/reconciliation/auto-match',async req=>{
    const ctx=await workspaceContext(req,'finance.write');const input=z.object({max:z.number().int().min(1).max(500).default(100),minConfidence:z.number().min(.5).max(1).default(.9)}).parse(req.body||{});const transactions=await query<any>(`select * from bank_transactions where workspace_id=$1 and status='unmatched' order by occurred_at desc limit $2`,[ctx.workspaceId,input.max]);let matched=0,suggested=0;const results:any[]=[];
    for(const tx of transactions){const candidates=await candidateRows(ctx.workspaceId,tx);const best=candidates[0];if(!best)continue;const confidence=Number(best.confidence);if(confidence>=input.minConfidence&&(!candidates[1]||confidence-Number(candidates[1].confidence)>=.08)){const ledger=(await query<any>(`select * from ledger_entries where id=$1 and workspace_id=$2`,[best.id,ctx.workspaceId]))[0];try{await applyMatch(ctx.workspaceId,ctx.user.id,tx,ledger,'automatic',confidence);matched++;results.push({transactionId:tx.id,ledgerEntryId:ledger.id,confidence})}catch{} }else{suggested++}}
    await auditLog(ctx,'reconciliation.auto_match','workspace',ctx.workspaceId,null,{matched,suggested,scanned:transactions.length});return {scanned:transactions.length,matched,suggested,results}
  });
}

async function candidateRows(workspaceId:string,tx:any){
  const rows=await query<any>(`select l.*,c.name contact_name,
    (case when l.amount_minor=$3 then .62 else greatest(0,.62-abs(l.amount_minor-$3)::numeric/greatest($3,1)*.62) end
     + case when abs(extract(epoch from (coalesce(l.paid_at,l.due_at,l.created_at)-$4::timestamptz))/86400)<=1 then .23 when abs(extract(epoch from (coalesce(l.paid_at,l.due_at,l.created_at)-$4::timestamptz))/86400)<=3 then .16 when abs(extract(epoch from (coalesce(l.paid_at,l.due_at,l.created_at)-$4::timestamptz))/86400)<=7 then .08 else 0 end
     + case when lower(coalesce(c.name,''))<>'' and lower($5) like '%'||lower(c.name)||'%' then .1 else 0 end
     + case when l.status='paid' then .05 else 0 end)::numeric(5,4) confidence
    from ledger_entries l left join crm_contacts c on c.id=l.contact_id
    where l.workspace_id=$1 and l.direction=$2 and l.status<>'cancelled' and l.amount_minor between greatest(0,$3::bigint-100) and $3::bigint+100 and coalesce(l.paid_at,l.due_at,l.created_at) between $4::timestamptz-interval '10 days' and $4::timestamptz+interval '10 days'
    order by confidence desc,abs(l.amount_minor-$3),abs(extract(epoch from (coalesce(l.paid_at,l.due_at,l.created_at)-$4::timestamptz))) limit 12`,[workspaceId,tx.direction,Number(tx.amount_minor),tx.occurred_at,String(tx.counterparty||tx.description||'')]);return rows
}

async function applyMatch(workspaceId:string,userId:string,tx:any,ledger:any,matchType:string,confidence:number){
  await transaction(async client=>{await client.query(`insert into reconciliation_matches(workspace_id,bank_transaction_id,ledger_entry_id,match_type,confidence,matched_by) values($1,$2,$3,$4,$5,$6)`,[workspaceId,tx.id,ledger.id,matchType,confidence,userId]);await client.query(`update bank_transactions set status='matched',updated_at=now() where id=$1 and workspace_id=$2`,[tx.id,workspaceId]);if(ledger.status!=='paid')await client.query(`update ledger_entries set status='paid',paid_at=coalesce(paid_at,$3),updated_at=now(),metadata=metadata||$4::jsonb where id=$1 and workspace_id=$2`,[ledger.id,workspaceId,tx.occurred_at,JSON.stringify({reconciled:true,reconciliationProvider:tx.provider,bankTransactionId:tx.id})])});
  if(ledger.direction==='income'&&ledger.status!=='paid')await emitBusinessEvent(workspaceId,'payment.received','nexoffice.reconciliation','ledger_entry',ledger.id,{description:ledger.description,amountMinor:Number(ledger.amount_minor),bankTransactionId:tx.id});
}
