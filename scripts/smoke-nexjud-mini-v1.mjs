import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(v,label)=>{if(!v)throw new Error(`NexJud Mini contract failed: ${label}`)};
const has=(t,v,label)=>must(t.includes(v),label||`missing ${v}`);
const lacks=(t,v,label)=>must(!t.includes(v),label||`unexpected ${v}`);

const route=read('apps/api/src/routes-nexjud-mini.ts');
const ui=read('apps/web/src/NexJudMini.tsx');
const main=read('apps/web/src/main.tsx');
const env=read('.env.example');

has(route,"/v1/legal/mini/status",'status route');
has(route,"/v1/legal/mini'",'ask route');
has(route,'NEXOFFICE_NEXJUD_MINI_ENABLED','server-side feature gate');
has(route,'NEXJUD_MINI_KEY','dedicated server-to-server key');
has(route,'legalTextPersisted:false','audit explicitly excludes legal text');
has(route,"select name,vertical,plan,currency,timezone from workspaces",'business context allowlist');
lacks(route,'crm_contacts','no CRM/customer data is forwarded');
lacks(route,'document_refs','no documents are forwarded');
lacks(route,'legal_domain_signals','no deep legal records are forwarded');
lacks(route,'question:input.question','audit must not persist raw question');

has(ui,'A pergunta não é salva pelo NexOffice','UI persistence disclosure');
has(ui,'Sem pesquisa jurídica em tempo real','UI source limitation');
has(ui,'não substitui aconselhamento profissional','UI professional boundary');
has(ui,'includeBusinessContext','context is explicit opt-in');
has(main,'<NexJudMini/>','NexJud Mini mounted');
has(env,'NEXOFFICE_NEXJUD_MINI_ENABLED=false','Mini disabled by default');

console.log('NexOffice NexJud Mini V1 privacy contract OK');
