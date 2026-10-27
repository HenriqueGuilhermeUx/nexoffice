/**
 * Rehearse Nexa PF's five proposed SQL migrations only in an ephemeral local
 * GitHub Actions Postgres database. NEVER uses a Neon database or prod secret.
 * Does not apply production migrations or certify PF RLS/privacy readiness.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {migrations,migrationInventory} from './plan-nexa-lifeos-prod-migrations.mjs';

if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'
   ||process.env.NEXA_LIFEOS_SCHEMA_REHEARSAL!=='true')
  throw new Error('DDL rehearsal allowed only with explicit GitHub CI opt-in');

let adminUrl;
try{adminUrl=new URL(process.env.DATABASE_URL||'');}
catch{throw new Error('Missing disposable GitHub PostgreSQL URL');}
if(!['127.0.0.1','localhost'].includes(adminUrl.hostname)
   ||adminUrl.port!=='5432'||adminUrl.pathname!=='/nexoffice'
   ||!['postgresql:','postgres:'].includes(adminUrl.protocol))
 throw new Error('DDL rehearsal REFUSES nonlocal or non-CI database');
if(process.env.NEXA_LIFEOS_ENV==='production'||process.env.NEX_PERSONAL_PREVIEW==='true')
 throw new Error('DDL rehearsal refuses production and preview runtimes');

const disposableName='nexa_lifeos_schema_rehearsal_ci';
const manifest=migrationInventory();
assert.equal(manifest.length,5);
const admin=new pg.Client({connectionString:adminUrl.toString(),connectionTimeoutMillis:5000});
await admin.connect();
try{
 await admin.query('CREATE DATABASE '+disposableName);
}finally{await admin.end();}

const temporaryUrl=new URL(adminUrl);
temporaryUrl.pathname='/'+disposableName;
const client=new pg.Client({connectionString:temporaryUrl.toString(),connectionTimeoutMillis:5000});
await client.connect();
try{
 for(const file of migrations){
  const sql=readFileSync(file,'utf8');
  await client.query('BEGIN');
  try{await client.query(sql);await client.query('COMMIT');}
  catch(e){await client.query('ROLLBACK');throw Error('PF CI DDL rehearsal rejected: '+file,{cause:e});}
 }
 const tables=await client.query("select table_schema,table_name from information_schema.tables where table_type='BASE TABLE' and table_schema in ('public','nex_personal') order by table_schema,table_name");
 const names=new Set(tables.rows.map(r=>r.table_schema+'.'+r.table_name));
 for(const name of ['public.users','public.auth_sessions','nex_personal.profiles','nex_personal.accounts','nex_personal.transactions']){
   assert.ok(names.has(name),'Missing expected PF table '+name);
 }
 const publicTables=tables.rows.filter(r=>r.table_schema==='public').map(r=>r.table_name);
 assert.deepEqual(publicTables.sort(),['auth_sessions','users'],'PF rehearsal must not create PJ or Wallet business tables');
 const users=await client.query('select count(*)::integer as count from public.users');
 assert.equal(users.rows[0].count,0,'No test users may leak into this isolated schema');
 const session=await client.query('select count(*)::integer as count from public.auth_sessions');
 assert.equal(session.rows[0].count,0);
 const rls=await client.query("select count(*)::integer as enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nex_personal' and c.relkind='r' and c.relrowsecurity=true");
 console.log(JSON.stringify({
  result:'NEXA_LIFEOS_EPHEMERAL_DDL_REHEARSAL_PASS',
  ciOnly:true,disposableDatabase:disposableName,
  appliedMigrations:manifest.length,pfTables:tables.rows.filter(r=>r.table_schema==='nex_personal').length,
  publicTables,zeroUsers:true,zeroSessions:true,
  rlsEnabledTables:rls.rows[0].enabled,
  readiness:'DDL rehearsal only; RLS/ownership, backup, legal approval and prod DB still required'
 }));
}finally{await client.end();}

// Reuse the disposable database created above. This makes the RLS/session
// rehearsal a real, mandatory CI check instead of dormant source code, while
// keeping the existing Actions workflow (and all production DBs) untouched.
// This import is rejected outside the same explicit local GitHub CI context.
await import('./rehearse-nexa-lifeos-actor-rls-ci.mjs');
