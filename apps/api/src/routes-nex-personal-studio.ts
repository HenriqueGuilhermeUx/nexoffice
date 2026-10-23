import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query,transaction} from './db.js';

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
function inferCategory(description:string){
  const s=description.toLowerCase();
  if(/mercado|supermerc|hortifruti|padaria|atacad/.test(s))return 'Alimentação';
  if(/ifood|restaurante|lanchonete|pizzaria|delivery/.test(s))return 'Restaurantes';
  if(/uber|99pop|combustivel|posto |metro|metrô|onibus|ônibus/.test(s))return 'Transporte';
  if(/netflix|spotify|prime video|assinatura|youtube premium/.test(s))return 'Assinaturas';
  if(/farmacia|farmácia|hospital|clinica|clínica/.test(s))return 'Saúde';
  if(/energia|enel|sabesp|condominio|condomínio|internet|telefone/.test(s))return 'Moradia';
  return 'Outros';
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
      const inserted=await client.query<{id:string}>(
        "insert into nex_personal.transactions(owner_user_id,account_id,provider_transaction_ref,description,amount_minor,currency,category,booked_at,source) values($1,$2,$3,$4,$5,'BRL',$6,$7::date + interval '12 hours','manual') returning id",
        [owner,input.accountId,'manual-'+randomUUID(),input.description,input.amountMinor,input.category||inferCategory(input.description),input.bookedOn]
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
      let imported=0,duplicates=0;
      for(const row of input.rows){
        const canonical=[input.accountId,row.date,row.description.toLowerCase().replace(/\s+/g,' ').trim(),row.amountMinor,row.reference||''].join('|');
        const fingerprint=createHash('sha256').update(canonical).digest('hex');
        const result=await client.query(
          "insert into nex_personal.transactions(owner_user_id,account_id,provider_transaction_ref,description,amount_minor,currency,category,booked_at,source,fingerprint) values($1,$2,$3,$4,$5,'BRL',$6,$7::date + interval '12 hours','csv',$8) on conflict do nothing returning id",
          [owner,input.accountId,'csv-'+fingerprint,row.description,row.amountMinor,row.category||inferCategory(row.description),row.date,fingerprint]
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
      note:'Duplicatas idênticas (data, descrição e valor) são ignoradas. Use referência diferente para lançamentos distintos com os mesmos dados.'};
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
      query<any>("select id,account_id,description,amount_minor::text amount_minor,category,source,booked_at from nex_personal.transactions where owner_user_id=$1 order by booked_at desc,id desc limit 100",[owner]),
      query<any>("select id,month,category,limit_minor::text limit_minor from nex_personal.budgets where owner_user_id=$1 and month=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date order by category",[owner]),
      query<any>("select id,name,target_minor::text target_minor,saved_minor::text saved_minor,due_on,status from nex_personal.goals where owner_user_id=$1 order by created_at desc",[owner]),
      query<any>("select id,name,kind,category,amount_minor::text amount_minor,currency from nex_personal.wealth_items where owner_user_id=$1 order by created_at desc",[owner]),
      query<any>("select id,name,category,amount_minor::text amount_minor,next_due_on,interval_months,active from nex_personal.bills where owner_user_id=$1 and active=true order by next_due_on",[owner]),
      query<any>("select coalesce(category,'Outros') category, sum(-amount_minor)::text spent_minor from nex_personal.transactions where owner_user_id=$1 and currency='BRL' and amount_minor<0 and booked_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') and booked_at<date_trunc('month',now() at time zone 'America/Sao_Paulo')+interval '1 month' group by coalesce(category,'Outros') order by sum(-amount_minor) desc",[owner])
    ]);
    const sum=(items:any[],select:(v:any)=>string)=>items.reduce((n,v)=>n+BigInt(select(v)),0n);
    const manualTotal=sum(accounts,r=>r.available_minor||'0');
    const assets=sum(wealth.filter(w=>w.kind==='asset'&&w.currency==='BRL'),r=>r.amount_minor);
    const liabilities=sum(wealth.filter(w=>w.kind==='liability'&&w.currency==='BRL'),r=>r.amount_minor);
    const spent=sum(spentByCategory,r=>r.spent_minor);
    const spentMap=new Map<string,bigint>(spentByCategory.map(r=>[r.category,BigInt(r.spent_minor)]));
    const budgetItems=budgets.map(b=>({...b,spent_minor:String(spentMap.get(b.category)||0n)}));
    const upcoming=bills.filter(b=>{
      const d=new Date(String(b.next_due_on).slice(0,10)+'T12:00:00Z').getTime()-Date.now();
      return d<=30*86400000;
    });
    const upcomingTotal=sum(upcoming,r=>r.amount_minor);
    const insights:Array<{kind:string;title:string;detail:string;source:string}>=[];
    for(const b of budgetItems)if(BigInt(b.spent_minor)>BigInt(b.limit_minor))
      insights.push({kind:'budget',title:'Orçamento ultrapassado: '+b.category,
        detail:'Gastos registrados: '+b.spent_minor+' centavos, limite informado: '+b.limit_minor+' centavos.',source:'transactions_and_manual_budget'});
    if(upcoming.length)insights.push({kind:'bills',title:'Compromissos nos próximos 30 dias',
      detail:upcoming.length+' lembrete(s) totalizando '+String(upcomingTotal)+' centavos.',source:'user_scheduled_bills'});
    if(accounts.length)insights.push({kind:'balance',title:'Saldo declarado',
      detail:'O total de '+String(manualTotal)+' centavos vem de contas preenchidas por você. Não há verificação bancária.',source:'user_declared_accounts'});
    if(!accounts.length&&!transactions.length)insights.push({kind:'start',title:'Comece com seus próprios dados',
      detail:'Cadastre uma conta ou importe um CSV. Nenhuma instituição financeira foi conectada.',source:'empty_state'});
    return {
      accounts,transactions,budgets:budgetItems,goals,wealth,bills,spentByCategory,
      totals:{manualAvailableMinor:String(manualTotal),spentMonthMinor:String(spent),
        declaredAssetsMinor:String(assets),declaredLiabilitiesMinor:String(liabilities),
        declaredNetWorthMinor:String(manualTotal+assets-liabilities),
        upcomingBillsMinor:String(upcomingTotal)},
      maya:{mode:'deterministic_insights',externalModelCalled:false,insights},
      provenance:{accounts:'user_declared',expenses:'entered_or_imported',verifiedBanking:false,
        note:'Patrimônio parcial e informativo. Valores de metas não são somados novamente ao patrimônio.'},
      externalEffect:false
    };
  });
}
