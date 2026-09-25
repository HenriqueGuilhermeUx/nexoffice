import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`TaxAgent commercial sync contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const sync=read('apps/api/src/taxagent-operation-sync.ts');
const routes=read('apps/api/src/routes-taxagent-operation-sync.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const operations=read('apps/api/src/routes-business-operations.ts');
const ui=read('apps/web/src/BusinessOperationCenter.tsx');
const migration=read('infra/postgres/029_business_operation_lineage.sql');

has(migration,'fiscal_external_ref text','TaxAgent external invoice reference column');
has(migration,'fiscal_status text','TaxAgent fiscal status column');
has(sync,'agent_runs','sync can recover invoice id from executed command result');
has(sync,"run?.output?.payload?.id",'invoice id discovery uses real TaxAgent create response');
has(sync,"method:'GET'",'status synchronization is read-only at TaxAgent');
has(sync,"/v1/invoices",'TaxAgent invoice endpoint contract');
has(sync,"fiscalStatus==='authorized'",'authorized status mapping');
has(sync,"['rejected','cancelled']",'rejected/cancelled attention mapping');
has(sync,"taxAgentRejection",'TaxAgent rejection summary retained');
has(sync,'externalEffect:false','sync response declares no external side effect');
lacks(sync,"method:'POST'",'status synchronization must not create/reissue invoices');
lacks(sync,'invoice.issue','sync must not create another fiscal intent');
lacks(sync,'prepared_dps','sync must not mutate fiscal issuance payload');

has(routes,"/v1/business-operations/:id/sync-invoice",'commercial operation fiscal sync route');
has(routes,"business_operation.invoice_synced",'fiscal sync audit event');
has(standalone,'registerTaxAgentOperationSyncRoutes(app)','TaxAgent sync routes registered');
has(operations,"'invoice.issue'",'original issuance remains approval-first');
has(operations,"governance:'human_approval_required'",'invoice issuance human approval preserved');
has(ui,'Atualizar nota','native fiscal sync action');
has(ui,'Fiscal:','native fiscal status display');
has(ui,"op.fiscal_status==='authorized'",'UI only marks fiscal step complete after TaxAgent authorization');

console.log('NexOffice TaxAgent Commercial Sync V1 contract OK');
