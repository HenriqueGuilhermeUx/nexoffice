/**
 * Nexa PF — CI-ONLY PostgreSQL rehearsal of the aligned RLS draft.
 * Manual/CI opt-in only. It refuses every remote/Neon/Render URL and any
 * database except the short-lived GitHub integration rehearsal database.
 * Requires baseline five PF DDLs to have run in that disposable database.
 *
 * Exercises a CI-only session hash resolver and RLS isolation under an
 * unprivileged role. Does NOT certify a production login, SQL-injection
 * resistance, auth bootstrap or removal of the unconditional HTTP 503 gate.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {readLifeosPersonalGoals} from '../apps/api/dist/nexa-lifeos-goals-read.js';
import {readLifeosPersonalBills} from '../apps/api/dist/nexa-lifeos-bills-read.js';
import {withLifeosAuthenticatedReadTransaction} from '../apps/api/dist/nexa-lifeos-tenant-tx.js';

if (process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
    process.env.NEXA_LIFEOS_SCHEMA_REHEARSAL!=='true'||
    process.env.GITHUB_REPOSITORY!=='HenriqueGuilhermeUx/nexoffice')
  throw new Error('NEXA PF RLS integration is authorized only in its own ephemeral GitHub CI');
if (process.env.NEXA_LIFEOS_ENV==='production'||
    process.env.NEX_PERSONAL_PREVIEW==='true')
  throw new Error('NEXA PF RLS rehearsal refuses production and preview modes');
let original;
try { original=new URL(process.env.DATABASE_URL||''); }
catch { throw new Error('Missing ephemeral CI Postgres URL'); }
if (!['postgresql:','postgres:'].includes(original.protocol)||
    !['127.0.0.1','localhost'].includes(original.hostname)||
    original.port!=='5432'||original.pathname!=='/nexoffice'||
    original.search||original.hash)
  throw new Error('NEXA PF RLS rehearsal refuses nonlocal PostgreSQL');

const target=new URL(original);
target.pathname='/nexa_lifeos_schema_rehearsal_ci';
const source=target.toString();
const admin=new pg.Client({connectionString:source,connectionTimeoutMillis:5000});
const clients=[];
const A='a1111111-1111-4111-8111-111111111111';
const B='b2222222-2222-4222-8222-222222222222';
const ACTOR_ROLE='nexa_lifeos_app';

async function tenantClient(actor){
 const client=new pg.Client({connectionString:source,connectionTimeoutMillis:5000});
 await client.connect();
 clients.push(client);
 await client.query('BEGIN');
 await client.query('SET LOCAL ROLE '+ACTOR_ROLE);
 if(actor)await client.query("select set_config('app.user_id',$1,true)",[actor]);
 return client;
}
async function countOwnProfiles(client){
 const result=await client.query('select user_id from nex_personal.profiles order by user_id');
 return result.rows.map(r=>r.user_id);
}

await admin.connect();
let seeded=false;
try {
 const empty=await admin.query('select count(*)::int n from public.users');
 assert.equal(empty.rows[0].n,0,'Rehearsal DB must start with zero real users');
 const existing=await admin.query("select count(*)::int n from pg_roles where rolname=$1",[ACTOR_ROLE]);
 assert.equal(existing.rows[0].n,0,'Rehearsal role must be new and disposable');
 await admin.query('CREATE ROLE nexa_lifeos_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');
 const sql=readFileSync('infra/nexa-lifeos-prod/001_owner_rls.sql','utf8');
 const resolverSql=readFileSync('infra/nexa-lifeos-prod/002_ci_only_session_resolver.sql','utf8');
 const identitySql=readFileSync('infra/nexa-lifeos-prod/003_ci_only_identity_rls.sql','utf8');
 assert.ok(sql.includes('nexa_lifeos_schema_rehearsal_ci'));
 assert.ok(resolverSql.includes('nexa_lifeos_schema_rehearsal_ci'));
 assert.ok(identitySql.includes("current_database() <> 'nexa_lifeos_schema_rehearsal_ci'"));
 await admin.query('BEGIN');
 try {await admin.query(sql);await admin.query(resolverSql);await admin.query(identitySql);await admin.query('COMMIT');}
 catch(error){await admin.query('ROLLBACK');throw error;}
 await admin.query('GRANT USAGE ON SCHEMA nex_personal TO nexa_lifeos_app');
 await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nex_personal TO nexa_lifeos_app');

 const tables=await admin.query("select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nex_personal' and c.relkind='r'");
 assert.equal(tables.rows.length,12);
 assert.ok(tables.rows.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
 const policies=await admin.query("select tablename,cmd,roles::text[] AS roles from pg_policies where schemaname='nex_personal'");
 assert.equal(policies.rows.length,13);
 assert.ok(policies.rows.every(p=>Array.isArray(p.roles)&&p.roles.length===1&&p.roles[0]===ACTOR_ROLE));
 assert.deepEqual(policies.rows.filter(p=>p.tablename==='audit_events').map(p=>p.cmd).sort(),['INSERT','SELECT']);
 const identityTables=await admin.query(
  "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('users','auth_sessions') order by c.relname"
 );
 assert.equal(identityTables.rows.length,2);
 assert.ok(identityTables.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity),
   'Identity and sessions must have FORCE RLS, not only table grants');
 const identityPolicies=await admin.query(
  "select tablename,cmd,roles::text[] AS roles,qual,with_check from pg_policies where schemaname='public' and tablename in ('users','auth_sessions') order by tablename"
 );
 assert.equal(identityPolicies.rows.length,2);
 assert.deepEqual(identityPolicies.rows.map(p=>p.tablename),['auth_sessions','users']);
 for(const policy of identityPolicies.rows){
  assert.equal(policy.cmd,'SELECT');
  assert.deepEqual(policy.roles,['nexa_lifeos_ci_session_owner']);
  assert.equal(policy.qual,'true');
  assert.equal(policy.with_check,null);
 }
 const identityAppGrant=await admin.query(
  "select has_table_privilege($1,'public.users','SELECT') user_select,has_table_privilege($1,'public.auth_sessions','SELECT') session_select",
  [ACTOR_ROLE]
 );
 assert.deepEqual(identityAppGrant.rows,[{user_select:false,session_select:false}],
   'PF API role must not directly read identity or hashed sessions');
 const owner=await admin.query("select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname='nexa_lifeos_ci_session_owner'");
 assert.equal(owner.rows.length,1);
 assert.deepEqual(owner.rows[0],{rolsuper:false,rolbypassrls:false,rolcanlogin:false},
   'SECURITY DEFINER owner must not be superuser, bypass RLS, or login');
 const fn=await admin.query("select p.prosecdef,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='nex_personal' and p.proname='resolve_api_session'");
 assert.deepEqual(fn.rows,[{prosecdef:true,rolname:'nexa_lifeos_ci_session_owner'}]);
 const publicExecute=await admin.query("select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) acl where n.nspname='nex_personal' and p.proname='resolve_api_session' and acl.grantee=0 and acl.privilege_type='EXECUTE') as allowed");
 assert.equal(publicExecute.rows[0].allowed,false,'Session resolver must not be executable by PUBLIC');
 const appExecute=await admin.query("select has_function_privilege($1,'nex_personal.resolve_api_session(text)','EXECUTE') AS allowed",[ACTOR_ROLE]);
 assert.equal(appExecute.rows[0].allowed,true);

 await admin.query('INSERT INTO public.users(id,name,email,password_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
   [A,'CI Alice','nexa-pf-alice@example.test','ci-inert',B,'CI Bob','nexa-pf-bob@example.test','ci-inert']);
 seeded=true;
 await admin.query('INSERT INTO nex_personal.profiles(user_id) VALUES($1),($2)',[A,B]);
 await admin.query("INSERT INTO nex_personal.life_intents(owner_user_id,kind) VALUES($1,'trip'),($2,'trip')",[A,B]);
 const hash=label=>createHash('sha256').update('nexa-pf-ci-only-session-'+label).digest('hex');
 await admin.query("INSERT INTO public.auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()-interval '1 minute')",
  [A,hash('alice-valid'),B,hash('bob-expired')]);

 const [alice,bob,anonymous]=await Promise.all([tenantClient(A),tenantClient(B),tenantClient(null)]);
 const [rowsA,rowsB,rowsNull]=await Promise.all([
  countOwnProfiles(alice),countOwnProfiles(bob),countOwnProfiles(anonymous)
 ]);
 assert.deepEqual(rowsA,[A]);
 assert.deepEqual(rowsB,[B]);
 assert.deepEqual(rowsNull,[]);
 assert.equal((await alice.query('select count(*)::int n from nex_personal.life_intents')).rows[0].n,1);
 assert.equal((await bob.query('select count(*)::int n from nex_personal.life_intents')).rows[0].n,1);
 assert.equal((await anonymous.query('select count(*)::int n from nex_personal.life_intents')).rows[0].n,0);
 // The application role cannot fetch secrets or identity rows directly:
 // only the CI-only SECURITY DEFINER resolver may read the token hash.
 await anonymous.query('SAVEPOINT deny_direct_session');
 let sessionTableDenied=false;
 try{await anonymous.query('SELECT token_hash FROM public.auth_sessions LIMIT 1');}
 catch(e){sessionTableDenied=e.code==='42501';await anonymous.query('ROLLBACK TO SAVEPOINT deny_direct_session');}
 assert.equal(sessionTableDenied,true,'No SELECT on public.auth_sessions for app role');
 await anonymous.query('SAVEPOINT deny_direct_user');
 let userTableDenied=false;
 try{await anonymous.query('SELECT id FROM public.users LIMIT 1');}
 catch(e){userTableDenied=e.code==='42501';await anonymous.query('ROLLBACK TO SAVEPOINT deny_direct_user');}
 assert.equal(userTableDenied,true,'PF application role must not read identity rows directly');
 const sessionClient=await tenantClient(null);
 async function resolve(token){
  const r=await sessionClient.query('select user_id from nex_personal.resolve_api_session($1::text)',[token]);
  return r.rows.map(x=>x.user_id);
 }
 assert.deepEqual(await resolve(hash('alice-valid')),[A]);
 assert.deepEqual(await resolve(hash('bob-expired')),[]);
 assert.deepEqual(await resolve(hash('unknown')),[]);
 assert.deepEqual(await resolve('malformed'),[]);
 await admin.query("INSERT INTO public.auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[B,hash('bob-revoked')]);
 assert.deepEqual(await resolve(hash('bob-revoked')),[B]);
 await admin.query('DELETE FROM public.auth_sessions WHERE token_hash=$1',[hash('bob-revoked')]);
 assert.deepEqual(await resolve(hash('bob-revoked')),[],'Revoked session cannot be used');
 await admin.query("UPDATE public.users SET status='disabled' WHERE id=$1",[B]);
 await admin.query("INSERT INTO public.auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[B,hash('bob-disabled')]);
 assert.deepEqual(await resolve(hash('bob-disabled')),[],'Disabled account must not resolve');
 await admin.query("UPDATE public.users SET status='active' WHERE id=$1",[B]);
 // Tie identity to the same connection/transaction before protected SQL.
 const verified=await resolve(hash('alice-valid'));
 assert.equal(verified.length,1);
 await sessionClient.query("select set_config('app.user_id',$1,true)",[verified[0]]);
 assert.deepEqual(await countOwnProfiles(sessionClient),[A]);
 assert.equal((await alice.query('update nex_personal.life_intents set status=$1 where owner_user_id=$2',['done',B])).rowCount,0);


 // Run the ACTUAL compiled application read path under PostgreSQL FORCE RLS,
 // not only a mocked pool. Production guard remains closed despite this CI proof.
 const tokenA='A'.repeat(43),tokenB='B'.repeat(43);
 await admin.query(
  "INSERT INTO public.auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
  [A,createHash('sha256').update(tokenA).digest('hex'),B,createHash('sha256').update(tokenB).digest('hex')]
 );
 await admin.query("INSERT INTO nex_personal.goals(owner_user_id,name,target_minor,saved_minor) VALUES($1,'Reserva Alice',250000,30000),($2,'Viagem Bob',100000,20000)",[A,B]);
 await admin.query("INSERT INTO nex_personal.bills(owner_user_id,name,amount_minor,next_due_on) VALUES($1,'Luz Alice',9900,'2026-11-01'),($2,'Internet Bob',11000,'2026-11-02')",[A,B]);
 const realAppPool=new pg.Pool({connectionString:source,max:1,connectionTimeoutMillis:5000});
 // The CI admin login may SET ROLE; production must instead have its own
 // non-privileged login role and separate database credentials.
 const roleRestricted={async connect(){
  const client=await realAppPool.connect();
  try{await client.query('SET ROLE nexa_lifeos_app');return client;}
  catch(e){client.release();throw e;}
 }};
 const previousLifeosEnv=process.env.NEXA_LIFEOS_ENV;
 try{
  process.env.NEXA_LIFEOS_ENV='production';
  const resultsA=await readLifeosPersonalGoals(tokenA,roleRestricted);
  const resultsB=await readLifeosPersonalGoals(tokenB,roleRestricted);
  const billsA=await readLifeosPersonalBills(tokenA,roleRestricted);
  const billsB=await readLifeosPersonalBills(tokenB,roleRestricted);
  assert.deepEqual(billsA.bills.map(x=>x.name),['Luz Alice']);
  assert.deepEqual(billsB.bills.map(x=>x.name),['Internet Bob']);
  assert.equal(billsA.paymentsEnabled,false);
  // PostgreSQL itself must reject modifications even when the verified
  // principal OWNS the row. This tests READ ONLY beyond route-level promises.
  await assert.rejects(
   withLifeosAuthenticatedReadTransaction(tokenA,async({client,userId})=>{
    await client.query(
     "insert into nex_personal.goals(owner_user_id,name,target_minor) values($1,'Forbidden accidental write',100)",
     [userId]
    );
   },roleRestricted),
   error=>error.code==='25006'
  );
  assert.deepEqual(resultsA.goals.map(x=>x.name),['Reserva Alice']);
  assert.deepEqual(resultsB.goals.map(x=>x.name),['Viagem Bob']);
  assert.equal(resultsA.readOnly,true);
  assert.equal(resultsA.externalFinancialActions,false);
  await assert.rejects(
   readLifeosPersonalGoals('C'.repeat(43),roleRestricted),
   e=>e.statusCode===401 && e.code==='invalid_session'
  );
  // A fresh checkout of the reused connection has no tenant actor GUC.
  const unauthenticated=await roleRestricted.connect();
  try{
   await unauthenticated.query('BEGIN');
   assert.equal((await unauthenticated.query('select count(*)::int n from nex_personal.goals')).rows[0].n,0);
   await unauthenticated.query('ROLLBACK');
  }finally{unauthenticated.release();}
 }finally{
  if(previousLifeosEnv===undefined)delete process.env.NEXA_LIFEOS_ENV;
  else process.env.NEXA_LIFEOS_ENV=previousLifeosEnv;
  await realAppPool.end();
 }

 await alice.query('SAVEPOINT deny_insert');
 let blockedForeignInsert=false;
 try{await alice.query("insert into nex_personal.life_intents(owner_user_id,kind) values($1,'trip')",[B]);}
 catch(error){blockedForeignInsert=error.code==='42501';await alice.query('ROLLBACK TO SAVEPOINT deny_insert');}
 assert.equal(blockedForeignInsert,true);
 await alice.query('SAVEPOINT deny_audit_spoof');
 let blockedAuditSpoof=false;
 try{
  await alice.query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$2,'ci.spoof','profile')",[A,B]);
 }catch(error){blockedAuditSpoof=error.code==='42501';await alice.query('ROLLBACK TO SAVEPOINT deny_audit_spoof');}
 assert.equal(blockedAuditSpoof,true);
 await alice.query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$1,'ci.test','profile')",[A]);
 assert.equal((await alice.query('delete from nex_personal.audit_events where owner_user_id=$1',[A])).rowCount,0);
 assert.equal((await alice.query('select count(*)::int n from nex_personal.audit_events')).rows[0].n,1);
 assert.equal((await bob.query('select count(*)::int n from nex_personal.audit_events')).rows[0].n,0);

 for(const client of clients)await client.query('ROLLBACK');
 // Once the transaction ends, custom actor settings and SET LOCAL ROLE must not leak.
 await alice.query('BEGIN');
 await alice.query('SET LOCAL ROLE nexa_lifeos_app');
 assert.deepEqual(await countOwnProfiles(alice),[]);
 await alice.query('ROLLBACK');
 console.log(JSON.stringify({
  outcome:'CI_ONLY_RLS_TWO_USER_CHECK_PASS',
  forcedTables:tables.rows.length,policies:policies.rows.length,
  activeRole:ACTOR_ROLE,simultaneousClients:4,crossReadDenied:true,
  crossWriteDenied:true,auditAppendOnly:true,transactionContextResets:true,
  ciOnlySessionResolver:true,expiredSessionDenied:true,revokedSessionDenied:true,disabledAccountDenied:true,
  directSessionTableDenied:true,directIdentityTableDenied:true,forcedIdentityRls:true,nonSuperuserFunctionOwner:true,
  productionReady:false,
  pending:['production identity/session RLS (CI proof only), separate nonprivileged production DB role and reviewed resolver','trusted API auth binding','web E2E','LGPD','production backup and rollback']
 }));
}finally{
 for(const client of clients)try{await client.query('ROLLBACK');await client.end()}catch{}
 if(seeded)try{await admin.query('DELETE FROM public.users WHERE id=$1 OR id=$2',[A,B])}catch{}
 try{await admin.end()}catch{}
}
