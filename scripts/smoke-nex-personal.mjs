import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const url=process.env.DATABASE_URL;
if(!url)throw new Error('Nex Personal smoke requires a disposable CI database.');
const host='http://127.0.0.1:'+String(process.env.PORT||4000);
const client=new pg.Client({connectionString:url,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
await client.connect();
const users=[];
async function api(path,method='GET',body,token){
  const response=await fetch(host+path,{
    method,
    headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const result=await response.json();
  return {status:response.status,data:result};
}
async function createUser(name){
  const key=randomUUID().slice(0,8),email='nex-personal-'+name+'-'+key+'@example.test';
  const result=await api('/v1/personal/auth/register','POST',{name,email,password:'PersonalTest123!'});
  assert.equal(result.status,200,JSON.stringify(result.data));
  users.push(result.data.user.id);
  return {id:result.data.user.id,token:result.data.token};
}

try{
  const [alice,bob]=[await createUser('Alice'),await createUser('Bob')];
  const anon=await api('/v1/personal/accounts');
  assert.equal(anon.status,401,'Personal financial data must require authentication.');

  const aliceMe=await api('/v1/personal/me','GET',null,alice.token);
  assert.equal(aliceMe.data.activated,true);
  const bobEmpty=await api('/v1/personal/overview','GET',null,bob.token);
  assert.equal(bobEmpty.data.availableMinor,null,'No synthetic zero or fictitious consolidated balance.');
  assert.equal(bobEmpty.data.incomplete,true);

  const inserted=await client.query("insert into nex_personal.accounts(owner_user_id,provider,provider_account_ref,institution_name,name,currency,current_minor,available_minor,balance_as_of) values($1,'ci_fixture',$2,'Teste Banco','Conta A','BRL',98501,98501,now()) returning id",[alice.id,randomUUID()]);
  await client.query("insert into nex_personal.transactions(owner_user_id,account_id,provider_transaction_ref,description,amount_minor,currency,booked_at) values($1,$2,$3,'Teste compra',-1299,'BRL',now())",[alice.id,inserted.rows[0].id,randomUUID()]);
  const aliceAccounts=await api('/v1/personal/accounts','GET',null,alice.token);
  const bobAccounts=await api('/v1/personal/accounts','GET',null,bob.token);
  assert.equal(aliceAccounts.data.accounts.length,1);
  assert.equal(bobAccounts.data.accounts.length,0,'B must not see A financial data.');
  const aliceSummary=await api('/v1/personal/overview','GET',null,alice.token);
  assert.equal(aliceSummary.data.availableMinor,'98501');
  assert.equal(aliceSummary.data.custodial,false);
  const aliceTx=await api('/v1/personal/transactions','GET',null,alice.token);
  const bobTx=await api('/v1/personal/transactions','GET',null,bob.token);
  assert.equal(aliceTx.data.transactions.length,1);
  assert.equal(bobTx.data.transactions.length,0,'B must not see A transactions.');
  const noPayment=await api('/v1/personal/payments/pix','POST',{amountMinor:'100'},alice.token);
  assert.equal(noPayment.status,404,'No real Pix route should be present in this phase.');
  const noConsent=await api('/v1/personal/consents','GET',null,alice.token);
  assert.deepEqual(noConsent.data.consents,[]);
  console.log('Nex Personal registration, privacy, tenant isolation and read-only checks: OK');
}finally{
  for(const id of users)await client.query('delete from users where id=$1',[id]);
  await client.end();
}
