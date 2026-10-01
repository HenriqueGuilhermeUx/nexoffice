import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`TaxAgent homologation matrix contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const migration=read('infra/postgres/035_taxagent_homologation_matrix.sql');
const routes=read('apps/api/src/routes-taxagent-homologation.ts');
const registry=read('apps/api/src/routes-taxagent-operation-sync.ts');

has(migration,'create table if not exists taxagent_homologation_cases','homologation matrix is persisted');
has(migration,"check(environment='test')",'database forbids production homologation cases');
has(migration,"municipal_registration_context in ('available','not_applicable','unavailable','unknown')",'municipal registration is descriptive context');
has(migration,'NexOffice does not infer that municipal registration is universally required','migration documents municipal-registration boundary');
has(migration,'Only safe, non-secret TaxAgent references may be recorded','migration documents safe-reference boundary');

has(routes,"app.get('/v1/fiscal/homologation/cases'",'matrix list endpoint exists');
has(routes,"app.post('/v1/fiscal/homologation/cases'",'matrix case creation endpoint exists');
has(routes,"app.patch('/v1/fiscal/homologation/cases/:id/result'",'manual result recording endpoint exists');
has(routes,"values($1,$2,$3,$4,$5,$6,$7,$8,'planned','test'",'new cases are always test-only');
has(routes,"environment:'test'",'API reports test-only environment');
has(routes,'executionAvailable:false','API explicitly has no execution capability');
has(routes,'manualEvidenceOnly:true','results are manual evidence only');
has(routes,'productionEnabled:false','production is explicitly disabled');
has(routes,'municipalRegistrationUniversallyRequired:false','API never assumes municipal registration universally required');
has(routes,'accessKey:safeReferenceValue.optional()','safe reference whitelist includes access key');
has(routes,'providerReference:safeReferenceValue.optional()','safe reference whitelist includes provider reference');
has(routes,'.strict().default({})','safe reference object rejects unknown fields');
has(routes,'rawFiscalPayloadLogged:false','audit does not log raw fiscal payload');
has(routes,'credentialLogged:false','audit does not log credentials');
has(routes,'externalEffect:false','matrix actions are side-effect free');
lacks(routes,'fetch(','matrix never calls TaxAgent remotely');
lacks(routes,'prepare-invoice','matrix never prepares invoice issuance');
lacks(routes,'emitBusinessEvent','matrix never emits execution actions');
lacks(routes,'TAXAGENT_API_KEY','matrix never reads TaxAgent credentials');
lacks(routes,'pix_key','matrix never reads Pix data');
lacks(routes,'workspace_members','matrix never changes workspace access');
lacks(routes,'danfse_url','matrix does not invent DANFSe URL');
lacks(routes,'invoice_number','matrix does not invent invoice number');
lacks(routes,'verification_code','matrix does not invent verification code');

has(registry,"import {registerTaxAgentHomologationRoutes} from './routes-taxagent-homologation.js'",'homologation routes imported into fiscal registry');
has(registry,'await registerTaxAgentHomologationRoutes(app)','homologation routes registered');
has(registry,"app.get('/v1/business-operations/:id/fiscal-readiness'",'fiscal readiness route remains intact');
has(registry,"app.post('/v1/business-operations/:id/sync-invoice'",'TaxAgent sync route remains intact');

console.log('NexOffice TaxAgent Homologation Matrix V1 contract OK');
