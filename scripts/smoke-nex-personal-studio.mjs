import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';

if(!process.env.DATABASE_URL)throw new Error('Disposable Postgres database required.');
const host='http://127.0.0.1:'+String(process.env.PORT||4000);
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
await db.connect();

 // Regression: month boundaries must use the Sao Paulo calendar, not the DB's GMT timezone.
 const monthBoundaries=await db.query(`with instants(instant) as (
  values ('2026-10-01 01:30+00'::timestamptz),('2026-11-01 02:30+00'::timestamptz)
 ) select to_char(instant at time zone 'America/Sao_Paulo','YYYY-MM') local_month,
 date_trunc('month',instant,'America/Sao_Paulo') month_start,
 date_trunc('month',instant+interval '1 month','America/Sao_Paulo') month_end
 from instants order by instant`);
 assert.deepEqual(monthBoundaries.rows.map(row=>({
  month:row.local_month,start:new Date(row.month_start).toISOString(),end:new Date(row.month_end).toISOString()
 })),[
  {month:'2026-09',start:'2026-09-01T03:00:00.000Z',end:'2026-10-01T03:00:00.000Z'},
  {month:'2026-10',start:'2026-10-01T03:00:00.000Z',end:'2026-11-01T03:00:00.000Z'}
 ],'Month rollover must follow America/Sao_Paulo, even when UTC has crossed midnight');
 const studioRoute=readFileSync('apps/api/src/routes-nex-personal-studio.ts','utf8');
 const overviewRoute=readFileSync('apps/api/src/routes-nex-personal.ts','utf8');
 for(const source of [studioRoute,overviewRoute]){
  assert.ok(source.includes("booked_at>=date_trunc('month',now(),'America/Sao_Paulo')"),
   'Monthly expenses must use an explicit Sao Paulo timestamptz boundary');
 }
 assert.ok(studioRoute.includes("booked_at<date_trunc('month',now()+interval '1 month','America/Sao_Paulo')"),
  'Studio must exclude transactions outside the local calendar month');
 assert.ok(overviewRoute.includes("booked_at<date_trunc('month',now()+interval '1 month','America/Sao_Paulo')"),
  'Overview must use the same month end as Studio');

