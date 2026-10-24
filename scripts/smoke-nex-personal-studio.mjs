import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

if(!process.env.DATABASE_URL)throw new Error('Disposable Postgres database required.');
const host='http://127.0.0.1:'+String(process.env.PORT||4000);
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
await db.connect();
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

 const studio=await call('/v1/personal/studio',alice);
 assert.equal(studio.status,200,JSON.stringify(studio.body));
 assert.equal(studio.body.totals.manualAvailableMinor,'97500');
 assert.equal(studio.body.totals.declaredNetWorthMinor,'112500');
 assert.equal(studio.body.totals.spentMonthMinor,'11480');
 assert.ok(studio.body.maya.insights.some(x=>x.kind==='budget'),'Real budget excess should be detected.');
 assert.ok(studio.body.maya.insights.some(x=>x.kind==='bills'));
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
 console.log('Nex Personal P1 smoke: manual balances, import dedupe, planning, deterministic Maya and cross-user isolation OK');
}finally{
 for(const userId of userIds)await db.query('delete from public.users where id=$1',[userId]);
 await db.end();
}
