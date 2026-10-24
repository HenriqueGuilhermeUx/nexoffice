import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query,transaction} from './db.js';
import {enrichBankTransaction,previewEnrichment} from '@nexoffice/integrations/personal-etl';
import {detectRecurringExpenses} from '@nexoffice/integrations/personal-recurring';
import {summarizePersonalBills} from './personal-bill-window.js';

const id=z.string().uuid();
const amount=z.string().regex(/^-?\d{1,13}$/,'Informe um valor válido em centavos.');
const positive=amount.refine(v=>BigInt(v)>0n,'Informe um valor positivo.');
const text=z.string().trim().min(2).max(120);
const category=z.string().trim().min(2).max(70);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Data inválida.');
const currency=z.literal('BRL').default('BRL');

async function ownerOf(req:FastifyRequest):Promise<string>{
  const user=await authenticate(req);
  const profile=await query<{user_id:string}>('select user_id from nex_personal.profiles where user_id=$1',[user.id]);
  if(!profile.length)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nex Personal primeiro.');
  return user.id;
}
function monthKey(date:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(date))throw new ApiError(400,'invalid_month','Mês inválido.');
  return date+'-01';
}

async function manualAccount(owner:string,accountId:string){
  const rows=await query<{id:string}>(
    "select id from nex_personal.accounts where owner_user_id=$1 and id=$2 and provider='manual' and status='active'",
    [owner,accountId]
  );
  if(!rows.length)throw new ApiError(404,'manual_account_not_found','Conta manual não encontrada no seu espaço.');
}
async function audit(owner:string,action:string,subjectType:string,subjectId?:string){
  await query(
    'insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type,subject_id) values($1,$1,$2,$3,$4)',
    [owner,action,subjectType,subjectId||null]
  );
}

