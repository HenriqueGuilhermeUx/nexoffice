import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const api=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{
  if(!text.includes(needle))throw new Error('Missing '+label+': '+needle);
};
const lacks=(text,needle,label)=>{
  if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle);
};

has(api,"learningContext?:{",'priority learning context contract');
has(api,"source:'nex.decision_patterns'",'decision pattern evidence provenance');
has(api,"causalClaim:false",'causal claim prohibition');
has(api,"advisoryOnly:true",'advisory-only policy');
has(api,"String(item.decision)==='approved'",'approved-decision filter');
has(api,"Number(item.sampleSize||0)>=3",'minimum historical sample');
has(api,"Isso serve apenas como contexto de revisão humana e não prova causalidade.",'Maya causal caveat');
has(ui,'HISTÓRICO COMPARÁVEL · CONTEXTO, NÃO CAUSALIDADE','visible causal caveat');
has(ui,'Uso apenas consultivo; a recomendação continua sujeita à revisão humana.','visible human-review gate');
lacks(api,'automaticPolicyChange:true','automatic policy change');
lacks(api,'automaticAutonomyChange:true','automatic autonomy change');

console.log(JSON.stringify({
  ok:true,
  module:'Maya Recommendation Learning V1',
  mode:'advisory_read_only',
  minimumSample:3,
  causalClaims:false,
  automaticPolicyChange:false,
  automaticAutonomyChange:false,
  externalEffects:false
},null,2));
