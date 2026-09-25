import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Network capability eligibility contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const model=read('apps/api/src/network-provider-capabilities.ts');
const routes=read('apps/api/src/routes-network-capabilities.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const center=read('apps/web/src/NetworkCenter.tsx');
const css=read('apps/web/src/network-capabilities.css');

has(model,"networkReady:workspaceActive&&profilePublished&&activeService",'network eligibility derives from active workspace, published profile and active service');
has(model,"has_document_flow",'document capability derives from observed operation data');
has(model,"has_fiscal_flow",'fiscal capability derives from observed operation data');
has(model,"has_collection_flow",'collection capability derives from observed operation data');
has(model,"has_communication_flow",'communication capability derives from observed operation data');
has(model,"has_delegated_context",'delegated context capability derives from observed delegation data');
has(model,"has_outcome",'outcome capability derives from recorded client outcome');
has(model,"ranking:false,score:false,certification:false,observedEvidenceOnly:true",'capability methodology is explicitly non-ranking and non-certification');
lacks(model,'rating','no rating model');
lacks(model,'stars','no stars model');
lacks(model,'best_provider','no best-provider selection');
lacks(model,'workspace_members','capability calculation never grants workspace membership');
lacks(model,'pix_key','capability calculation never reads Pix secret');
lacks(model,'amount_minor','public capability evidence does not expose amounts');

has(routes,"app.get('/v1/network/capabilities'",'public provider capability endpoint');
has(routes,"app.get('/v1/network/provider/me/capabilities'",'provider self capability endpoint');
has(routes,"app.get('/v1/network/providers/:workspaceId/capabilities'",'single provider capability endpoint');
has(routes,"observedEvidenceOnly:true",'API explains observed-evidence methodology');
has(routes,"clientIdentityExposed:false",'client identity remains private');
has(routes,"amountExposed:false",'amount remains private');
has(routes,"pixSecretExposed:false",'Pix secret remains private');
has(routes,"rawDocumentContentExposed:false",'raw document remains private');
has(routes,"fiscalPayloadExposed:false",'fiscal payload remains private');
lacks(routes,'order by score','no score ranking');
lacks(routes,'order by rating','no rating ranking');

has(standalone,"registerNetworkCapabilityRoutes(app)",'capability routes registered');
has(center,"api<CapabilityResponse>('/v1/network/capabilities')",'provider discovery loads capability evidence');
has(center,"api<CapabilityEvidence>('/v1/network/provider/me/capabilities')",'provider self view loads capability evidence');
has(center,'<CapabilitySummary data={p.capability} compact/>','public provider card shows capability evidence separately from trust');
has(center,'<CapabilitySummary data={me?.capability}/>','provider self area shows capability evidence');
has(center,'Não são certificação, nota, ranking ou garantia de qualidade.','UI explains evidence boundary');
lacks(center,'O melhor prestador','UI never declares a best provider');
lacks(center,'Melhor prestador:','UI never labels a provider as best');
lacks(center,'★★★★★','UI does not introduce stars');
has(css,'.providerCapabilityBadges','capability badges have dedicated styling');
has(css,'.providerCapabilityEligibility','eligibility state has dedicated styling');

console.log('NexOffice Network Capability / Eligibility V1 contract OK');