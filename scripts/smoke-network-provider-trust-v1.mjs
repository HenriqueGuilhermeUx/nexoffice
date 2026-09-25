import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Provider trust contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const migration=read('infra/postgres/033_provider_public_trust.sql');
const routes=read('apps/api/src/routes-network-trust.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/NetworkCenter.tsx');
const css=read('apps/web/src/network-center.css');

has(migration,'provider_public_trust_v1','public trust aggregate view');
has(migration,"r.status='completed'",'only completed requests count as engagements');
has(migration,"bo.status='paid'",'operational evidence requires linked paid operation');
has(migration,'count(distinct requester_workspace_id)','distinct client aggregate only');
has(migration,'having count(*)>=2','repeat-client aggregate threshold');
has(migration,'evidence_coverage_pct','evidence coverage aggregate');
has(migration,'outcome_coverage_pct','outcome coverage aggregate');
lacks(migration,'amount_minor','public trust view must not expose revenue amounts');
lacks(migration,'contact_id','public trust view must not expose CRM contacts');
lacks(migration,'document_ref_id','public trust view must not expose document references');
lacks(migration,'fiscal_external_ref','public trust view must not expose fiscal references');

has(routes,"ranking:false",'methodology explicitly disables ranking');
has(routes,"score:false",'methodology explicitly disables scoring');
has(routes,'Evidência operacional não é auditoria independente','evidence caveat');
has(routes,"p.status='published'",'public list only includes published providers');
has(routes,"profile.status!=='published'&&providerWorkspaceId!==ctx.workspaceId",'non-published provider trust visible only to itself');
has(routes,'clientIdentityExposed:false','client identity privacy contract');
has(routes,'revenueAmountExposed:false','revenue amount privacy contract');
has(routes,'rawOutcomeMetricsExposed:false','raw outcome metrics privacy contract');
lacks(routes,'order by operational_evidence','providers are not ranked by evidence');
lacks(routes,'order by evidence_coverage_pct','providers are not ranked by coverage');

has(standalone,'registerNetworkTrustRoutes(app)','provider trust routes registered');
has(ui,"api<TrustResponse>('/v1/network/trust')",'Network loads public evidence aggregates');
has(ui,"api<MeTrustResponse>('/v1/network/provider/me/trust')",'provider sees own evidence summary');
has(ui,'Evidência operacional = serviço concluído','UI explains evidence meaning');
has(ui,'Não é nota, ranking ou garantia de qualidade','UI avoids misleading quality claims');
has(css,'.providerTrust','provider trust UI styled');

console.log('NexOffice Network Provider Trust V1 privacy contract OK');
