import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Network ecosystem contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const network=read('apps/api/src/routes-network.ts');
const payments=read('apps/api/src/routes-owned-payments.ts');
const crypto=read('apps/api/src/payment-data-crypto.ts');
const operations=read('apps/api/src/routes-business-operations.ts');
const ecosystem=read('apps/api/src/routes-ecosystem.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/NetworkCenter.tsx');
const main=read('apps/web/src/main.tsx');
const migration28=read('infra/postgres/028_network_and_owned_payments.sql');
const migration29=read('infra/postgres/029_business_operation_lineage.sql');
const migration30=read('infra/postgres/030_ecosystem_offers.sql');
const blueprint=read('docs/NEXOFFICE_ECOSYSTEM_BLUEPRINT.md');

has(network,"/v1/network/providers",'provider directory route');
has(network,"p.status='published'",'directory only exposes published profiles');
has(network,'self_request_not_allowed','self-request guard');
has(network,'document_ref_id','DocWallet reference linkage');

has(migration28,'pix_key_ciphertext','encrypted Pix storage');
lacks(migration28,'pix_key text','no plaintext Pix-key column');
has(crypto,"createCipheriv('aes-256-gcm'",'AES-GCM encryption');
has(crypto,'NEXOFFICE_PAYMENT_DATA_KEY','dedicated payment-data key');
has(payments,'maskedPixKey','payment profile returns masked Pix');
has(payments,"externalEffect:false",'Pix package is preparation only');

has(migration29,'business_operations','business operation lineage table');
has(operations,"'invoice.issue'",'TaxAgent invoice intent');
has(operations,"governance:'human_approval_required'",'invoice human approval');
has(operations,"/prepare-collection",'operation to receivable');
has(operations,"/communication-draft",'secret-safe communication draft');
has(operations,'secretPersisted:false','raw Pix key is not persisted in communication actions');
lacks(operations,"action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload) values($1,'message.send'",'raw Pix communication is not persisted as approval payload');

has(ecosystem,"key:'av_studio'",'AV Studio first-party offer');
has(ecosystem,"key:'nexa'",'Nexa future offer');
has(ecosystem,"status:'future'",'Nexa remains future-only');
has(ecosystem,"'no_baas'",'Nexa no-BaaS constraint');
has(ecosystem,"'no_account_provisioning'",'Nexa no-account-provisioning constraint');
has(ecosystem,"externalEffect:false",'ecosystem interest is non-executing');
lacks(ecosystem,'nexa-business','offer route cannot invoke Nexa Business adapter');
has(migration30,"check(offer_key in ('av_studio','nexa'))",'first-party interest allowlist');

has(standalone,'registerNetworkRoutes(app)','Network routes registered');
has(standalone,'registerOwnedPaymentRoutes(app)','owner Pix routes registered');
has(standalone,'registerBusinessOperationRoutes(app)','business-operation routes registered');
has(standalone,'registerEcosystemRoutes(app)','ecosystem routes registered');
has(main,'<NetworkCenter/>','Network UI mounted');
has(ui,"api<Offer[]>('/v1/ecosystem/offers')",'Network UI loads curated ecosystem offers');
has(ui,"/v1/ecosystem/offers/${offer.key}/interest",'Network UI captures explicit first-party offer interest');
has(ui,'Nexa/BaaS permanece fora do fluxo financeiro.','UI states Nexa financial boundary');
has(ui,'DocWallet formaliza · TaxAgent fiscaliza · SmartBots comunica.','cross-engine business-flow framing');

has(blueprint,'### NexJud Mini','NexJud Mini preserved in product blueprint');
has(blueprint,'### Alternative Ventures Studio','AV Studio preserved in product blueprint');
has(blueprint,'### Nexa','Nexa boundary preserved in product blueprint');
has(blueprint,'MODO creates demand','canonical end-to-end lineage preserved');

console.log('NexOffice Network + ecosystem V1 architecture contract OK');
