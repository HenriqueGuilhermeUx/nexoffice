import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const code=readFileSync('apps/api/src/server-personal.ts','utf8');
const script=readFileSync('scripts/check-nexa-belvo-sandbox.mjs','utf8');
test('probe requires all three preview-only sandbox flags',()=>{
 for(const value of [
  "process.env.NEX_PERSONAL_PREVIEW==='true'",
  "process.env.BELVO_ENV==='sandbox'",
  "process.env.BELVO_SANDBOX_ENABLED==='true'"
 ])assert.ok(code.includes(value));
 assert.match(code,/await app\.listen\([\s\S]*belvo_sandbox_probe_authenticated/);
});
test('probe cannot add public endpoint, touch wallet or write to the database',()=>{
 const probe=code.slice(code.indexOf('// Belvo connectivity SELF-DIAGNOSTIC.'));
 assert.doesNotMatch(probe,/app\.(get|post|put|patch|delete)\(/);
 assert.doesNotMatch(probe,/client\.query\(|db\.query\(|\btransaction\(/);
 assert.doesNotMatch(probe,/Privy|MetaMask|WalletConnect|pix\./i);
 assert.match(script,/method:'GET'/);
 assert.match(script,/\/api\/institutions\//);
 assert.doesNotMatch(script,/method:'POST'|method:'PUT'|method:'DELETE'/);
});
test('only whitelisted diagnostic codes are logged and stdout is suppressed',()=>{
 assert.ok(code.includes("stdio:['ignore','ignore','pipe']"));
 assert.ok(code.includes('shell:false'));
 assert.match(code,/const safeCode=match\?\.\[1\]\|\|'CHECK_FAILED'/);
 assert.doesNotMatch(code.slice(code.indexOf('// Belvo connectivity SELF-DIAGNOSTIC.')),/console\.(info|warn|error)\([^;]*(secret|password|authorization|detail|chunk)/i);
});
