import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine=read('apps/api/src/executive-review.ts');
const executive=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(engine,'reviewPeriodDays:7','weekly review period');
has(engine,"boardStatus",'board status');
has(engine,'insufficientEvidenceVisible:true','insufficient evidence visibility');
has(engine,'contradictoryEvidenceVisible:true','contradictory evidence visibility');
has(engine,'temporalAssociationOnly:true','temporal association disclosure');
has(engine,'causalClaims:false','causal claim prohibition');
has(engine,'automaticDecision:false','automatic decision prohibition');
has(engine,'automaticExecution:false','automatic execution prohibition');
has(engine,'automaticPolicyChange:false','automatic policy change prohibition');
has(engine,'automaticAutonomyChange:false','automatic autonomy change prohibition');
has(engine,'humanReviewRequired:true','human review requirement');
has(executive,'executiveReview:buildExecutiveReview({','Executive Context integration');
has(ui,'MAYA · EXECUTIVE REVIEW','visible Executive Review');
has(ui,'SEM EVIDÊNCIA SUFICIENTE','visible evidence gaps');
has(ui,'Hipótese ≠ causalidade','visible causal caveat');
has(ui,'Nenhum item é decidido ou executado automaticamente.','visible no-auto-action copy');
lacks(engine,'insert into ','review persistence');
lacks(engine,'update ','review mutation');
lacks(engine,'emitBusinessEvent(','review event emission');
lacks(engine,'externalEffects:true','external effects');

console.log(JSON.stringify({
  ok:true,
  module:'Maya Executive Review V1',
  summaryOnly:true,
  reviewPeriodDays:7,
  causalClaims:false,
  humanReviewRequired:true,
  automaticDecision:false,
  automaticExecution:false,
  externalEffects:false
},null,2));
