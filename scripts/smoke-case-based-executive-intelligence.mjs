import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine=read('apps/api/src/case-based-executive-intelligence.ts');
const route=read('apps/api/src/routes-decision-patterns.ts');
const executive=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(engine,"similarityDimensions:{",'similarity methodology');
has(engine,"actionFamily:35",'action family weight');
has(engine,"contactKind:20",'contact kind weight');
has(engine,"financialState:25",'financial state weight');
has(engine,"engagementState:20",'engagement state weight');
has(engine,"minimumSimilarityScore:55",'minimum similarity threshold');
has(engine,"String(pattern.decision)==='approved'",'approved historical decisions only');
has(engine,"historicalContextReconstructedAsOfDecision:true",'historical temporal integrity');
has(engine,"currentContextUsesPresentRelationshipState:true",'current context disclosure');
has(engine,"rankingOnly:true",'ranking-only behavior');
has(engine,"causalClaims:false",'causal claim prohibition');
has(engine,"humanReviewRequired:true",'human review requirement');
has(engine,"externalEffects:false",'external effect prohibition');
has(engine,"precomputed?.relationship",'precomputed relationship reuse');
has(engine,"precomputed?.contextual",'precomputed contextual reuse');
has(route,"/v1/intelligence/case-based-executive",'case-based read-only endpoint');
has(executive,"buildCaseBasedExecutiveIntelligence(workspaceId,180,3,{relationship,contextual:contextualPatterns})",'executive reuse without duplicate heavy reads');
has(ui,'MAYA · CASOS COMPARÁVEIS','visible comparable cases');
has(ui,'Similaridade organiza evidências','visible similarity caveat');
lacks(engine,'automaticPolicyChange:true','automatic policy change');
lacks(engine,'automaticAutonomyChange:true','automatic autonomy change');
lacks(engine,'automaticDecisionChange:true','automatic decision change');
lacks(engine,'externalEffects:true','external effects');

console.log(JSON.stringify({
  ok:true,
  module:'Case-Based Executive Intelligence V1',
  similarityThreshold:55,
  dimensions:{actionFamily:35,contactKind:20,financialState:25,engagementState:20},
  historicalContextAsOfDecision:true,
  rankingOnly:true,
  causalClaims:false,
  humanReviewRequired:true,
  externalEffects:false
},null,2));
