type ReviewPriority={code:string;level:string;title:string;detail:string;learningContext?:any};
type ReviewInput={
  priorities:ReviewPriority[];
  businessKnowledgePct:number|null;
  sourceCount:number;
  crossSystemInsights:number;
  recommendationStack:any;
  decisionFollowup:any;
  decisionEffectiveness:any;
  decisionLearning:any;
};

const n=(value:unknown)=>Number(value||0);
const evidenceRank=(value:string)=>value==='substantial'?4:value==='established'?3:value==='developing'?2:1;

export function buildExecutiveReview(input:ReviewInput){
  const priorities=Array.isArray(input.priorities)?input.priorities:[];
  const recommendationItems=Array.isArray(input.recommendationStack?.items)?input.recommendationStack.items:[];
  const followups=Array.isArray(input.decisionFollowup?.followups)?input.decisionFollowup.followups:[];
  const posturePatterns=Array.isArray(input.decisionEffectiveness?.byPosture)?input.decisionEffectiveness.byPosture:[];
  const decisionPatterns=Array.isArray(input.decisionLearning?.patterns)?input.decisionLearning.patterns:[];

  const critical=priorities.filter(item=>item.level==='critical');
  const attention=priorities.filter(item=>item.level==='attention');
  const boardStatus=critical.length?'critical':attention.length?'attention':'stable';

  const decideNow=recommendationItems.slice(0,3).map((item:any)=>({
    code:String(item.priority?.code||'priority'),
    level:String(item.priority?.level||'info'),
    title:String(item.priority?.title||'Prioridade executiva'),
    detail:String(item.priority?.detail||''),
    paths:Array.isArray(item.paths)?item.paths.map((path:any)=>({
      id:String(path.id||''),
      label:String(path.label||'Caminho'),
      posture:String(path.posture||'balanced'),
      confidence:String(path.confidence||'low')
    })):[],
    humanDecisionRequired:true,
    automaticSelection:false,
    automaticExecution:false
  }));

  const monitoring=followups.filter((item:any)=>String(item.observationStatus)==='monitoring').slice(0,3).map((item:any)=>({
    kind:'decision_monitoring',
    title:String(item.priorityTitle||'Decisão em acompanhamento'),
    detail:`${String(item.selectedLabel||'Caminho escolhido')} · ${n(item.daysSinceDecision)} dia(s) desde a decisão`,
    decisionId:String(item.decisionId||'')
  }));
  const riskWatch=priorities.filter(item=>item.level!=='info').slice(0,Math.max(0,3-monitoring.length)).map(item=>({
    kind:'priority',
    title:item.title,
    detail:item.detail,
    code:item.code
  }));
  const watchlist=[...monitoring,...riskWatch].slice(0,3);

  const observed=followups.filter((item:any)=>n(item.summary?.totalObserved)>0).slice(0,3).map((item:any)=>({
    decisionId:String(item.decisionId||''),
    title:String(item.priorityTitle||'Decisão acompanhada'),
    selectedLabel:String(item.selectedLabel||''),
    observedEvents:n(item.summary?.totalObserved),
    positive:n(item.summary?.positive),
    negative:n(item.summary?.negative),
    neutral:n(item.summary?.neutral),
    latestObservedAt:item.summary?.latestObservedAt?String(item.summary.latestObservedAt):null,
    interpretation:'Eventos posteriores compatíveis foram observados. A relação é temporal e não demonstra causalidade.'
  }));

  const repeatedPatterns=posturePatterns
    .filter((item:any)=>n(item.sampleSize)>=3)
    .sort((a:any,b:any)=>evidenceRank(String(b.evidenceLevel))-evidenceRank(String(a.evidenceLevel))||n(b.sampleSize)-n(a.sampleSize))
    .slice(0,3)
    .map((item:any)=>({
      posture:String(item.posture||''),
      sampleSize:n(item.sampleSize),
      observationCoveragePct:n(item.observationCoveragePct),
      evidenceLevel:String(item.evidenceLevel||'early'),
      interpretation:String(item.interpretation||'Padrão descritivo observado no histórico.')
    }));

  const insufficientEvidence:string[]=[];
  if(input.businessKnowledgePct==null||input.businessKnowledgePct<60)insufficientEvidence.push('Conhecimento do negócio ainda incompleto; conecte mais fontes antes de elevar a confiança.');
  if(input.sourceCount<2)insufficientEvidence.push('Há menos de duas fontes relevantes conectadas; cruzamentos multi-sistema ainda são limitados.');
  if(!decisionPatterns.length)insufficientEvidence.push('Ainda não há amostra histórica suficiente para padrões de decisão.');
  if(!observed.length&&n(input.decisionFollowup?.summary?.decisionsTracked)>0)insufficientEvidence.push('Existem decisões em acompanhamento, mas ainda sem eventos posteriores observáveis.');
  if(!insufficientEvidence.length&&priorities.some(item=>!item.learningContext))insufficientEvidence.push('Algumas prioridades atuais ainda não têm histórico comparável suficiente.');

  const openQuestions:string[]=[];
  if(critical.length)openQuestions.push('Qual prioridade crítica exige decisão humana antes das demais?');
  if(n(input.decisionFollowup?.summary?.monitoring)>0)openQuestions.push('Quais decisões em acompanhamento precisam de mais tempo ou evidência antes de nova intervenção?');
  if(input.businessKnowledgePct==null||input.businessKnowledgePct<75)openQuestions.push('Qual fonte de dados reduziria mais a incerteza da leitura executiva?');
  if(!openQuestions.length)openQuestions.push('O contexto atual mudou o suficiente para justificar uma nova decisão ou apenas acompanhamento?');

  const evidenceQuality=input.sourceCount>=3&&n(input.decisionLearning?.summary?.decisionsAnalyzed)>=10
    ?'established'
    :input.sourceCount>=2||n(input.decisionLearning?.summary?.decisionsAnalyzed)>=3
      ?'developing'
      :'early';

  return{
    generatedAt:new Date().toISOString(),
    reviewPeriodDays:7,
    boardStatus,
    agendaSummary:{
      decideNow:decideNow.length,
      watch:watchlist.length,
      learned:observed.length,
      insufficientEvidence:insufficientEvidence.length
    },
    decideNow,
    watchlist,
    learnedSinceReview:observed,
    repeatedPatterns,
    insufficientEvidence:insufficientEvidence.slice(0,4),
    openQuestions:openQuestions.slice(0,4),
    recommendedReviewOrder:['decide_now','watch','learned','insufficient_evidence','open_questions'],
    evidenceQuality,
    methodology:{
      summaryOnly:true,
      sourceProvenancePreserved:true,
      insufficientEvidenceVisible:true,
      contradictoryEvidenceVisible:true,
      temporalAssociationOnly:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticDecision:false,
      automaticExecution:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      humanReviewRequired:true
    }
  };
}
