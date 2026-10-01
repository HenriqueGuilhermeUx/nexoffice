import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Contextual recommendation contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const routes=read('apps/api/src/routes-ecosystem-recommendations.ts');
const standalone=read('apps/api/src/routes-standalone.ts');
const ui=read('apps/web/src/CommandCenterOverview.tsx');
const css=read('apps/web/src/command-center-overview.css');
const plan=read('docs/NEXOFFICE_EXECUTION_PLAN.md');

has(routes,"/v1/ecosystem/recommendations",'recommendation endpoint');
has(routes,"workspaceContext(req,'workspace.read')",'workspace-scoped recommendation access');
has(routes,'deterministicRules:true','deterministic recommendation contract');
has(routes,'externalEffects:false','recommendations cannot execute external effects');
has(routes,'humanDecisionRequired:true','human remains decision maker');
has(routes,'nexaOperationalFinance:false','Nexa operational finance boundary');
has(routes,'privateWorkspaceDataStaysPrivate:true','privacy boundary');
has(routes,"p.status='published'",'only published providers can be recommended cross-workspace');
has(routes,"p.workspace_id<>$1",'self-provider excluded from specialist recommendation');
has(routes,"fiscalAttention>=2",'human fiscal specialist escalation requires repeated signal');
has(routes,"capability:'av_studio'",'AV Studio can be contextually suggested for custom-build signals');
has(routes,"capability:'nexjud_mini'",'NexJud Mini preserved for lightweight legal signals');
has(routes,"capability:'docwallet'",'DocWallet formalization recommendation');
has(routes,"capability:'taxagent'",'TaxAgent fiscal recommendation');
has(routes,"capability:'owner_pix'",'owner-controlled Pix recommendation');
has(routes,"capability:'crm+smartbots'",'CRM + SmartBots pipeline recovery recommendation');
has(routes,"capability:'modo'",'MODO demand recommendation');
lacks(routes,'modoMarketingRequest','recommendation decision must not call MODO');
lacks(routes,'dispatchOutbox','recommendation decision must not dispatch actions');
lacks(routes,'emitBusinessEvent','recommendation decision must not create command actions');
lacks(routes,'nexa-business','recommendation engine must not invoke Nexa Business');
lacks(routes,"capability:'nexa'",'Nexa must not be auto-recommended');

has(standalone,'registerEcosystemRecommendationRoutes(app)','recommendation routes registered');
has(ui,"api<RecommendationResponse>('/v1/ecosystem/recommendations')",'Command Center loads recommendations');
has(ui,'O que eu faria agora','next-best-action UI');
has(ui,'Humano no controle · zero ação automática','human-control UI contract');
has(ui,"document.querySelector<HTMLButtonElement>('.networkLauncher')?.click()",'network recommendation only opens Network UI');
has(css,'.commandNextBest','recommendation cards styled');
has(plan,'Product recommendation engine direction','recommendation direction preserved in execution plan');

console.log('NexOffice Contextual Ecosystem Recommendations V1 contract OK');
