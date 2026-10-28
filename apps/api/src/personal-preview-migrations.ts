import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {personalPgConnection} from './personal-preview-db-config.js';

const migrationPaths=[
 'infra/personal-preview/001_identity.sql',
 'infra/postgres/046_nex_personal_foundation.sql',
 'infra/postgres/047_nex_personal_planning.sql',
 'infra/postgres/048_nex_personal_life_os.sql',
 'infra/postgres/049_nex_personal_transaction_enrichment.sql',
 'infra/postgres/20261027_nexa_agentics_entitlements.sql',
 'infra/postgres/20261027_nexa_agentics_missions.sql'
];
/** Refuse to bootstrap preview tables inside business or unknown existing databases. */
export async function runPersonalPreviewMigrations(){
 const url=String(process.env.DATABASE_URL||'');
 if(!url)throw new Error('A dedicated personal preview DATABASE_URL is required');
 // A stalled Neon TCP connection must not hang a Render rollout indefinitely.
 // Fail this isolated instance cleanly; Render retains the last live version.
 const client=new pg.Client({
  ...personalPgConnection(url,process.env),
  connectionTimeoutMillis:30_000,
  query_timeout:30_000
 });
 await client.connect();
 try{
  const visible=await client.query<{table_name:string}>(
   "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not in ('users','auth_sessions','nex_personal_preview_migrations') order by table_name limit 5");
  if(visible.rowCount)throw new Error('REFUSING preview migration: existing non-personal public tables: '+visible.rows.map(x=>x.table_name).join(','));
  const otherSchemas=await client.query<{schema_name:string}>(
    "select schema_name from information_schema.schemata where schema_name not in ('public','information_schema','pg_catalog','pg_toast','nex_personal') and schema_name not like 'pg_toast_temp_%' and schema_name not like 'pg_temp_%' order by schema_name limit 5");
  if(otherSchemas.rowCount)throw new Error('REFUSING preview migration: unexpected schemas present.');
  await client.query('create table if not exists public.nex_personal_preview_migrations (name text primary key, applied_at timestamptz not null default now())');
  for(const name of migrationPaths){
   const exists=await client.query('select 1 from public.nex_personal_preview_migrations where name=$1',[name]);
   if(exists.rowCount)continue;
   const sql=await fs.readFile(path.resolve(name),'utf8');
   await client.query('begin');
   try{
    await client.query(sql);
    await client.query('insert into public.nex_personal_preview_migrations(name) values($1)',[name]);
    await client.query('commit');
   }catch(error){
    await client.query('rollback');
    throw error;
   }
  }
 }finally{
  await client.end();
 }
}
