#!/usr/bin/env node
// Non-destructive Nexa PJ ERP-only production preflight.
// Never registers users, mutates workspaces, or issues financial operations.
import assert from 'node:assert/strict';

const base = (process.env.NEXA_PJ_API_URL || 'https://nexa-pj-erp-api.onrender.com').replace(/\/$/, '');
async function check(path, options, expected) {
  const response = await fetch(base + path, {signal: AbortSignal.timeout(25000), ...options});
  assert.equal(response.status, expected, `${path} expected HTTP ${expected}, got ${response.status}`);
  return response;
}
const health = await check('/health', {}, 200);
const json = await health.json();
assert.equal(json.status, 'ok', 'API health status not OK');
assert.equal(json.database, true, 'DATABASE_URL not configured');
assert.equal(json.autoMigrate, false, 'AUTO_MIGRATE must be disabled after migration');
await check('/v1/auth/me', {}, 401);
await check('/v1/workspaces', {}, 401);
const invalidEmail = `pj-preflight-${crypto.randomUUID()}@example.invalid`;
await check('/v1/auth/login', {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({email: invalidEmail, password: 'invalid-credential-for-negative-test'}),
}, 401);
console.log('Nexa PJ API preflight PASS: health, database env, migration gate, anonymous isolation, invalid login.');
console.log('NOT COVERED: real registration, valid login, persisted workspace, frontend UI, agent functions.');