export async function registerNexPersonalStudioRoutes(app:FastifyInstance){
  // Values in manual accounts are declared by the user, NOT Open Finance verified.
  app.post('/v1/personal/manual-accounts',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({name:text,institutionName:text.optional(),balanceMinor:amount,currency}).strict().parse(req.body);
    const externalRef='manual-'+randomUUID();
    const rows=await query<{id:string}>(
      "insert into nex_personal.accounts(owner_user_id,provider,provider_account_ref,institution_name,name,account_type,currency,current_minor,available_minor,balance_as_of,status) values($1,'manual',$2,$3,$4,'manual',$5,$6,$6,now(),'active') returning id",
      [owner,externalRef,input.institutionName||'Conta informada por você',input.name,input.currency,input.balanceMinor]
    );
    await audit(owner,'manual_account.created','account',rows[0].id);
    return {id:rows[0].id,source:'user_declared',verified:false,externalEffect:false};
  });

  app.put('/v1/personal/manual-accounts/:id/balance',async req=>{
    const owner=await ownerOf(req),accountId=id.parse((req.params as any).id);
    const input=z.object({balanceMinor:amount}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      "update nex_personal.accounts set current_minor=$3,available_minor=$3,balance_as_of=now(),updated_at=now() where id=$1 and owner_user_id=$2 and provider='manual' and status='active' returning id",
      [accountId,owner,input.balanceMinor]
    );
    if(!rows.length)throw new ApiError(404,'not_found','Conta não encontrada.');
    await audit(owner,'manual_account.balance_declared','account',accountId);
    return {updated:true,source:'user_declared',verified:false,externalEffect:false};
  });

  app.post('/v1/personal/transactions/manual',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({
      accountId:id,description:text,amountMinor:amount.refine(v=>BigInt(v)!==0n),
      bookedOn:day,category:category.optional(),applyToBalance:z.boolean().default(false)
    }).strict().parse(req.body);
    // Only a manual balance can be modified, and only by the user's explicit checkbox.
    const result=await transaction(async client=>{
      const acc=await client.query<{id:string}>(
        "select id from nex_personal.accounts where id=$1 and owner_user_id=$2 and provider='manual' and status='active' for update",
        [input.accountId,owner]
      );
      if(!acc.rows.length)throw new ApiError(404,'manual_account_not_found','Conta manual não encontrada.');
      const enriched=enrichBankTransaction({source:'csv',accountRef:input.accountId,date:input.bookedOn,
        description:input.description,amountMinor:input.amountMinor,currency:'BRL'});
      const inserted=await client.query<{id:string}>(
        "insert into nex_personal.transactions(owner_user_id,account_id,provider_transaction_ref,description,amount_minor,currency,category,booked_at,source,analysis_role,analysis_confidence,category_origin,analysis_rule) values($1,$2,$3,$4,$5,'BRL',$6,$7::date + interval '12 hours','manual',$8,$9,$10,$11) returning id",
        [owner,input.accountId,'manual-'+randomUUID(),input.description,input.amountMinor,input.category||enriched.category,input.bookedOn,
          enriched.treatment,enriched.confidence,input.category?'user':'rule',enriched.reason]
      );
      if(input.applyToBalance)await client.query(
        "update nex_personal.accounts set current_minor=current_minor+$3::bigint,available_minor=available_minor+$3::bigint,balance_as_of=now(),updated_at=now() where id=$1 and owner_user_id=$2",
        [input.accountId,owner,input.amountMinor]
      );
      await client.query(
        "insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type,subject_id) values($1,$1,'transaction.manual_added','transaction',$2)",
        [owner,inserted.rows[0].id]
      );
      return inserted.rows[0].id;
    });
    return {id:result,source:'manual',balanceAdjusted:input.applyToBalance,externalEffect:false};
  });

  const importRow=z.object({
    date:day,
    description:text,
    amountMinor:amount.refine(v=>BigInt(v)!==0n),
    category:category.optional(),
    reference:z.string().trim().max(120).optional()
  }).strict();

  app.post('/v1/personal/transactions/import',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({accountId:id,rows:z.array(importRow).min(1).max(250)}).strict().parse(req.body);
    await manualAccount(owner,input.accountId);
    // Any historical CSV import leaves the manually declared *current* balance unchanged.
    const counts=await transaction(async client=>{
      const acc=await client.query(
        "select id from nex_personal.accounts where id=$1 and owner_user_id=$2 and provider='manual' and status='active' for update",
        [input.accountId,owner]
      );
      if(!acc.rows.length)throw new ApiError(404,'manual_account_not_found','Conta não encontrada.');
      // Keep every repeated charge: a weak description/date/amount cannot
      // uniquely identify a bank posting. Make the *whole file* idempotent,
      // even if rows are reordered by the bank, using a sorted multiset.
      const normalizedRows=input.rows.map(row=>[
        row.date,row.description.toLowerCase().replace(/\s+/g,' ').trim(),row.amountMinor,row.reference||''
      ]);
      const rowSignatures=normalizedRows.map(row=>JSON.stringify(row));
      const batchHash=createHash('sha256').update(JSON.stringify([...rowSignatures].sort())).digest('hex');
      // Backward compatible with imports made using the first, order-sensitive
      // batch key. Existing file reimports still skip their old fingerprints.
      const legacyBatchHash=createHash('sha256').update(JSON.stringify(normalizedRows)).digest('hex');
      const legacyFingerprints=input.rows.map((row,index)=>row.reference?null:createHash('sha256')
        .update(['csv-batch-v2',input.accountId,legacyBatchHash,index].join('|')).digest('hex'));
      const previous=await client.query<{fingerprint:string}>(
        "select fingerprint from nex_personal.transactions where owner_user_id=$1 and account_id=$2 and fingerprint=any($3::text[])",
        [owner,input.accountId,legacyFingerprints.filter((key):key is string=>key!==null)]
      );
      const legacySeen=new Set(previous.rows.map(r=>r.fingerprint));
      const occurrences=new Map<string,number>();
      let imported=0,duplicates=0;
      for(const [index,row] of input.rows.entries()){
        const canonical=[input.accountId,row.date,row.description.toLowerCase().replace(/\s+/g,' ').trim(),row.amountMinor,row.reference||''].join('|');
        const signature=rowSignatures[index];
        const occurrence=occurrences.get(signature)||0;
        occurrences.set(signature,occurrence+1);
        // Existing strong-reference fingerprints stay unchanged. When there is
        // no reference, the row's ordinal among identical rows is stable even
        // if the statement order changes.
        const key=row.reference?canonical:['csv-batch-v3',input.accountId,batchHash,signature,occurrence].join('|');
        const fingerprint=createHash('sha256').update(key).digest('hex');
        if(legacyFingerprints[index]&&legacySeen.has(legacyFingerprints[index]!)){
          duplicates++;
          continue;
        }
        const enriched=enrichBankTransaction({source:'csv',accountRef:input.accountId,date:row.date,
          description:row.description,amountMinor:row.amountMinor,currency:'BRL',reference:row.reference});
        const result=await client.query(
          "insert into nex_personal.transactions(owner_user_id,account_id,provider_transaction_ref,description,amount_minor,currency,category,booked_at,source,fingerprint,analysis_role,analysis_confidence,category_origin,analysis_rule) values($1,$2,$3,$4,$5,'BRL',$6,$7::date + interval '12 hours','csv',$8,$9,$10,$11,$12) on conflict do nothing returning id",
          [owner,input.accountId,'csv-'+fingerprint,row.description,row.amountMinor,row.category||enriched.category,row.date,fingerprint,
            enriched.treatment,enriched.confidence,row.category?'user':'rule',enriched.reason]
        );
        if(result.rowCount)imported++;else duplicates++;
      }
      await client.query(
        "insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type,subject_id) values($1,$1,'transactions.csv_imported','account',$2)",
        [owner,input.accountId]
      );
      return {imported,duplicates};
    });
    return {...counts,source:'csv',verified:false,currentBalanceChanged:false,externalEffect:false,
      note:'Referências bancárias identificam duplicatas. Sem referência, linhas iguais do arquivo são preservadas e reimportações com linhas reordenadas são idempotentes; arquivos diferentes com períodos sobrepostos ainda podem duplicar lançamentos e exigem revisão.'};
  });

  // Data supplied voluntarily for a read-only preview. No provider / wallet API is
  // queried, no addresses are attached to identities, and no raw feed is persisted.
  const bankPreview=z.object({
    source:z.enum(['csv','open_finance']),accountRef:z.string().trim().min(2).max(120),
    date:day,description:z.string().trim().min(2).max(500),
    amountMinor:amount.refine(v=>BigInt(v)!==0n),currency:z.literal('BRL'),
    reference:z.string().trim().max(120).optional(),
    merchantName:z.string().trim().max(160).optional(),
    providerCategory:z.string().trim().max(100).optional(),
    selfTransferConfirmed:z.boolean().optional()
  }).strict();
  const walletPreview=z.object({
    source:z.literal('onchain'),chainId:z.number().int().min(1).max(1000000000),
    walletAddress:z.string(),from:z.string(),to:z.string(),txHash:z.string(),
    logIndex:z.number().int().min(0).max(1000000),
    contractAddress:z.string().optional(),symbol:z.string(),
    amountAtomic:z.string(),decimals:z.number().int().min(0).max(36),
    status:z.enum(['confirmed','pending','reverted']),
    action:z.enum(['transfer','swap','bridge','reward','gas']).optional(),
    confirmedOwnWallets:z.array(z.string()).max(12).optional()
  }).strict();
  app.post('/v1/personal/transactions/enrichment/preview',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({items:z.array(z.discriminatedUnion('source',[
      bankPreview.extend({source:z.literal('csv')}),
      bankPreview.extend({source:z.literal('open_finance')}),
      walletPreview
    ])).min(1).max(40)}).strict().parse(req.body);
    const result=previewEnrichment(input.items);
    // Audit only the fact that a preview was run. Never log raw statements,
    // addresses, merchant text or blockchain transaction hashes.
    await audit(owner,'transaction.enrichment_previewed','transaction_preview');
    return result;
  });

  app.post('/v1/personal/budgets',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({month:z.string(),category,limitMinor:positive}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      'insert into nex_personal.budgets(owner_user_id,month,category,limit_minor) values($1,$2,$3,$4) on conflict(owner_user_id,month,category) do update set limit_minor=excluded.limit_minor,updated_at=now() returning id',
      [owner,monthKey(input.month),input.category,input.limitMinor]
    );
    await audit(owner,'budget.saved','budget',rows[0].id);
    return {id:rows[0].id,externalEffect:false};
  });

  app.post('/v1/personal/goals',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({name:text,targetMinor:positive,savedMinor:amount.refine(v=>BigInt(v)>=0n).default('0'),dueOn:day.nullable().optional()}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      'insert into nex_personal.goals(owner_user_id,name,target_minor,saved_minor,due_on) values($1,$2,$3,$4,$5) returning id',
      [owner,input.name,input.targetMinor,input.savedMinor,input.dueOn||null]
    );
    await audit(owner,'goal.created','goal',rows[0].id);
    return {id:rows[0].id,externalEffect:false};
  });
  app.put('/v1/personal/goals/:id/progress',async req=>{
    const owner=await ownerOf(req),goalId=id.parse((req.params as any).id);
    const input=z.object({savedMinor:amount.refine(v=>BigInt(v)>=0n)}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      "update nex_personal.goals set saved_minor=$3,status=case when $3::bigint>=target_minor then 'completed' else 'active' end,updated_at=now() where owner_user_id=$1 and id=$2 returning id",
      [owner,goalId,input.savedMinor]
    );
    if(!rows.length)throw new ApiError(404,'not_found','Meta não encontrada.');
    await audit(owner,'goal.progress_updated','goal',goalId);
    return {updated:true,externalEffect:false};
  });

  app.post('/v1/personal/wealth',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({name:text,kind:z.enum(['asset','liability']),category,amountMinor:amount.refine(v=>BigInt(v)>=0n),currency}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      'insert into nex_personal.wealth_items(owner_user_id,name,kind,category,amount_minor,currency) values($1,$2,$3,$4,$5,$6) returning id',
      [owner,input.name,input.kind,input.category,input.amountMinor,input.currency]
    );
    await audit(owner,'wealth_item.created','wealth_item',rows[0].id);
    return {id:rows[0].id,externalEffect:false};
  });
  app.delete('/v1/personal/wealth/:id',async req=>{
    const owner=await ownerOf(req),itemId=id.parse((req.params as any).id);
    const rows=await query<{id:string}>('delete from nex_personal.wealth_items where id=$1 and owner_user_id=$2 returning id',[itemId,owner]);
    if(!rows.length)throw new ApiError(404,'not_found','Item não encontrado.');
    await audit(owner,'wealth_item.deleted','wealth_item',itemId);
    return {deleted:true,externalEffect:false};
  });

  app.post('/v1/personal/bills',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({name:text,amountMinor:positive,category:category.default('Contas'),nextDueOn:day,intervalMonths:z.number().int().min(0).max(12).default(1)}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      'insert into nex_personal.bills(owner_user_id,name,amount_minor,category,next_due_on,interval_months) values($1,$2,$3,$4,$5,$6) returning id',
      [owner,input.name,input.amountMinor,input.category,input.nextDueOn,input.intervalMonths]
    );
    await audit(owner,'bill.created','bill',rows[0].id);
    return {id:rows[0].id,externalEffect:false,scheduledPayment:false};
  });
  app.post('/v1/personal/bills/:id/complete',async req=>{
    const owner=await ownerOf(req),billId=id.parse((req.params as any).id);
    const rows=await query<{id:string}>(
      "update nex_personal.bills set next_due_on=case when interval_months>0 then (next_due_on+make_interval(months=>interval_months))::date else next_due_on end,active=(interval_months>0),updated_at=now() where owner_user_id=$1 and id=$2 and active=true returning id",
      [owner,billId]
    );
    if(!rows.length)throw new ApiError(404,'not_found','Lembrete não encontrado.');
    await audit(owner,'bill.marked_completed','bill',billId);
    return {updated:true,scheduledPayment:false,externalEffect:false};
  });

  app.get('/v1/personal/studio',async req=>{
    const owner=await ownerOf(req);
    const [
      accounts,transactions,budgets,goals,wealth,bills,spentByCategory
    ]=await Promise.all([
      query<any>("select id,name,institution_name,available_minor::text available_minor,balance_as_of from nex_personal.accounts where owner_user_id=$1 and provider='manual' and status='active' order by created_at",[owner]),
      query<any>("select id,account_id,description,amount_minor::text amount_minor,category,source,booked_at,analysis_role,analysis_confidence,category_origin,analysis_rule from nex_personal.transactions where owner_user_id=$1 order by booked_at desc,id desc limit 100",[owner]),
      query<any>("select id,month,category,limit_minor::text limit_minor from nex_personal.budgets where owner_user_id=$1 and month=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date order by category",[owner]),
      query<any>("select id,name,target_minor::text target_minor,saved_minor::text saved_minor,due_on,status from nex_personal.goals where owner_user_id=$1 order by created_at desc",[owner]),
      query<any>("select id,name,kind,category,amount_minor::text amount_minor,currency from nex_personal.wealth_items where owner_user_id=$1 order by created_at desc",[owner]),
      query<any>("select id,name,category,amount_minor::text amount_minor,next_due_on,interval_months,active from nex_personal.bills where owner_user_id=$1 and active=true order by next_due_on",[owner]),
      query<any>("select coalesce(category,'Outros') category, sum(-amount_minor)::text spent_minor from nex_personal.transactions where owner_user_id=$1 and currency='BRL' and amount_minor<0 and (analysis_role is null or analysis_role='expense') and booked_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') and booked_at<date_trunc('month',now() at time zone 'America/Sao_Paulo')+interval '1 month' group by coalesce(category,'Outros') order by sum(-amount_minor) desc",[owner])
    ]);
    const sum=(items:any[],select:(v:any)=>string)=>items.reduce((n,v)=>n+BigInt(select(v)),0n);
    const manualTotal=sum(accounts,r=>r.available_minor||'0');
    const assets=sum(wealth.filter(w=>w.kind==='asset'&&w.currency==='BRL'),r=>r.amount_minor);
    const liabilities=sum(wealth.filter(w=>w.kind==='liability'&&w.currency==='BRL'),r=>r.amount_minor);
    const spent=sum(spentByCategory,r=>r.spent_minor);
    const spentMap=new Map<string,bigint>(spentByCategory.map(r=>[r.category,BigInt(r.spent_minor)]));
    const budgetItems=budgets.map(b=>({...b,spent_minor:String(spentMap.get(b.category)||0n)}));
    // Due dates are calendar dates in Brazil, not timestamps. Older reminders
    // need review and must NOT inflate the "next 30 days" amount.
    const billSummary=summarizePersonalBills(bills);
    const insights:Array<{kind:string;title:string;detail:string;source:string}>=[];
    for(const b of budgetItems)if(BigInt(b.spent_minor)>BigInt(b.limit_minor))
      insights.push({kind:'budget',title:'Orçamento ultrapassado: '+b.category,
        detail:'Gastos registrados: '+b.spent_minor+' centavos, limite informado: '+b.limit_minor+' centavos.',source:'transactions_and_manual_budget'});
    if(billSummary.upcomingCount)insights.push({kind:'bills',title:'Compromissos nos próximos 30 dias',
      detail:billSummary.upcomingCount+' lembrete(s) totalizando '+billSummary.upcomingTotalMinor+' centavos.',source:'user_scheduled_bills'});
    if(billSummary.pastDatedCount)insights.push({kind:'past_dated_bills',title:'Lembretes com vencimento anterior',
      detail:billSummary.pastDatedCount+' lembrete(s) com data passada somam '+billSummary.pastDatedTotalMinor+' centavos declarados. Confira se já foram pagos; não é confirmação de dívida vencida.',source:'user_scheduled_bills'});
    if(accounts.length)insights.push({kind:'balance',title:'Saldo declarado',
      detail:'O total de '+String(manualTotal)+' centavos vem de contas preenchidas por você. Não há verificação bancária.',source:'user_declared_accounts'});
    if(!accounts.length&&!transactions.length)insights.push({kind:'start',title:'Comece com seus próprios dados',
      detail:'Cadastre uma conta ou importe um CSV. Nenhuma instituição financeira foi conectada.',source:'empty_state'});
    return {
      accounts,transactions,budgets:budgetItems,goals,wealth,bills,spentByCategory,
      totals:{manualAvailableMinor:String(manualTotal),spentMonthMinor:String(spent),
        declaredAssetsMinor:String(assets),declaredLiabilitiesMinor:String(liabilities),
        declaredNetWorthMinor:String(manualTotal+assets-liabilities),
        upcomingBillsMinor:billSummary.upcomingTotalMinor,
        pastDatedBillsMinor:billSummary.pastDatedTotalMinor,pastDatedBillCount:billSummary.pastDatedCount},
      maya:{mode:'deterministic_insights',externalModelCalled:false,insights},
      provenance:{accounts:'user_declared',expenses:'entered_or_imported',verifiedBanking:false,
        note:'Patrimônio parcial e informativo. Valores de metas não são somados novamente ao patrimônio.'},
      externalEffect:false
    };
  });

  // Personal insights only; we never send transaction narratives to marketers
  // or external models. Excludes unreviewed transfers and sensitive categories.
  app.get('/v1/personal/transactions/recurring-patterns',async req=>{
    const owner=await ownerOf(req);
    const rows=await query<{
      booked_day:string;description:string;category:string|null;amount_minor:string;
      analysis_role:'expense'|'income'|'excluded_internal'|'review'|null
    }>(
      "select to_char(booked_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') booked_day,description,category,amount_minor::text amount_minor,analysis_role from nex_personal.transactions where owner_user_id=$1 and currency='BRL' and amount_minor<0 and analysis_role='expense' and booked_at>=now()-interval '14 months' order by booked_at desc limit 1800",
      [owner]
    );
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const result=detectRecurringExpenses(rows.map(r=>({
      bookedAt:r.booked_day,description:r.description,category:r.category,
      amountMinor:r.amount_minor,analysisRole:r.analysis_role
    })),date,8);
    return {...result,analysisScope:'authenticated_personal_finances',persisted:false};
  });

  app.patch('/v1/personal/transactions/:id/classification',async req=>{
    const owner=await ownerOf(req),transactionId=id.parse((req.params as any).id);
    const input=z.object({
      treatment:z.enum(['expense','income','excluded_internal','review']),
      category:category.optional(),confirmOwnTransfer:z.boolean().optional()
    }).strict().parse(req.body);
    if(input.treatment==='excluded_internal'&&input.confirmOwnTransfer!==true)
      throw new ApiError(400,'own_transfer_confirmation_required','Confirme que as contas são suas antes de excluir o valor dos gastos.');
    const rows=await query<{id:string}>(
      "update nex_personal.transactions set analysis_role=$3,analysis_confidence='high',category_origin='user',analysis_rule='user_reviewed',category=coalesce($4,category) where owner_user_id=$1 and id=$2 and ($3='review' or ($3='income' and amount_minor>0) or ($3='expense' and amount_minor<0) or $3='excluded_internal') returning id",
      [owner,transactionId,input.treatment,input.category||null]
    );
    if(!rows.length)throw new ApiError(404,'not_found','Movimentação não encontrada ou direção incompatível.');
    await audit(owner,'transaction.classification_reviewed','transaction',transactionId);
    return {updated:true,userReviewed:true,externalEffect:false};
  });

  app.patch('/v1/personal/transactions/:id/category',async req=>{
    const owner=await ownerOf(req),transactionId=id.parse((req.params as any).id);
    const input=z.object({category}).strict().parse(req.body);
    const rows=await query<{id:string}>(
      "update nex_personal.transactions set category=$3,category_origin='user' where owner_user_id=$1 and id=$2 returning id",
      [owner,transactionId,input.category]
    );
    if(!rows.length)throw new ApiError(404,'not_found','Movimentação não encontrada.');
    await audit(owner,'transaction.category_changed','transaction',transactionId);
    return {updated:true,externalEffect:false};
  });

  // Grounded assistant: deterministic answers from only the authenticated user's numbers.
  // No model call or sensitive financial data sent to third parties.
  app.post('/v1/personal/maya/ask',async req=>{
    const owner=await ownerOf(req);
    const input=z.object({question:z.string().trim().min(3).max(400)}).strict().parse(req.body);
    const q=input.question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const [accountRows,spendingRows,bills,goals]=await Promise.all([
      query<any>("select count(*)::int qty,coalesce(sum(available_minor),0)::text total from nex_personal.accounts where owner_user_id=$1 and provider='manual' and currency='BRL' and status='active'",[owner]),
      query<any>("select coalesce(sum(-amount_minor),0)::text spent_minor,coalesce(count(*),0)::int tx_count from nex_personal.transactions where owner_user_id=$1 and currency='BRL' and amount_minor<0 and (analysis_role is null or analysis_role='expense') and booked_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo')",[owner]),
      query<any>("select name,amount_minor::text amount_minor,next_due_on,interval_months from nex_personal.bills where owner_user_id=$1 and active=true order by next_due_on limit 60",[owner]),
      query<any>("select name,target_minor::text target_minor,saved_minor::text saved_minor,due_on from nex_personal.goals where owner_user_id=$1 and status='active' order by created_at desc limit 20",[owner])
    ]);
    const fmt=(s:string)=>{const v=BigInt(s),abs=v<0n?-v:v;return (v<0n?'-':'')+'R$ '+(abs/100n).toLocaleString('pt-BR')+','+String(abs%100n).padStart(2,'0');};
    const declared=String(accountRows[0].total),spent=String(spendingRows[0].spent_minor);
    let answer='',evidence:string[]=[];
    if(/assinatura|recorrente|mensalidade/.test(q)){
      const items=bills.filter(b=>b.interval_months>0);
      answer=items.length?'Você cadastrou '+items.length+' compromisso(s) recorrente(s). A soma nominal registrada é '+fmt(String(items.reduce((n,b)=>n+BigInt(b.amount_minor),0n)))+' por ciclo individual; os ciclos variam e não equivalem todos a uma mensalidade.':'Ainda não há compromissos recorrentes cadastrados aqui. Isso não significa que não existam assinaturas nos seus bancos.';
      evidence=['nex_personal.bills'];
    }else if(/meta|guardar|poupar|reserva/.test(q)){
      if(!goals.length)answer='Você ainda não cadastrou metas. Crie uma meta com valor alvo e valor reservado para eu calcular quanto falta.';
      else {
        const g=goals[0],remaining=BigInt(g.target_minor)-BigInt(g.saved_minor);
        answer='Na meta "'+g.name+'", você informou '+fmt(g.saved_minor)+' de '+fmt(g.target_minor)+'. Falta '+fmt(String(remaining>0n?remaining:0n))+'. Isso é acompanhamento, não recomendação de investimento.';
      }
      evidence=['nex_personal.goals'];
    }else if(/vencimento|contas? a pagar|contas? venc|proxim|boletos?/.test(q)){
      const thirty=Date.now()+30*86400000;
      const pending=bills.filter(b=>new Date(b.next_due_on).getTime()<=thirty);
      const due=pending.reduce((n,b)=>n+BigInt(b.amount_minor),0n);
      answer=pending.length?'Você cadastrou '+pending.length+' conta(s) com vencimento nos próximos 30 dias, somando '+fmt(String(due))+'. Esses são lembretes, não pagamentos agendados.':'Não há contas cadastradas para os próximos 30 dias. Posso avaliar apenas os vencimentos que você informar.';
      evidence=['nex_personal.bills'];
    }else if(/gasto|gastei|despesa|consumo|mes/.test(q)){
      answer=Number(spendingRows[0].tx_count)>0?'Neste mês, as despesas que você registrou ou importou somam '+fmt(spent)+'. Esse número pode estar incompleto, pois ainda não há conexão bancária.':'Ainda não há despesas registradas neste mês. Importar um CSV ajuda a começar a análise.';
      evidence=['nex_personal.transactions'];
    }else if(/dinheiro|saldo|posso comprar|disponivel|sobrar/.test(q)){
      answer=Number(accountRows[0].qty)>0?'Seu saldo total declarado nas contas manuais é '+fmt(declared)+'. Sem histórico completo de renda, despesas e obrigações, não consigo afirmar se uma compra cabe com segurança no orçamento.':'Você ainda não informou contas e saldos. Não consigo calcular seu dinheiro disponível sem dados.';
      evidence=['nex_personal.accounts'];
    }else if(/divida|emprestimo|credito|juros/.test(q)){
      answer='Posso organizar suas dívidas declaradas, mas para decidir qual pagar primeiro preciso também de taxas de juros, parcelas e condições dos contratos. Não vou inventar essas informações.';
      evidence=['nex_personal.wealth_items'];
    }else{
      answer='Posso analisar saldos declarados, gastos do mês, metas e contas a vencer. Pergunte, por exemplo: "quanto gastei?", "quanto falta para minha meta?" ou "quais contas vencem?".';
      evidence=[];
    }
    return {answer,evidence,verifiedBanking:false,source:'user_declared_or_imported',
      modelCalled:false,canInitiatePayment:false,externalEffect:false,disclaimer:'Resposta informativa baseada apenas em dados cadastrados no Nex Personal.'};
  });
}
