/**
 * Nexa PF — CI-ONLY PostgreSQL rehearsal of the aligned RLS draft.
 * Manual/CI opt-in only. It refuses every remote/Neon/Render URL and any
 * database except the short-lived GitHub integration rehearsal database.
 * Requires baseline five PF DDLs to have run in that disposable database.
 *
 * Does NOT validate authentication/resolve_api_session, SQL-injection
 * resistance or allow the API's unconditional HTTP 503 gate to be lifted.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

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
 assert.ok(sql.includes('nexa_lifeos_schema_rehearsal_ci'));
 await admin.query('BEGIN');
 try {await admin.query(sql);await admin.query('COMMIT');}
 catch(error){await admin.query('ROLLBACK');throw error;}
 await admin.query('GRANT USAGE ON SCHEMA nex_personal TO nexa_lifeos_app');
 await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nex_personal TO nexa_lifeos_app');

 const tables=await admin.query("select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nex_personal' and c.relkind='r'");
 assert.equal(tables.rows.length,12);
 assert.ok(tables.rows.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
 const policies=await admin.query("select tablename,cmd,roles from pg_policies where schemaname='nex_personal'");
 assert.equal(policies.rows.length,13);
 assert.ok(policies.rows.every(p=>Array.isArray(p.roles)&&p.roles.length===1&&p.roles[0]===ACTOR_ROLE));
 assert.deepEqual(policies.rows.filter(p=>p.tablename==='audit_events').map(p=>p.cmd).sort(),['INSERT','SELECT']);

 await admin.query('INSERT INTO public.users(id,name,email,password_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
   [A,'CI Alice','nexa-pf-alice@example.test','ci-inert',B,'CI Bob','nexa-pf-bob@example.test','ci-inert']);
 seeded=true;
 await admin.query('INSERT INTO nex_personal.profiles(user_id) VALUES($1),($2)',[A,B]);
 await admin.query("INSERT INTO nex_personal.life_intents(owner_user_id,kind) VALUES($1,'trip'),($2,'trip')",[A,B]);

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
 assert.equal((await alice.query('update nex_personal.life_intents set status=$1 where owner_user_id=$2',['done',B])).rowCount,0);

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
  activeRole:ACTOR_ROLE,simultaneousClients:3,crossReadDenied:true,
  crossWriteDenied:true,auditAppendOnly:true,transactionContextResets:true,
  productionReady:false,
  pending:['resolve_api_session','public users/auth_sessions policies','trusted auth binding','web E2E','LGPD','production backup and rollback']
 }));
}finally{
 for(const client of clients)try{await client.query('ROLLBACK');await client.end()}catch{}
 if(seeded)try{await admin.query('DELETE FROM public.users WHERE id=$1 OR id=$2',[A,B])}catch{}
 try{await admin.end()}catch{}
}
