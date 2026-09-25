import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`TaxAgent Operation Sync V1 contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const sync=read('apps/api/src/routes-taxagent-operation-sync.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/BusinessOperationCenter.tsx');
const env=read('.env.example');
const operations=read('apps/api/src/routes-business-operations.ts');

has(sync,"/v1/business-operations/:id/sync-invoice",'operation invoice sync endpoint');
has(sync,"status='succeeded'",'TaxAgent external ID recovery only from successful agent run');
has(sync,'run?.output?.payload?.id','TaxAgent accepted invoice ID recovery');
has(sync,"'/v1/invoices/:id'",'real TaxAgent v1 read contract');
has(sync,"method",'fetch implementation present');
// Sync is intentionally a GET: no method override may turn it into a fiscal write.
lacks(sync,"method:'POST'",'sync must never POST to TaxAgent');
lacks(sync,"method:'PATCH'",'sync must never mutate TaxAgent');
has(sync,'taxagent_company_mismatch','company isolation guard');
has(sync,"fiscalStatus==='authorized'",'authorized state mapping');
has(sync,"return 'invoice_authorized'",'authorized operation state');
has(sync,"return 'attention'",'rejected/cancelled attention state');
has(sync,'if(!preCollectionStatuses.has(current))return current','sync must not regress collection/payment states');
has(sync,"business_operation.invoice_synced",'sync audit event');
has(sync,'externalEffect:false','sync is read-only/non-executing');
has(sync,'fiscalErrorMessage:String(rejection.message).slice(0,500)','rejection metadata is bounded');
lacks(sync,'canonical_input','NexOffice must not persist TaxAgent canonical fiscal payload');
lacks(sync,'customer.tax','NexOffice sync must not copy TaxAgent customer payload');

has(standalone,'registerTaxAgentOperationSyncRoutes(app)','TaxAgent sync route registered');
has(env,'TAXAGENT_INVOICE_READ_PATH=/v1/invoices/:id','TaxAgent read path documented');
has(ui,'Sincronizar nota','native invoice sync action');
has(ui,'Fiscal: ${fiscalLabel[op.fiscal_status]||op.fiscal_status}','fiscal status visible in Commercial Operation');
has(ui,"op.fiscal_status==='authorized'",'authorized fiscal state reflected in lineage');
has(operations,"emitBusinessEvent(ctx.workspaceId,'invoice.issue'",'fiscal issuance remains separate approval-first operation');

console.log('NexOffice TaxAgent Operation Sync V1 contract OK');
