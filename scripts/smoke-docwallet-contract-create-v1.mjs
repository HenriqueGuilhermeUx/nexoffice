import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`DocWallet contract create contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const route=read('apps/api/src/routes-docwallet-contracts.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/ContractCreator.tsx');
const main=read('apps/web/src/main.tsx');

has(route,"/v1/contracts/templates",'template route');
has(route,"/v1/contracts/create",'create route');
has(route,"/api/internal/nexoffice/contracts/create",'server-to-server DocWallet bridge');
has(route,"DOCWALLET_SERVICE_KEY",'service key remains server side');
has(route,"contentStoredInDocWalletOnly:true",'content ownership boundary');
has(route,"rawContentPersistedInNexOffice:false",'raw content persistence blocked');
has(route,"signatureRequested:false",'signature is not automatic');
has(route,"externalEffects:false",'external effects disabled for draft creation');
has(route,"'docwallet'",'document reference provider');
has(route,"document_refs",'created document is referenced in NexOffice');
lacks(route,"metadata:{description",'contract description must not enter reference metadata');
lacks(route,"after_state:input",'raw create input must not be written to audit');

has(standalone,'registerDocWalletContractRoutes','routes registered');
has(ui,'Novo contrato','native create entry');
has(ui,"'/v1/contracts/templates'",'UI loads server catalog');
has(ui,"'/v1/contracts/create'",'UI creates through NexOffice API');
has(ui,'O texto fica na DocWallet','UI privacy disclosure');
has(ui,'assinatura não solicitada','UI signature disclosure');
lacks(ui,'DOCWALLET_BASE_URL','browser does not know provider URL');
lacks(ui,'DOCWALLET_SERVICE_KEY','browser does not know provider secret');
has(main,'<ContractCreator/>','creator mounted');

console.log('NexOffice DocWallet contract creation V1 architecture contract OK');
