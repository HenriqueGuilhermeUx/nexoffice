/** Fail closed before building the dedicated NexOffices USA Netlify demo. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const expected = {
  SITE_ID: 'a0b4370c-0f17-4aca-a07d-0d16f9640c61',
  SITE_NAME: 'av-usa-nexoffices',
  BRANCH: 'feature/usa-localized-preview-20261024',
  CONTEXT: 'production',
  NETLIFY: 'true',
};
for (const [key, value] of Object.entries(expected)) {
  assert.equal(process.env[key], value, 'Refusing USA build: incorrect ' + key);
}
const commit = process.env.COMMIT_REF || '';
assert.match(commit, /^[a-f0-9]{40}$/i, 'Refusing USA build: missing exact COMMIT_REF');
const checkedOut = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(checkedOut.toLowerCase(), commit.toLowerCase(),
  'Refusing USA build: checked-out source differs from COMMIT_REF');

const forbidden = Object.keys(process.env).filter(key =>
  /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_|SUPABASE_|STRIPE_|MERCADOPAGO_|FOXBIT_|WOOVI_|PRIVY_|ALCHEMY_|NEXOFFICE_|NEXA_|EF[I_]|OPENAI_)/.test(key) ||
  /^(?:DATABASE_URL|DIRECT_URL|API_URL|BACKEND_URL|JWT_SECRET|NETLIFY_AUTH_TOKEN|GOOGLE_CLIENT_SECRET)$/.test(key)
);
assert.deepEqual(forbidden, [], 'Refusing USA build: inherited application/provider keys: ' + forbidden.join(', '));

const config = readFileSync('deploy/netlify/nexoffices/netlify.toml', 'utf8');
for (const required of [
  /publish\s*=\s*"apps\/web\/dist-usa"/,
  /scripts\/usa-netlify-site-guard\.mjs/,
  /vite\.usa\.config\.ts/,
  /scripts\/usa-netlify-isolation-check\.mjs/,
]) {
  assert.match(config, required, 'Missing isolated USA build contract');
}
assert.doesNotMatch(config, /onrender\.com|supabase\.co|\/\*\s+\/index\.html/i,
  'Refusing USA build: Brazilian provider or wildcard SPA rewrite');
console.log('PASS: NexOffices USA site, branch, context, exact source and environment isolation');
