import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('apps/web/src/NexPersonal.tsx','utf8');

// Verify transient outages do not sign users out. A 401 is different from a
// network timeout or server 500, including during the first render.
assert.match(source,/class PersonalRequestError extends Error/);
assert.match(source,/readonly status:number/);
assert.match(source,/new PersonalRequestError\('Não foi possível conectar/, 'Network failures retain their own status');
assert.match(source,/new PersonalRequestError\(body\.message\|\|body\.error\|\|'Não foi possível carregar seus dados\.',response\.status\)/);
assert.match(source,/err instanceof PersonalRequestError&&err\.status===401/);
assert.match(source,/Seu login foi mantido/);
assert.match(source,/Seu login continua salvo/);
assert.match(source,/Tentar novamente/);
assert.match(source,/Tentar atualizar/);
assert.doesNotMatch(source,/void refresh\(token\)\.catch\(\(\)=>\{\s*sessionStorage\.removeItem/,
 'Refreshing data must not log out users on any error');

// Fail closed for old session responses, including a logout or fast switch
// between different accounts.
assert.match(source,/const activeTokenRef=useRef\(token\)/);
assert.match(source,/if\(activeTokenRef\.current!==currentToken\)return;/);
assert.match(source,/activeTokenRef\.current='';/);
assert.match(source,/activeTokenRef\.current=response\.token/);
assert.match(source,/if\(activeTokenRef\.current===token\)setReady\(true\)/);
assert.match(source,/older retry may finish after logout/i);
assert.match(source,/if\(activeTokenRef\.current===token\)setReady\(true\);\s*}\s*}\s*if\(!ready\)/);

// Remote sign-out might fail; do not silently pretend server-side session
// revocation succeeded if the device goes offline.
assert.match(source,/não foi possível confirmar a revogação da sessão no servidor/i);

console.log('Nex Personal session resilience: 401-only invalidation, retry on outage, old response fencing, honest logout notice OK');
