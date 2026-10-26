import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const main=readFileSync('apps/web/src/main.tsx','utf8');
const vite=readFileSync('apps/web/vite.config.ts','utf8');
const personal=readFileSync('apps/web/src/NexPersonal.tsx','utf8');
const builder=readFileSync('scripts/build-nexa-lifeos-path.mjs','utf8');
const path='/meu-espaco/app/';
assert.match(vite,/NEXA_LIFEOS_PATH_BUILD/);
assert.match(vite,/base:lifeosPathMode\?'\/meu-espaco\/app\/'\:'\/'/);
assert.match(vite,/NEXA_LIFEOS_PROD_RELEASE_APPROVED/);
assert.match(main,/publicLifeos && publicBuildProbe/);
assert.match(main,/Esta visualização não aceita login, não se conecta à Wallet/);
assert.match(main,/: publicLifeos\s+\? <NexPersonal\/>/);
assert.match(personal,/nexa\.life\.session\.v1/);
assert.match(personal,/VITE_NEXA_LIFEOS_API_URL/);
assert.match(builder,/nex-personal-preview-api\.onrender\.com/);
assert.match(builder,/nexa-backend-p2u0\.onrender\.com/);
assert.match(builder,/NEXA_LIFEOS_PROD_RELEASE_APPROVED/);
assert.match(builder,/NEXA_LIFEOS_PATH_BUILD_OK/);
assert.ok(!builder.includes('NEXA_LIFEOS_API_ORIGIN||'),'Cannot silently default public Life OS API to existing Nexa/WALLET host');

if(process.env.NEXA_LIFEOS_CHECK_DIST==='true'){
 const root=resolve('apps/web/dist');
 assert.ok(existsSync(resolve(root,'index.html')),'No compiled route HTML found');
 const html=readFileSync(resolve(root,'index.html'),'utf8');
 assert.match(html,/<title>Nexa — Seu espaço, suas escolhas<\/title>/);
 assert.match(html,/name="robots" content="noindex, nofollow, noarchive"/);
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/meu-espaco\/app\/nexa-logo\.svg"/);
 assert.match(html,/src="\/meu-espaco\/app\/assets\//);
 assert.match(html,/href="\/meu-espaco\/app\/assets\//);
 assert.doesNotMatch(html,/nexoffices\.com\.br/i);
 assert.doesNotMatch(html,/href="\/favicon\.svg"/);
 assert.ok(existsSync(resolve(root,'nexa-logo.svg')),'Official Nexa logo missing');
}
console.log('Nexa Life OS public-path base, independent API/session and opt-in build gate PASS');
