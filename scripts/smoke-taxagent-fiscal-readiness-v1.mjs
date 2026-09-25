import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`TaxAgent fiscal readiness contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const readiness=read('apps/api/src/taxagent-fiscal-readiness.ts');
const routes=read('apps/api/src/routes-taxagent-operation-sync.ts');
const sync=read('apps/api/src/taxagent-operation-sync.ts');

has(routes,"app.get('/v1/business-operations/:id/fiscal-readiness'",'readiness endpoint exists');
has(routes,"workspaceContext(req,'workspace.read')",'readiness is read scoped');
has(routes,"environment:z.enum(['test','production']).default('test')",'readiness distinguishes test and production');
has(routes,'taxAgentFiscalReadiness','route delegates to readiness evaluator');

has(readiness,"provider='taxagent'",'readiness checks TaxAgent integration');
has(readiness,'customer_tax_id','customer fiscal document readiness check');
has(readiness,'customer_city_code','customer municipality readiness check');
has(readiness,'taxagent_company','TaxAgent company mapping readiness check');
has(readiness,'taxagent_credential','TaxAgent credential readiness check');
has(readiness,'taxagent_base_url','TaxAgent endpoint readiness check');
has(readiness,"environment==='test'||externalActionsEnabled",'test readiness does not require production external-action gate');
has(readiness,"environment==='production'&&externalActionsEnabled",'production readiness reports the real external-action gate');
has(readiness,'humanApprovalRequired:true','human approval remains mandatory');
has(readiness,'remoteTaxAgentCall:false','readiness explicitly makes no remote TaxAgent call');
has(readiness,'municipalRegistrationAssumedRequired:false','NexOffice does not assume municipal registration is universally required');
has(readiness,'Inscrição Municipal não é presumida como requisito universal','readiness explains municipal-registration boundary');
has(readiness,'externalEffect:false','readiness is side-effect free');
lacks(readiness,'fetch(','readiness never calls TaxAgent or another remote service');
lacks(readiness,'emitBusinessEvent','readiness never prepares or executes an external action');
lacks(readiness,'workspace_members','readiness never changes workspace access');

has(sync,'function safeReferences(payload:any)','TaxAgent sync uses explicit safe-reference mapper');
has(sync,'accessKey:payload?.access_key||null','access key is an existing supported safe reference');
has(sync,'providerReference:payload?.provider_reference||null','provider reference is an existing supported safe reference');
has(sync,'taxAgentSafeReferences:refs','safe references are persisted in lineage metadata');
has(sync,'safeReferences:refs','safe references are returned to authenticated NexOffice flow');
lacks(sync,'danfse_url','DANFSe URL is not invented without a verified TaxAgent contract');
lacks(sync,'verification_code','verification code is not invented without a verified TaxAgent contract');
lacks(sync,'invoice_number','invoice number is not invented without a verified TaxAgent contract');

console.log('NexOffice TaxAgent Fiscal Readiness V1 contract OK');