const userIds=[];
async function call(path,token,method='GET',data){
 const response=await fetch(host+path,{method,headers:{...(data!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},
   ...(data!==undefined?{body:JSON.stringify(data)}:{})});
 const body=await response.json().catch(()=>({}));
 return {status:response.status,body};
}
async function member(name){
 const email='np-studio-'+randomUUID().slice(0,8)+'@example.test';
 const r=await call('/v1/personal/auth/register','', 'POST',{name,email,password:'Test-Personal-1234!'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 userIds.push(r.body.user.id);
 return r.body.token;
}
const date=new Date().toISOString().slice(0,10),month=date.slice(0,7);
try{
 const alice=await member('Alice Personal'),bob=await member('Bob Personal');
 const a=await call('/v1/personal/manual-accounts',alice,'POST',{name:'Conta do dia a dia',balanceMinor:'100000'});
 assert.equal(a.status,200,JSON.stringify(a.body));
 assert.equal(a.body.verified,false);
 const accountId=a.body.id;
 const forbidden=await call('/v1/personal/manual-accounts/'+accountId+'/balance',bob,'PUT',{balanceMinor:'100000000'});
 assert.equal(forbidden.status,404,'Different user must not update another account.');
 const manual=await call('/v1/personal/transactions/manual',alice,'POST',{
   accountId,description:'Supermercado',amountMinor:'-2500',bookedOn:date,applyToBalance:true
 });
 assert.equal(manual.status,200,JSON.stringify(manual.body));
 const csv={accountId,rows:[{date,description:'Netflix assinatura',amountMinor:'-3990'},
   {date,description:'Netflix assinatura',amountMinor:'-3990'}]};
 const imported=await call('/v1/personal/transactions/import',alice,'POST',csv);
 assert.equal(imported.status,200,JSON.stringify(imported.body));
 assert.equal(imported.body.imported,2,'Identical same-day charges without FITID must both survive.');
 assert.equal(imported.body.duplicates,0);
 assert.match(imported.body.note,/arquivos diferentes com períodos sobrepostos/i);
 const again=await call('/v1/personal/transactions/import',alice,'POST',csv);
 assert.equal(again.body.imported,0);
 assert.equal(again.body.duplicates,2);

 const referenceImport=await call('/v1/personal/transactions/import',alice,'POST',{accountId,rows:[
  {date,description:'Compra OFX repetida',amountMinor:'-500',reference:'bank-operation-a'},
  {date,description:'Compra OFX repetida',amountMinor:'-500',reference:'bank-operation-b'}
 ]});
 assert.equal(referenceImport.status,200,JSON.stringify(referenceImport.body));
 assert.equal(referenceImport.body.imported,2,'Distinct OFX FITIDs must retain otherwise-identical same-day charges.');
 const correctedReference=await call('/v1/personal/transactions/import',alice,'POST',{accountId,rows:[
  {date,description:'Compra OFX corrigida pelo banco',amountMinor:'-550',reference:'bank-operation-a'}
 ]});
 assert.equal(correctedReference.status,200,JSON.stringify(correctedReference.body));
 assert.equal(correctedReference.body.imported,0,'Same FITID with corrected amount/description must not double-count.');
 assert.equal(correctedReference.body.duplicates,1);

 const invalid=await call('/v1/personal/transactions/import',bob,'POST',{accountId,rows:csv.rows});
 assert.equal(invalid.status,404,'Different user cannot import to another account.');
 const oldAccount=await call('/v1/personal/accounts',alice);
 const current=oldAccount.body.accounts.find(x=>x.id===accountId);
 assert.equal(current.available_minor,'97500','Only explicit manual transaction adjusts declared balance, CSV does not.');
 assert.equal(current.manually_reported,true);
 assert.equal(current.fresh,false,'Manual balance cannot claim verified freshness.');
 const seenByBob=await call('/v1/personal/studio',bob);
 assert.equal(seenByBob.status,200);
 assert.equal(seenByBob.body.accounts.length,0);
 assert.equal(seenByBob.body.transactions.length,0);
 assert.equal(seenByBob.body.totals.declaredNetWorthMinor,'0');


 // Preview must be authenticated, never connect a bank, and never write transactions.
 const wallet='0x'+'a'.repeat(40),sender='0x'+'b'.repeat(40);
 const pre=await call('/v1/personal/transactions/enrichment/preview',alice,'POST',{items:[
  {source:'open_finance',accountRef:'test-bank-acct',date,description:'Pagamento supermercado',
   amountMinor:'-2500',currency:'BRL',reference:'belvo-test-1'},
  {source:'onchain',chainId:137,walletAddress:wallet,from:sender,to:wallet,
   txHash:'0x'+'d'.repeat(64),logIndex:0,contractAddress:'0x'+'e'.repeat(40),
   symbol:'USDC',amountAtomic:'1500000',decimals:6,status:'confirmed'}
 ]});
 assert.equal(pre.status,200,JSON.stringify(pre.body));
 assert.equal(pre.body.persisted,false);
 assert.equal(pre.body.providerConnected,false);
 assert.equal(pre.body.externalEffect,false);
 assert.equal(pre.body.items.length,2);
 assert.equal(pre.body.items[0].category,'Alimentação');
 assert.equal(pre.body.items[1].unit,'USDC');
 assert.equal(pre.body.items[1].treatment,'review');
 const anonymous=await call('/v1/personal/transactions/enrichment/preview','', 'POST',{items:[]});
 assert.equal(anonymous.status,401);
 const invalidPreview=await call('/v1/personal/transactions/enrichment/preview',alice,'POST',{
  items:[{source:'open_finance',accountRef:'acct',date,description:'A',amountMinor:'-200',currency:'BRL',privateBankPassword:'no'}]
 });
 assert.equal(invalidPreview.status,400,'Do not accept unknown sensitive provider secrets');
 // A Pix can be a third-party payment or a self transfer. Never auto count it.
 const unknownPix=await call('/v1/personal/transactions/manual',alice,'POST',{
  accountId,description:'Pix enviado para outra conta',amountMinor:'-7400',bookedOn:date,
  applyToBalance:false
 });
 assert.equal(unknownPix.status,200);
 const unknownDenied=await call('/v1/personal/transactions/'+unknownPix.body.id+'/classification',alice,'PATCH',{
  treatment:'excluded_internal'
 });
 assert.equal(unknownDenied.status,400,'Explicit self-transfer confirmation required');
 const otherCannot=await call('/v1/personal/transactions/'+unknownPix.body.id+'/classification',bob,'PATCH',{
  treatment:'excluded_internal',confirmOwnTransfer:true
 });
 assert.equal(otherCannot.status,404,'Other user must not classify another person transaction');
 const confirmedOwn=await call('/v1/personal/transactions/'+unknownPix.body.id+'/classification',alice,'PATCH',{
  treatment:'excluded_internal',confirmOwnTransfer:true
 });
 assert.equal(confirmedOwn.status,200);

 // Mila's recurrence analysis is read-only and must not expose a second user.
 const previousMonthDay=(offset)=>new Date(Date.UTC(
   new Date().getUTCFullYear(),new Date().getUTCMonth()-offset,10
 )).toISOString().slice(0,10);
 for(const [monthsAgo,amountMinor] of [[3,'-10000'],[2,'-10100'],[1,'-11000']]){
   const inserted=await call('/v1/personal/transactions/manual',alice,'POST',{
     accountId,description:'Spotify assinatura',amountMinor,bookedOn:previousMonthDay(monthsAgo),applyToBalance:false
   });
   assert.equal(inserted.status,200,JSON.stringify(inserted.body));
 }
 const recurring=await call('/v1/personal/transactions/recurring-patterns',alice);
 assert.equal(recurring.status,200,JSON.stringify(recurring.body));
 assert.equal(recurring.body.patterns.length,1,JSON.stringify(recurring.body));
 assert.match(recurring.body.patterns[0].displayName,/Spotify/i,'Double-booked Netflix must not be mistaken for a stable subscription');
 assert.equal(recurring.body.patterns[0].confidence,'medium');
 assert.equal(recurring.body.patterns[0].monthlyAmountMinor,'11000');
 assert.equal(recurring.body.marketingUsed,false);
 assert.equal(recurring.body.providerConnected,false);
 assert.equal(recurring.body.persisted,false);
 const bobRecurring=await call('/v1/personal/transactions/recurring-patterns',bob);
 assert.equal(bobRecurring.status,200);
 assert.equal(bobRecurring.body.patterns.length,0,'Pattern data belongs only to the authenticated user.');
 const anonymousRecurring=await call('/v1/personal/transactions/recurring-patterns','');
 assert.equal(anonymousRecurring.status,401);

 const budget=await call('/v1/personal/budgets',alice,'POST',{month,category:'Alimentação',limitMinor:'2000'});
 assert.equal(budget.status,200);
 const goal=await call('/v1/personal/goals',alice,'POST',{name:'Reserva',targetMinor:'200000',savedMinor:'12000'});
 assert.equal(goal.status,200);
 const progress=await call('/v1/personal/goals/'+goal.body.id+'/progress',alice,'PUT',{savedMinor:'200000'});
 assert.equal(progress.status,200);
 const otherGoal=await call('/v1/personal/goals/'+goal.body.id+'/progress',bob,'PUT',{savedMinor:'1'});
 assert.equal(otherGoal.status,404);
 const asset=await call('/v1/personal/wealth',alice,'POST',{name:'Bicicleta',category:'Outros bens',kind:'asset',amountMinor:'30000',currency:'BRL'});
 assert.equal(asset.status,200);
 const debt=await call('/v1/personal/wealth',alice,'POST',{name:'Empréstimo',category:'Crédito',kind:'liability',amountMinor:'15000'});
 assert.equal(debt.status,200);
 const bill=await call('/v1/personal/bills',alice,'POST',{name:'Conta de luz',amountMinor:'6500',nextDueOn:date,intervalMonths:1});
 assert.equal(bill.status,200);
 assert.equal(bill.body.scheduledPayment,false);
 const pastBill=await call('/v1/personal/bills',alice,'POST',{name:'Lembrete antigo para revisão',amountMinor:'9999',nextDueOn:'2020-01-15',intervalMonths:0});
 assert.equal(pastBill.status,200,JSON.stringify(pastBill.body));
 assert.equal(pastBill.body.scheduledPayment,false);


 const studio=await call('/v1/personal/studio',alice);
 assert.equal(studio.status,200,JSON.stringify(studio.body));
 assert.equal(studio.body.totals.manualAvailableMinor,'97500');
 assert.equal(studio.body.totals.declaredNetWorthMinor,'112500');
 assert.equal(studio.body.totals.spentMonthMinor,'11480');
 assert.ok(studio.body.maya.insights.some(x=>x.kind==='budget'),'Real budget excess should be detected.');
 assert.ok(studio.body.maya.insights.some(x=>x.kind==='bills'));
 assert.equal(studio.body.totals.pastDatedBillCount,1);
 assert.equal(studio.body.totals.pastDatedBillsMinor,'9999');
 assert.equal(studio.body.totals.upcomingBillsMinor,'6500','Old reminders must not inflate next 30 days');
 assert.ok(studio.body.maya.insights.some(x=>x.kind==='past_dated_bills'));
 assert.match(studio.body.maya.insights.find(x=>x.kind==='past_dated_bills').detail,/não é confirmação de dívida vencida/);

 assert.equal(studio.body.maya.externalModelCalled,false);
 assert.equal(studio.body.provenance.verifiedBanking,false);

 const maya=await call('/v1/personal/maya/ask',alice,'POST',{question:'Quanto gastei neste mês?'});
 assert.equal(maya.status,200,JSON.stringify(maya.body));
 assert.ok(maya.body.answer.includes('R$ 114,80'),JSON.stringify(maya.body));
 assert.equal(maya.body.modelCalled,false);
 assert.equal(maya.body.canInitiatePayment,false);
 const questionForBob=await call('/v1/personal/maya/ask',bob,'POST',{question:'Qual meu saldo?'});
 assert.equal(questionForBob.status,200);
 assert.ok(!questionForBob.body.answer.includes('975,00'),'Maya must never leak another user balance.');
 const forbiddenCategory=await call('/v1/personal/transactions/'+manual.body.id+'/category',bob,'PATCH',{category:'Outro'});
 assert.equal(forbiddenCategory.status,404);
 const categoryUpdated=await call('/v1/personal/transactions/'+manual.body.id+'/category',alice,'PATCH',{category:'Compras pessoais'});
 assert.equal(categoryUpdated.status,200);

 const overview=await call('/v1/personal/overview',alice);
 assert.equal(overview.body.availableMinor,null,'Declared balance must never be presented as verified balance.');
 assert.equal(overview.body.manualAvailableMinor,'97500');
 const wrongDelete=await call('/v1/personal/wealth/'+asset.body.id,bob,'DELETE');
 assert.equal(wrongDelete.status,404);
 const deleteMine=await call('/v1/personal/wealth/'+asset.body.id,alice,'DELETE');
 assert.equal(deleteMine.status,200,'Owner must delete without a JSON body.');
 const complete=await call('/v1/personal/bills/'+bill.body.id+'/complete',alice,'POST',{});
 assert.equal(complete.status,200);
 assert.equal(complete.body.scheduledPayment,false);
 const noTransfers=await call('/v1/personal/payments/pix',alice,'POST',{amountMinor:'100'});
 assert.equal(noTransfers.status,404,'No real financial movement endpoints allowed.');

 // Reordering an otherwise identical statement must not duplicate real charges.
 // Two identical store charges must remain two records, not one.
 const shuffledStatement={accountId,rows:[
   {date,description:'Padaria rua A',amountMinor:'-101'},
   {date,description:'Padaria rua A',amountMinor:'-101'},
   {date,description:'Farmacia rua B',amountMinor:'-215'}
 ]};
 const originalBatch=await call('/v1/personal/transactions/import',alice,'POST',shuffledStatement);
 assert.equal(originalBatch.status,200,JSON.stringify(originalBatch.body));
 assert.equal(originalBatch.body.imported,3,'Two legitimate matching purchases must both persist.');
 const shifted={...shuffledStatement,rows:[
   shuffledStatement.rows[2],shuffledStatement.rows[0],shuffledStatement.rows[1]
 ]};
 const shuffledAgain=await call('/v1/personal/transactions/import',alice,'POST',shifted);
 assert.equal(shuffledAgain.status,200,JSON.stringify(shuffledAgain.body));
 assert.equal(shuffledAgain.body.imported,0,'Reordering a statement cannot create extra transactions.');
 assert.equal(shuffledAgain.body.duplicates,3);
 const reorderedOriginal=await call('/v1/personal/transactions/import',alice,'POST',shuffledStatement);
 assert.equal(reorderedOriginal.body.imported,0);
 assert.equal(reorderedOriginal.body.duplicates,3);
 assert.match(reorderedOriginal.body.note,/reordenadas/);

 // Compatibility: an unchanged file first imported under the previous v2
 // key must remain idempotent after rolling out the v3 fingerprint strategy.
 const legacyRow={date,description:'Registro historico de teste',amountMinor:'-317'};
 const legacyNormalized=[[date,legacyRow.description.toLowerCase().replace(/\s+/g,' ').trim(),legacyRow.amountMinor,'']];
 const legacyBatchHash=createHash('sha256').update(JSON.stringify(legacyNormalized)).digest('hex');
 const oldFingerprint=createHash('sha256').update(
   ['csv-batch-v2',accountId,legacyBatchHash,0].join('|')
 ).digest('hex');
 await db.query(
  "insert into nex_personal.transactions(owner_user_id,account_id,provider_transaction_ref,description,amount_minor,currency,category,booked_at,source,fingerprint) values($1,$2,$3,$4,$5,'BRL','Outros',$6::date + interval '12 hours','csv',$7)",
  [userIds[0],accountId,'csv-'+oldFingerprint,legacyRow.description,legacyRow.amountMinor,date,oldFingerprint]
 );
 const legacyImport=await call('/v1/personal/transactions/import',alice,'POST',{
  accountId,rows:[legacyRow]
 });
 assert.equal(legacyImport.status,200,JSON.stringify(legacyImport.body));
 assert.equal(legacyImport.body.imported,0,'A legacy order-sensitive import must not be reinserted.');
 assert.equal(legacyImport.body.duplicates,1);


 console.log('Nex Personal P1 smoke: manual balances, import dedupe, planning, deterministic Maya and cross-user isolation OK');
}finally{
 for(const userId of userIds)await db.query('delete from public.users where id=$1',[userId]);
 await db.end();
}
