type RecommendationEvidence={source:string;label:string;value:unknown};
type PriorityLike={
  code:string;
  level:string;
  title:string;
  detail:string;
  hypothesis?:string|null;
  recommendedNextStep?:string|null;
  evidence?:RecommendationEvidence[];
};
type CaseMatch={
  contactId?:string;
  name?:string;
  relationshipStatus?:string;
  bestMatch?:{
    similarityScore:number;
    matchedDimensions:string[];
    actionType:string;
    sampleSize:number;
    outcomeCoveragePct:number;
    positiveDecisionPct:number;
    negativeDecisionPct:number;
    evidenceLevel:string;
    interpretation:string;
  }|null;
};

type RecommendationPath={
  id:string;
  label:string;
  posture:'conservative'|'balanced'|'active';
  description:string;
  why:string;
  tradeoffs:string[];
  risks:string[];
  suggestedActionFamily:string|null;
  evidence:RecommendationEvidence[];
  comparableCases:Array<{
    contactId:string|null;
    name:string|null;
    similarityScore:number;
    actionType:string;
    sampleSize:number;
    outcomeCoveragePct:number;
    positiveDecisionPct:number;
    negativeDecisionPct:number;
    evidenceLevel:string;
  }>;
  confidence:'low'|'medium'|'high';
  humanReviewRequired:true;
  externalEffects:false;
};

const actionFamilies:Record<string,string[]>={
  receivables_overdue:['review_finance','create_followup_task','prepare_collection'],
  external_receivables_overdue:['review_finance','create_followup_task','prepare_collection'],
  relationship_at_risk:['view_context','create_followup_task','prepare_recovery'],
  relationship_renewal_soon:['view_context','create_followup_task','prepare_renewal'],
  deals_past_expected_close:['review_pipeline','create_followup_task','prepare_reengagement'],
  external_deals_past_expected_close:['review_pipeline','create_followup_task','prepare_reengagement'],
  tasks_overdue:['reprioritize_tasks','review_dependencies','prepare_owner_followup'],
  projected_cash_negative:['review_cash','protect_liquidity','prepare_cash_plan'],
  customer_concentration:['review_concentration','protect_key_accounts','diversify_pipeline']
};

const confidence=(cases:Array<any>,evidenceCount:number):'low'|'medium'|'high'=> {
  const best=cases[0];
  if(best&&Number(best.similarityScore)>=80&&Number(best.sampleSize)>=10&&evidenceCount>=2)return'high';
  if((best&&Number(best.similarityScore)>=65&&Number(best.sampleSize)>=5)||evidenceCount>=2)return'medium';
  return'low';
};

export function buildExecutiveRecommendationStack(priorities:PriorityLike[],caseBased:any){
  const cases=Array.isArray(caseBased?.cases)?caseBased.cases:[];
  const items=priorities.slice(0,5).map(priority=>{
    const hints=actionFamilies[priority.code]||[];
    const relevantCases=cases
      .filter((item:any)=>item?.bestMatch)
      .filter((item:any)=>!hints.length||hints.some(hint=>String(item.bestMatch?.actionType||'').includes(hint.split('_')[0])))
      .sort((a:any,b:any)=>Number(b.bestMatch?.similarityScore||0)-Number(a.bestMatch?.similarityScore||0))
      .slice(0,3);
    const evidence=Array.isArray(priority.evidence)?priority.evidence.slice(0,8):[];
    const baseConfidence=confidence(relevantCases.map((x:any)=>x.bestMatch),evidence.length);
    const caseEvidence=relevantCases.map((item:any)=>({
      contactId:item.contactId?String(item.contactId):null,
      name:item.name?String(item.name):null,
      similarityScore:Number(item.bestMatch.similarityScore||0),
      actionType:String(item.bestMatch.actionType||''),
      sampleSize:Number(item.bestMatch.sampleSize||0),
      outcomeCoveragePct:Number(item.bestMatch.outcomeCoveragePct||0),
      positiveDecisionPct:Number(item.bestMatch.positiveDecisionPct||0),
      negativeDecisionPct:Number(item.bestMatch.negativeDecisionPct||0),
      evidenceLevel:String(item.bestMatch.evidenceLevel||'early')
    }));

    const paths:RecommendationPath[]=[
      {
        id:priority.code+':conservative',
        label:'Observar e validar',
        posture:'conservative',
        description:'Confirmar dados, contexto e responsáveis antes de mudar a operação.',
        why:'Reduz risco de agir sobre dados incompletos ou correlações ainda fracas.',
        tradeoffs:['Menor risco operacional','Resposta mais lenta','Pode postergar captura de oportunidade'],
        risks:['Inércia','Perda de timing se a prioridade estiver acelerando'],
        suggestedActionFamily:hints[0]||null,
        evidence,
        comparableCases:caseEvidence,
        confidence:baseConfidence,
        humanReviewRequired:true,
        externalEffects:false
      },
      {
        id:priority.code+':balanced',
        label:'Agir com controle',
        posture:'balanced',
        description:priority.recommendedNextStep||'Preparar uma ação interna reversível, com revisão humana antes de qualquer efeito externo.',
        why:'Equilibra velocidade e governança usando as evidências atuais e o histórico comparável.',
        tradeoffs:['Mais velocidade que apenas observar','Mantém checkpoints humanos','Exige acompanhamento do resultado'],
        risks:['A hipótese pode estar incompleta','Casos parecidos não garantem o mesmo resultado'],
        suggestedActionFamily:hints[1]||hints[0]||null,
        evidence,
        comparableCases:caseEvidence,
        confidence:baseConfidence,
        humanReviewRequired:true,
        externalEffects:false
      },
      {
        id:priority.code+':active',
        label:'Preparar intervenção',
        posture:'active',
        description:'Estruturar a intervenção recomendada e deixar pronta para aprovação explícita, sem executá-la automaticamente.',
        why:'Útil quando o custo de esperar pode superar o risco de preparação antecipada.',
        tradeoffs:['Maior prontidão','Mais esforço operacional','Pode exigir coordenação entre áreas'],
        risks:['Overreaction se o sinal for transitório','Ação inadequada se o contexto mudou desde os precedentes'],
        suggestedActionFamily:hints[2]||hints[1]||hints[0]||null,
        evidence,
        comparableCases:caseEvidence,
        confidence:baseConfidence,
        humanReviewRequired:true,
        externalEffects:false
      }
    ];

    return{
      priority:{code:priority.code,level:priority.level,title:priority.title,detail:priority.detail,hypothesis:priority.hypothesis||null},
      paths,
      recommendationPolicy:{
        defaultPath:'balanced',
        defaultIsSuggestionOnly:true,
        automaticSelection:false,
        automaticExecution:false,
        humanChoosesPath:true,
        causalClaims:false
      }
    };
  });

  return{
    generatedAt:new Date().toISOString(),
    items,
    summary:{
      prioritiesCovered:items.length,
      pathsGenerated:items.reduce((sum,item)=>sum+item.paths.length,0),
      prioritiesWithComparableCases:items.filter(item=>item.paths.some(path=>path.comparableCases.length>0)).length
    },
    methodology:{
      alternativesPerPriority:3,
      postures:['conservative','balanced','active'],
      usesExistingPriorityEvidence:true,
      usesComparableCases:true,
      rankingIsAdvisory:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticPathSelection:false,
      automaticExecution:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      humanDecisionRequired:true
    }
  };
}
