import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`DocWallet -> Commercial Operation contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const routes=read('apps/api/src/routes-docwallet-contracts.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/ContractCreator.tsx');
const main=read('apps/web/src/main.tsx');
const operationRoutes=read('apps/api/src/routes-business-operations.ts');
const plan=read('docs/NEXOFFICE_EXECUTION_PLAN.md');

has(routes,"/v1/contracts/templates",'DocWallet template catalog endpoint');
has(routes,"/v1/contracts/create",'DocWallet contract creation endpoint');
has(routes,"contentStoredInDocWalletOnly:true",'DocWallet remains raw-content source of truth');
has(routes,"rawContentPersistedInNexOffice:false",'NexOffice raw-content non-persistence contract');
has(routes,"'x-idempotency-key':input.idempotencyKey",'DocWallet creation idempotency');
has(routes,'createBusinessOperation','optional commercial operation creation');
has(routes,'operationId','existing commercial operation linkage');
has(routes,'operation_contact_mismatch','operation/contact ownership guard');
has(routes,'deal_contact_mismatch','deal/contact ownership guard');
has(routes,"status='contract_ready'",'linked operation advances to contract-ready state');
has(routes,"source:'contract_creator'",'created operation records contract-origin lineage');
has(routes,"business_operation.created_from_contract",'audit event for contract-originated operation');
has(routes,"signatureRequested:false",'contract creation cannot auto-request signature');
has(routes,"externalEffects:false",'contract creation is non-executing');
lacks(routes,'invoice.issue','contract creation must not auto-issue fiscal document');
lacks(routes,'message.send','contract creation must not auto-send communication');
lacks(routes,'pix_key','contract creation must not access payment secrets');

has(standalone,'registerDocWalletContractRoutes(app)','DocWallet contract routes registered');
has(ui,'Criar também Operação Comercial','native contract-to-operation option');
has(ui,'Nota → Cobrança → Comunicação → Recebido','user-facing lineage after contract');
has(ui,'Criar contrato + operação','explicit combined action');
has(ui,'assinatura não solicitada','UI preserves signature boundary');
has(main,'<ContractCreator/>','native ContractCreator mounted');
has(operationRoutes,"/prepare-invoice",'downstream TaxAgent preparation remains separate');
has(operationRoutes,"/prepare-collection",'downstream collection remains separate');
has(plan,'DocWallet native contract creation','execution plan preserves contract milestone');
has(plan,'Commercial Operation Orchestrator','execution plan preserves orchestration milestone');

console.log('NexOffice DocWallet -> Commercial Operation V1 contract OK');
