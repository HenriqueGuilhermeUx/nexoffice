import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const routes=readFileSync(new URL('../apps/api/src/routes-nexa-agentics.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../infra/postgres/20261027_nexa_agentics_missions.sql',import.meta.url),'utf8');
const entitlement=readFileSync(new URL('../infra/postgres/20261027_nexa_agentics_entitlements.sql',import.meta.url),'utf8');
const server=readFileSync(new URL('../apps/api/src/server.ts',import.meta.url),'utf8');

test('Agentics mission routes require authenticated PF profile',()=>{
  assert.match(routes,/await authenticate\(req\)/);
  assert.match(routes,/nex_personal\.profiles where user_id=\$1/);
});
test('Mission reads, cancellation and writes are owner scoped',()=>{
  assert.match(routes,/agentic_missions where owner_user_id=\$1/);
  assert.match(routes,/agentic_missions set status='cancelled'.*owner_user_id=\$1/);
  assert.match(routes,/agentic_missions\(owner_user_id,title,description\)/);
});
test('Mission creation is gated by server-side Premium and kill switch',()=>{
  assert.match(routes,/NEXA_PF_AGENTICS_DRAFTS_ENABLED/);
  assert.match(routes,/agentic_entitlements/);
  assert.match(routes,/valid_until>now\(\)/);
  assert.match(routes,/status='active'/);
});
test('Mission schema is nonexecuting and owner constrained',()=>{
  assert.match(migration,/owner_user_id uuid not null references users\(id\)/);
  assert.match(migration,/check \(status in \('draft','cancelled'\)\)/);
  assert.doesNotMatch(migration,/wallet_address|transfer_hash|payment_id/);
});
test('Premium entitlements cannot be granted through these routes',()=>{
  assert.match(entitlement,/verified_provider/);
  assert.match(entitlement,/verified_reference/);
  assert.doesNotMatch(routes,/insert into nex_personal\.agentic_entitlements/);
});
test('Server registers Agentics route module',()=>{
  assert.match(server,/registerNexaAgenticsRoutes\(app\)/);
});
