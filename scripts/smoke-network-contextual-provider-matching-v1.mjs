import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Network contextual provider matching contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const routes=read('apps/api/src/routes-network-provider-matching.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const web=read('apps/web/src/NetworkCenter.tsx');

has(routes,"app.post('/v1/network/provider-matches'",'contextual provider matching endpoint');
has(routes,"workspaceContext(req,'workspace.read')",'matching is authenticated and workspace-scoped');
has(routes,"p.status='published'",'only published provider profiles are candidates');
has(routes,"w.status='active'",'only active provider workspaces are candidates');
has(routes,"s.active=true",'only providers with active services are candidates');
has(routes,"p.workspace_id<>$1",'requesting workspace is excluded');
has(routes,'providerCapabilityEvidence','observed capability evidence is reused');
has(routes,'detectedFacets','matcher exposes explainable detected facets');
has(routes,'reasons:distinct(reasons)','matcher returns human-readable match reasons');
has(routes,'alphabetical ordering prevents an implicit quality hierarchy','display order is explicitly non-ranked');
has(routes,'ranking:false','methodology forbids ranking');
has(routes,'score:false','methodology forbids scores');
has(routes,'bestProvider:false','methodology never selects a best provider');
has(routes,'alphabeticalDisplayOrder:true','provider display ordering is neutral/deterministic');
has(routes,'humanDecisionRequired:true','human chooses provider');
has(routes,'observedCapabilitiesAreEvidenceOnly:true','capabilities are evidence, not quality judgment');
has(routes,'clientIdentityExposed:false','client identity remains private');
has(routes,'amountsExposed:false','amounts remain private');
has(routes,'pixSecretExposed:false','Pix secret remains private');
has(routes,'rawDocumentsExposed:false','raw docs remain private');
has(routes,'fiscalPayloadExposed:false','fiscal payload remains private');
has(routes,'privateOutcomeMetricsExposed:false','private outcome metrics remain private');
has(routes,'externalEffect:false','matching never creates an external effect');
lacks(routes,'order by score','no score-based SQL ordering');
lacks(routes,'order by rating','no rating-based SQL ordering');
lacks(routes,'workspace_members','matching never grants workspace membership');
lacks(routes,'pix_key','matching never reads Pix secret');
lacks(routes,'privateMetrics','matching never reads private outcome metrics');

has(standalone,"import {registerNetworkProviderMatchingRoutes} from './routes-network-provider-matching.js'",'matcher import registered');
has(standalone,'await registerNetworkProviderMatchingRoutes(app)','matcher route registered');
has(standalone,"app.get('/v1/standalone/readiness'",'standalone registry remains intact after matcher registration');
has(standalone,"workspace_invites where workspace_id=$1 and status='pending'",'standalone readiness body preserved');

has(web,"post<ProviderMatchResponse>('/v1/network/provider-matches'",'discovery UI calls contextual matcher');
has(web,'Encontrar compatibilidades','discovery UI exposes explicit matching action');
has(web,'COMPATIBILIDADES EXPLICADAS','matched providers are visually separated from general directory');
has(web,'Compatível porque','UI explains why each provider is related');
has(web,'A ordem abaixo é alfabética. Não existe score, ranking ou “melhor prestador”','UI explicitly explains neutral ordering');
has(web,'Compatibilidade contextual não é avaliação de qualidade nem garantia de resultado.','UI avoids quality claims');
has(web,'Todos os especialistas publicados','general directory remains available after matching');
lacks(web,'match.score','UI never reads a provider score');
lacks(web,'bestProvider','UI never renders a best-provider designation');
lacks(web,'sort((a,b)=>b.score','UI never sorts providers by score');

console.log('NexOffice Network Contextual Provider Matching V1 contract OK');
