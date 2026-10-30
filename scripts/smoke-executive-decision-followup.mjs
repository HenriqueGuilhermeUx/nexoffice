import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine=read('apps/api/src/executive-decision-followup.ts');
const route=read('apps/api/src/routes-executive-decisions.ts');
const executive=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(engine,"observationWindowDays:90",'90-day observation window');
has(engine,"source:'business_events'",'business event source');
has(engine,"relevanceUsesSuggestedActionFamilyAndRecordedEvidence:true",'recorded-context relevance');
has(engine,"temporalAssociationOnly:true",'temporal association only');
has(engine,"noCounterfactualInference:true",'no counterfactual inference');
has(engine,"causalClaims:false",'causal claim prohibition');
has(engine,"automaticExecution:false",'automatic execution prohibition');
has(engine,"automaticPolicyChange:false",'automatic policy change prohibition');
has(engine,"automaticAutonomyChange:false",'automatic autonomy change prohibition');
has(engine,"automaticDecisionChange:false",'automatic decision change prohibition');
has(route,"/v1/executive-decisions/followup",'read-only follow-up endpoint');
has(executive,'buildExecutiveDecisionFollowup(workspaceId,90)','Maya follow-up integration');
has(ui,'MAYA · ACOMPANHAMENTO DE DECISÕES','visible decision follow-up');
has(ui,'Sequência temporal não significa causalidade.','visible causal caveat');
lacks(engine,'insert into ','follow-up persistence');
lacks(engine,'update ','follow-up mutation');
lacks(engine,'emitBusinessEvent(','event emission');
lacks(engine,'externalEffects:true','external effects');

console.log(JSON.stringify({
  ok:true,
  module:'Executive Decision Follow-up V1',
  observationWindowDays:90,
  dynamicFromBusinessEvents:true,
  temporalAssociationOnly:true,
  causalClaims:false,
  externalEffects:false,
  automaticExecution:false
},null,2));
