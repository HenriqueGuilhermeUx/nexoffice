import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync('apps/web/src/NexPersonal.tsx','utf8');
const office=readFileSync('apps/web/src/NexPersonalLifeOffice.tsx','utf8');
const life=readFileSync('apps/api/src/routes-nex-personal-life.ts','utf8');
const crypto=readFileSync('apps/web/src/NexaCryptoHub.tsx','utf8');
const css=readFileSync('apps/web/src/nexa-life-rebrand.css','utf8');
const names=readFileSync('scripts/smoke-nex-personal-names.mjs','utf8');

assert.match(app,/<strong>Nexa<\/strong>/);
assert.doesNotMatch(app,/Nex <strong>Personal<\/strong>/);
assert.match(app,/NEXA · SUA VIDA, UM SÓ LUGAR/);
assert.match(app,/\['crypto','Cripto & Wallet'\]/);
assert.match(app,/section==='crypto'&&<NexaCryptoHub key=\{token\}/);
assert.match(office,/id:'crypto',title:'Cripto & Wallet',emoji:'◈',agent:'Nico'/);
assert.match(office,/route:'crypto',tag:'Acesso à Wallet'/);
assert.match(life,/const areas=.*'crypto'/);
assert.match(names,/crypto:'Nico'/);
assert.match(names,/Object.keys\(rooms\).length,16/);
assert.match(css,/#06111f/);
assert.match(css,/#31d7ff/);
assert.match(css,/#218bff/);
assert.match(crypto,/const WALLET_PORTAL='https:\/\/trynexa\.com\.br\/portal\/'/);
assert.match(crypto,/const WALLET_SIGNUP='https:\/\/trynexa\.com\.br\/cadastro'/);
assert.match(crypto,/target="_blank" rel="noopener noreferrer"/);
assert.match(crypto,/Não criamos uma nova carteira nem importamos chaves privadas automaticamente/);
assert.match(crypto,/nexa.*0%/i);
for(const dangerous of ['useCreateWallet','usePrivy','sendTransaction','wallet_switchEthereumChain','x-privy-access-token','authorization:', 'sessionStorage.','localStorage.','/transfer','/swap']){
 assert.ok(!crypto.includes(dangerous),'Nexa Life OS must not execute wallet actions: '+dangerous);
}
console.log('Nexa unification: Nexa brand, 16th crypto room, scoped palette and noncustodial Wallet handoff OK');
