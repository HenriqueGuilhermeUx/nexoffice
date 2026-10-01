import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Network work execution contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const routes=read('apps/api/src/routes-network-work-execution.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const center=read('apps/web/src/NetworkCenter.tsx');
const lineage=read('apps/web/src/NetworkWorkLineage.tsx');
const lineageCss=read('apps/web/src/network-work-lineage.css');

has(routes,"app.post('/v1/network/requests/:id/operation'",'create operation from provider request');
has(routes,"app.post('/v1/network/requests/:id/link-operation'",'link existing operation to provider request');
has(routes,"app.get('/v1/network/requests/:id/lineage'",'safe execution lineage endpoint');
has(routes,"provider_request_id",'business operation keeps provider request lineage');
has(routes,"source:'network_provider_request'",'network-origin metadata');
has(routes,"contractEngine:'docwallet'",'DocWallet remains document engine');
has(routes,"fiscalEngine:'taxagent'",'TaxAgent remains fiscal engine');
has(routes,"collectionMode:'owner_pix'",'owner-controlled Pix remains collection model');
has(routes,"communicationEngine:'smartbots'",'SmartBots remains communication engine');
has(routes,"externalEffect:false",'route contract remains non-executing');
has(routes,"amountExposed:false",'lineage hides financial amount');
has(routes,"pixSecretExposed:false",'lineage hides Pix secret');
has(routes,"documentContentExposed:false",'lineage hides raw document');
has(routes,"fiscalExternalRefExposed:false",'lineage hides fiscal external reference');
has(routes,"providerWorkspaceMembershipGranted:false",'lineage never creates broad membership');
has(routes,"requester_workspace_id=$2",'only requester can create or link its operation');
has(routes,"(requester_workspace_id=$2 or provider_workspace_id=$2)",'lineage limited to request participants');
has(routes,"activeWorkStatuses=['accepted','in_progress','completed']",'execution starts only after provider acceptance');
lacks(routes,'workspace_members','execution loop must not create provider workspace membership');
lacks(routes,'pix_key','execution loop must not read Pix secret');
lacks(routes,'decryptPaymentValue','execution loop must not decrypt payment data');
lacks(routes,"emitBusinessEvent",'execution loop must not emit fiscal/payment/communication effects');
lacks(routes,"NEXOFFICE_EXTERNAL_ACTIONS",'execution loop must not enable external action flags');
has(standalone,'registerNetworkWorkExecutionRoutes(app)','work execution routes registered');

has(center,"import NetworkWorkLineage from './NetworkWorkLineage'",'Network Center imports work lineage UI');
has(center,'<NetworkWorkLineage request={r} requester={requester}/>','active work card renders native lineage');
has(lineage,"/v1/network/requests/${request.id}/lineage",'UI reads safe lineage endpoint');
has(lineage,"/v1/network/requests/${request.id}/operation",'requester can create operation from work card');
has(lineage,'Criar Operação Comercial','explicit operation creation UX');
has(lineage,'Nenhuma ação externa acontece automaticamente.','human-control explanation');
has(lineage,'Não emite nota, não gera Pix e não envia mensagem.','operation creation boundary visible');
has(lineage,"requester&&['accepted','in_progress','completed'].includes(request.status)",'only requester can see operation creation eligibility');
lacks(lineage,'pixKey','lineage UI never handles Pix secret');
lacks(lineage,'fiscal_external_ref','lineage UI never renders raw fiscal external reference');
lacks(lineage,'.fiscalExternalRef','lineage UI never accesses fiscal external reference field');
lacks(lineage,'workspace_members','lineage UI never grants workspace membership');
has(lineage,'fiscalExternalRefExposed:false','privacy flag remains explicit in UI contract');
has(lineageCss,'.networkLineageSteps','lineage steps styled');
has(lineageCss,'.networkOperationCreate','operation creation styled');

console.log('NexOffice Network Work Execution / Outcome Loop V1 contract OK');
