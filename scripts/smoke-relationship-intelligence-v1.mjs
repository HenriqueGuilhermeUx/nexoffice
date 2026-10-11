import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error('Relationship Intelligence contract failed: '+label)};
const has=(text,value,label)=>must(text.includes(value),label||('missing '+value));
const lacks=(text,value,label)=>must(!text.includes(value),label||('unexpected '+value));

const route=read('apps/api/src/routes-relationship-intelligence.ts');
const panel=read('apps/web/src/RelationshipIntelligencePanel.tsx');
const app=read('apps/web/src/App.tsx');
const server=read('apps/api/src/server.ts');
const materials=read('apps/web/src/MaterialsCenter.tsx');

has(route,"/v1/crm/relationship-intelligence",'relationship intelligence endpoint');
has(route,"workspaceContext(req,'crm.read')",'CRM read permission boundary');
has(route,'readDocWalletUpcomingExpirations','optional DocWallet expiration signal');
has(route,"docwallet_unavailable",'DocWallet failure must degrade safely');
has(route,"status='risk'",'explicit risk classification');
has(route,"status='renewal'",'explicit renewal classification');
has(route,"status='attention'",'explicit attention classification');
has(route,"status='expansion'",'explicit expansion classification');
has(route,"2+ recebimentos vencidos",'risk rule must be explainable');
has(route,"45+ dias sem interação",'stale relationship rule must be explainable');
has(route,"nos próximos 60 dias",'renewal window must be visible');
has(route,"oferta ativa ainda não utilizada",'expansion rule must be explainable');
has(route,"externalCommunication:false",'no automatic external communication');
has(route,"automaticProposalSend:false",'no automatic proposal sending');
has(route,"automaticDiscount:false",'no automatic discount');
has(route,"automaticRenewal:false",'no automatic renewal');
lacks(route,'message.send','relationship intelligence must not send messages');
lacks(route,'payment.discount','relationship intelligence must not discount');

has(panel,'RELACIONAMENTO & RENOVAÇÃO','relationship panel heading');
has(panel,'MELHORES OPÇÕES AGORA','next-best-action block');
has(panel,"post('/v1/tasks'",'explicit internal follow-up task action');
has(panel,"nexoffice.material.contactId",'proposal must carry selected client');
has(panel,"nexoffice.material.catalogItemId",'proposal must carry selected offer');
has(panel,'Nenhuma mensagem foi enviada ao cliente','task action safety copy');
has(panel,'não envia mensagens','panel external-action safety copy');
has(app,'<RelationshipIntelligencePanel/>','relationship panel mounted in CRM');
has(server,'registerRelationshipIntelligenceRoutes','relationship route registered');
has(materials,"nexoffice.material.contactId",'Materials must consume preselected relationship client');

console.log('NexOffice Relationship & Renewal Intelligence V1 contract OK');
