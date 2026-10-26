// Static release guard for the isolated Nexa PJ desktop build.
// This fails if routing begins mounting NexOffice before enterprise auth is implemented.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../apps/web/src/main.tsx',import.meta.url),'utf8');
const gate=readFileSync(new URL('../apps/web/src/NexaPjAccessGate.tsx',import.meta.url),'utf8');
const account=readFileSync(new URL('../apps/web/src/ContaNexa.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../apps/web/src/api.ts',import.meta.url),'utf8');

assert.match(main,/nexaPjBuild\s*\?\s*<NexaPjAccessGate\s*\/>/);
assert.match(gate,/Acesso integrado em homologação/);
assert.match(account,/result\.financialAccess!==false/);
assert.match(account,/result\.balancesVisible!==false/);
assert.match(account,/result\.pixEnabled!==false/);
assert.match(account,/result\.cryptoEnabled!==false/);
assert.match(api,/pjBuild\?'nexa-pj\.token':'nexoffice\.token'/);
assert.match(api,/pjBuild\?'nexa-pj\.workspace':'nexoffice\.workspace'/);
console.log('Nexa PJ fail-closed desktop and session isolation checks passed');
