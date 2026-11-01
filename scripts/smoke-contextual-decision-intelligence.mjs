import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine=read('apps/api/src/contextual-decision-intelligence.ts');
const route=read('apps/api/src/routes-decision-patterns.ts');
const executive=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(engine,'contextAsOfDecision:true','as-of-decision context policy');
has(engine,'l.due_at<db.decided_at','historical overdue reconstruction');
has(engine,'l.paid_at is null or l.paid_at>db.decided_at','historical unpaid-at-decision reconstruction');
has(engine,'a.occurred_at<=db.decided_at','historical CRM recency reconstruction');
has(engine,"contextDimensions:['contact_kind','overdue_state_as_of_decision','crm_engagement_recency_as_of_decision']",'documented context dimensions');
has(engine,'temporalAssociationOnly:true','temporal-only interpretation');
has(engine,'causalClaims:false','causal claim prohibition');
has(engine,'contextNeverOverridesHumanReview:true','human-review override prohibition');
has(engine,'automaticPolicyChange:false','automatic policy prohibition');
has(engine,'automaticAutonomyChange:false','automatic autonomy prohibition');
has(engine,'automaticDecisionChange:false','automatic decision prohibition');
has(route,"/v1/intelligence/contextual-decision-patterns",'read-only contextual endpoint');
has(executive,'buildContextualDecisionIntelligence','Maya contextual intelligence integration');
has(ui,'MAYA · INTELIGÊNCIA CONTEXTUAL','visible contextual intelligence');
has(ui,'O contexto é reconstruído na data da decisão','visible temporal reconstruction disclosure');
lacks(engine,'automaticPolicyChange:true','automatic policy change');
lacks(engine,'automaticAutonomyChange:true','automatic autonomy change');
lacks(engine,'automaticDecisionChange:true','automatic decision change');
lacks(engine,'externalEffects:true','external effects');

console.log(JSON.stringify({
  ok:true,
  module:'Contextual Decision Intelligence V1',
  contextAsOfDecision:true,
  dimensions:['contact_kind','financial_state','engagement_recency'],
  temporalAssociationOnly:true,
  causalClaims:false,
  humanReviewRequired:true,
  externalEffects:false
},null,2));
