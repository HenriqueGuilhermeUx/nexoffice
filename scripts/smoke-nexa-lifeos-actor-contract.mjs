/**
 * Nexa PF actor-context drift detector. CI/offline only: never opens DB,
 * signs tokens, creates users or authorizes a production rollout.
 *
 * This catches incompatible combinations of the #100 RLS draft and the
 * #102 runtime/audit draft BEFORE anyone applies migrations.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';

const MARKER='app.user_id';
const ROLE='nexa_lifeos_app';
const rlsFile='infra/nexa-lifeos-prod/001_owner_rls.sql';
const read=path=>readFileSync(path,'utf8');

export function inspectRlsDraftCompatibility(sql){
  const findings=[];
  if (!sql.includes(MARKER)) findings.push('RLS actor setting must reference app.user_id');
  if (/\bnexa\.actor_id\b/i.test(sql)) findings.push('Legacy nexa.actor_id is incompatible with the runtime actor setting');
  // This is a conservative text preflight, not SQL parsing or a substitute
  // for actual PostgreSQL policy introspection and multi-user integration.
  const policyStatements=sql.match(/\bcreate\s+policy\b[\s\S]*?(?:;|'\s*,)/gi)||[];
  if (!policyStatements.length) findings.push('No CREATE POLICY statements found');
  for (const p of policyStatements){
    if(!new RegExp('\\bTO\\s+'+ROLE+'\\b','i').test(p))
      findings.push('A policy does not explicitly target the PF application role');
  }
  return findings;
}

test('the session-bound transaction and catalog audit agree on the actor name',()=>{
  const tx=read('apps/api/src/nexa-lifeos-tenant-tx.ts');
  const audit=read('scripts/audit-nexa-lifeos-prod-schema.mjs');
  assert.ok(tx.includes("set_config('app.user_id',$1,true)"),'Transaction must SET LOCAL app.user_id');
  assert.ok(audit.includes("expression.includes('app.user_id')"),'Auditor must expect same setting');
  assert.ok(audit.includes("policy.roles.length!==1||policy.roles[0]!==roleName"),
    'Auditor must reject PUBLIC policies and policies assigned to other roles');
  assert.ok(audit.includes("rolbypassrls"),'Role BYPASSRLS must be audited');
});

test('production remains unconditionally closed until identity + real RLS E2E is proven',()=>{
  const guard=read('apps/api/src/nexa-lifeos-prod-schema-ready.ts');
  const server=read('apps/api/src/server-personal-production.ts');
  assert.ok(guard.includes("throw new Error('tenant_context_binding_not_implemented')"),
    'Do not remove the NO-GO gate from a catalog-only audit');
  // #101's additional user-context gate exists on a separate, unmerged
  // DRAFT branch. The #102 branch instead remains closed by the unconditional
  // schema guard. Never require a file that this branch does not contain.
  assert.ok(server.includes('await requireLifeosProductionSchema()'),
    'The production server must block authenticated access on the unconditional guard');
  assert.ok(server.includes('requireLifeosProductionSchema()'),
    'Server must require the data-boundary guard');
});

test('incompatible RLS proposals fail the drift preflight',()=>{
  const old=String.raw`CREATE POLICY pf_actor_owner ON nex_personal.accounts
    FOR ALL USING (owner_user_id=nex_personal.current_actor_id())
    WITH CHECK (owner_user_id=nex_personal.current_actor_id());
    SELECT current_setting('nexa.actor_id',true);`;
  const findings=inspectRlsDraftCompatibility(old);
  assert.ok(findings.some(f=>f.includes('app.user_id')));
  assert.ok(findings.some(f=>f.includes('nexa.actor_id')));
  assert.ok(findings.some(f=>f.includes('role')));
  const aligned=String.raw`CREATE POLICY pf_actor_owner ON nex_personal.accounts FOR ALL
    TO nexa_lifeos_app USING (owner_user_id::text=current_setting('app.user_id',true))
    WITH CHECK (owner_user_id::text=current_setting('app.user_id',true));`;
  assert.deepEqual(inspectRlsDraftCompatibility(aligned),[]);
});

test('disposable-only RLS candidate matches all 12 owner tables and 13 policies',()=>{
  assert.ok(existsSync(rlsFile),'Reconciled RLS proposal must exist on this branch');
  const sql=read(rlsFile);
  assert.deepEqual(inspectRlsDraftCompatibility(sql),[],
    'Proposed SQL cannot use the legacy setting or PUBLIC policy roles');
  const expected=['accounts','audit_events','bills','budgets','connections','consents',
    'goals','life_intents','life_preferences','profiles','transactions','wealth_items'];
  assert.match(sql,/current_database\(\)\s*<>\s*'nexa_lifeos_schema_rehearsal_ci'/i,
    'RLS proposal must refuse non-disposable databases');
  for(const table of expected){
    assert.ok(sql.includes('ALTER TABLE nex_personal.'+table+' FORCE ROW LEVEL SECURITY;'),
      'Expected FORCE RLS for '+table);
  }
  const policies=sql.match(/\bCREATE\s+POLICY\b[\s\S]*?;/gi)||[];
  assert.equal(policies.length,13,'Twelve PF tables require thirteen owner/audit policies');
  for(const p of policies){
    assert.match(p,/\bTO\s+nexa_lifeos_app\b/i);
    assert.match(p,/current_setting\('app\.user_id',true\)/);
    if(/\bFOR ALL\b/i.test(p)) {
      assert.match(p,/\bUSING\s*\(/i);
      assert.match(p,/\bWITH CHECK\s*\(/i);
    }
  }
  const audit=policies.filter(p=>/ON nex_personal\.audit_events/i.test(p));
  assert.equal(audit.length,2);
  assert.ok(audit.some(p=>/FOR SELECT/i.test(p)));
  assert.ok(audit.some(p=>/FOR INSERT/i.test(p) && /actor_user_id/i.test(p)));
  assert.ok(audit.every(p=>!/FOR (?:ALL|UPDATE|DELETE)/i.test(p)),
    'Audit events must not have update/delete RLS policies');
  process.stdout.write('NEXA_PF_NO_GO: CI-only SQL contract matches; auth, RLS E2E and production review remain pending\n');
});
