/**
 * Read-only review of EXISTING PF migrations proposed for a NEW, EMPTY DB.
 * This script never connects to Postgres and NEVER executes any SQL.
 * Hash pins force review if preview SQL changes before production onboarding.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const migrations=[
 ['infra/personal-preview/001_identity.sql','ffac363855a58bf08a28fe7c79e2248c5a3ff9120c1fe3b8e6a4e71201dd0c2c'],
 ['infra/postgres/046_nex_personal_foundation.sql','40ff71810dd94443af12551efa1ccb7b5d641d287bbc478d9202a8280c40c6fa'],
 ['infra/postgres/047_nex_personal_planning.sql','590c2c937cd9f51496c9e900f9cbe03503c1968ad2b20699ee6e50c25d6fbfa2'],
 ['infra/postgres/048_nex_personal_life_os.sql','c7e0059f6c2b532bfc9bc1e3510b3da1aa23cf6ae37d12cba02284f5c2493752'],
 ['infra/postgres/049_nex_personal_transaction_enrichment.sql','826513b7e48e3fba1c9666d0e641ecf6b650db3406758ea723e0e4f3bff06989']
];
for(const [name,pinnedSha] of migrations){
 const raw=readFileSync(name);
 const hash=createHash('sha256').update(raw).digest('hex');
 assert.equal(hash,pinnedSha,'PF migration changed: require security/DB review before production');
 const sql=raw.toString('utf8').replace(/--[^\n]*/g,'').trim();
 assert.ok(sql.length>30,'Expected additive PF migration');
 assert.doesNotMatch(sql,/\b(?:drop\s+(?:table|schema|database)|truncate\s+|delete\s+from\s+|update\s+|alter\s+role\s+|create\s+role\s+|grant\s+|revoke\s+)\b/i,
  'Destructive or permission-changing migration requires separate DBA review');
 assert.doesNotMatch(sql,/\b(?:public\.(?!users\b|auth_sessions\b)|(?:crm|nexoffice|wallet|merchant|payment|ledger)\.)[a-z_]+/i,
  'Migration must not access NexOffices PJ, Nexa Wallet or an unknown public table');
 for(const match of sql.matchAll(/\b(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_.]*)/gi)){
   const table=match[1].toLowerCase();
   assert.ok(table==='public.users'||table==='public.auth_sessions'||
     table.startsWith('nex_personal.'),
     'Only isolated PF identity and nex_personal tables may be created or modified: '+table);
 }

}
assert.match(readFileSync(migrations[0][0],'utf8'),/create table if not exists public\.users/);
assert.match(readFileSync(migrations[0][0],'utf8'),/create table if not exists public\.auth_sessions/);
assert.match(readFileSync(migrations[1][0],'utf8'),/create schema if not exists nex_personal/);
console.log('NEXA_LIFEOS_PF_MIGRATIONS_PINNED_READ_ONLY_PASS — 5 reviewed files, ZERO SQL executed');
