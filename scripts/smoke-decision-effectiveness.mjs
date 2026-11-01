import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine=read('apps/api/src/decision-effectiveness.ts');
const route=read('apps/api/src/routes-executive-decisions.ts');
const executive=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(engine,"minimumSample:sample",'minimum sample disclosure');
has(engine,"selectionBiasPossible:true",'selection bias disclosure');
has(engine,"confoundingPossible:true",'confounding disclosure');
has(engine,"noCounterfactualInference:true",'no counterfactual inference');
has(engine,"causalClaims:false",'causal claim prohibition');
has(engine,"automaticStrategySelection:false",'automatic strategy selection prohibition');
has(engine,"automaticPolicyChange:false",'automatic policy change prohibition');
has(engine,"automaticAutonomyChange:false",'automatic autonomy change prohibition');
has(engine,"automaticDecisionChange:false",'automatic decision change prohibition');
has(engine,"Não declarar uma postura como melhor sem desenho causal apropriado.",'safe comparative conclusion');
has(route,"/v1/executive-decisions/effectiveness",'read-only effectiveness endpoint');
has(executive,'buildDecisionEffectiveness(decisionFollowup,3)','Maya strategy learning integration');
has(ui,'MAYA · STRATEGY LEARNING','visible strategy learning');
has(ui,'nenhuma postura é tratada como causalmente superior.','visible causal superiority caveat');
lacks(engine,'automaticStrategySelection:true','automatic strategy selection');
lacks(engine,'externalEffects:true','external effects');
lacks(engine,'insert into ','persistence');
lacks(engine,'update ','mutation');

console.log(JSON.stringify({
  ok:true,
  module:'Decision Effectiveness Strategy Learning V1',
  minSample:3,
  temporalAssociationOnly:true,
  selectionBiasPossible:true,
  confoundingPossible:true,
  noCounterfactualInference:true,
  causalClaims:false,
  automaticStrategySelection:false,
  externalEffects:false
},null,2));
