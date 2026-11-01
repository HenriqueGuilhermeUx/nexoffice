import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stack=read('apps/api/src/executive-recommendation-stack.ts');
const executive=read('apps/api/src/executive-context.ts');
const ui=read('apps/web/src/ExecutiveContextPanel.tsx');

const has=(text,needle,label)=>{if(!text.includes(needle))throw new Error('Missing '+label+': '+needle)};
const lacks=(text,needle,label)=>{if(text.includes(needle))throw new Error('Forbidden '+label+': '+needle)};

has(stack,"posture:'conservative'|'balanced'|'active'",'three-path posture contract');
has(stack,"defaultPath:'balanced'",'balanced default suggestion');
has(stack,"defaultIsSuggestionOnly:true",'suggestion-only default');
has(stack,"automaticSelection:false",'no automatic path selection');
has(stack,"automaticExecution:false",'no automatic execution');
has(stack,"humanChoosesPath:true",'human path choice');
has(stack,"causalClaims:false",'no causal claims');
has(stack,"humanDecisionRequired:true",'human decision requirement');
has(stack,"externalEffects:false",'no external effects');
has(stack,"usesExistingPriorityEvidence:true",'reuse priority evidence');
has(stack,"usesComparableCases:true",'reuse comparable cases');
has(executive,'buildExecutiveRecommendationStack(selected,caseBased)','Maya recommendation stack integration');
has(ui,'MAYA · CAMINHOS DE DECISÃO','visible recommendation stack');
has(ui,'Escolha humana obrigatória','visible human choice requirement');
has(ui,'Nenhum caminho é escolhido ou executado automaticamente.','visible no-autonomy disclosure');
lacks(stack,'automaticSelection:true','automatic selection');
lacks(stack,'automaticExecution:true','automatic execution');
lacks(stack,'automaticPolicyChange:true','automatic policy change');
lacks(stack,'automaticAutonomyChange:true','automatic autonomy change');
lacks(stack,'externalEffects:true','external effects');

console.log(JSON.stringify({
  ok:true,
  module:'Executive Recommendation Stack V1',
  paths:['conservative','balanced','active'],
  defaultSuggestion:'balanced',
  automaticSelection:false,
  automaticExecution:false,
  causalClaims:false,
  humanDecisionRequired:true,
  externalEffects:false
},null,2));
