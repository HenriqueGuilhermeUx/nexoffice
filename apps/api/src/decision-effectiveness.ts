type FollowupLike={
  decisionId:string;
  priorityCode:string;
  priorityTitle:string;
  selectedPosture:string;
  selectedLabel:string;
  confidence:string;
  observationStatus:string;
  daysSinceDecision:number;
  summary:{totalObserved:number;positive:number;negative:number;neutral:number};
};

const evidenceLevel=(sample:number)=>sample>=20?'substantial':sample>=10?'established':sample>=5?'developing':'early';

export function buildDecisionEffectiveness(followup:any,minSample=3){
  const sample=Math.max(3,Math.min(50,Math.round(minSample||3)));
  const rows:Array<FollowupLike>=Array.isArray(followup?.followups)?followup.followups:[];

  const postureGroups=new Map<string,FollowupLike[]>();
  const contextualGroups=new Map<string,FollowupLike[]>();
  for(const row of rows){
    const posture=String(row.selectedPosture||'unknown');
    if(!postureGroups.has(posture))postureGroups.set(posture,[]);
    postureGroups.get(posture)!.push(row);

    const key=String(row.priorityCode||'unknown')+'|'+posture;
    if(!contextualGroups.has(key))contextualGroups.set(key,[]);
    contextualGroups.get(key)!.push(row);
  }

  const summarize=(group:FollowupLike[])=>{
    const completed=group.filter(row=>row.observationStatus==='window_complete');
    const observed=group.filter(row=>Number(row.summary?.totalObserved||0)>0);
    const positive=group.filter(row=>Number(row.summary?.positive||0)>0);
    const negative=group.filter(row=>Number(row.summary?.negative||0)>0);
    const neutralOnly=group.filter(row=>Number(row.summary?.totalObserved||0)>0&&Number(row.summary?.positive||0)===0&&Number(row.summary?.negative||0)===0);
    const size=group.length;
    return{
      sampleSize:size,
      completedObservationWindows:completed.length,
      decisionsWithObservedEvents:observed.length,
      observationCoveragePct:size?Math.round(observed.length/size*100):0,
      decisionsWithPositivePct:size?Math.round(positive.length/size*100):0,
      decisionsWithNegativePct:size?Math.round(negative.length/size*100):0,
      neutralOnlyPct:size?Math.round(neutralOnly.length/size*100):0,
      evidenceLevel:evidenceLevel(size)
    };
  };

  const byPosture=[...postureGroups.entries()]
    .filter(([,group])=>group.length>=sample)
    .map(([posture,group])=>({
      posture,
      ...summarize(group),
      interpretation:'Nesta amostra, decisões com postura '+posture+' tiveram os resultados posteriores descritos acima. Comparação observacional; não estima efeito causal da postura.',
      recommendedUse:'Usar para revisão estratégica e geração de hipóteses, nunca para escolher postura automaticamente.'
    }))
    .sort((a,b)=>b.sampleSize-a.sampleSize);

  const byPriorityAndPosture=[...contextualGroups.entries()]
    .filter(([,group])=>group.length>=sample)
    .map(([key,group])=>{
      const [priorityCode,posture]=key.split('|');
      return{
        priorityCode,
        priorityTitle:String(group[0]?.priorityTitle||priorityCode),
        posture,
        ...summarize(group),
        interpretation:'Para a prioridade '+priorityCode+', esta postura aparece associada aos resultados posteriores observados nesta amostra. Não há inferência causal nem contrafactual.'
      };
    })
    .sort((a,b)=>b.sampleSize-a.sampleSize||b.observationCoveragePct-a.observationCoveragePct);

  const comparablePriorities=new Map<string,any[]>();
  for(const row of byPriorityAndPosture){
    if(!comparablePriorities.has(row.priorityCode))comparablePriorities.set(row.priorityCode,[]);
    comparablePriorities.get(row.priorityCode)!.push(row);
  }
  const comparisons=[...comparablePriorities.entries()]
    .filter(([,items])=>items.length>=2)
    .map(([priorityCode,items])=>({
      priorityCode,
      priorityTitle:String(items[0]?.priorityTitle||priorityCode),
      postures:items,
      interpretation:'Há mais de uma postura com amostra mínima nesta prioridade. Diferenças observadas são descritivas e podem refletir seleção, contexto e fatores não medidos.',
      safeConclusion:'Não declarar uma postura como melhor sem desenho causal apropriado.'
    }));

  return{
    generatedAt:new Date().toISOString(),
    minSample:sample,
    byPosture,
    byPriorityAndPosture,
    comparisons,
    summary:{
      decisionsAnalyzed:rows.length,
      posturePatterns:byPosture.length,
      contextualPatterns:byPriorityAndPosture.length,
      comparablePrioritySets:comparisons.length
    },
    methodology:{
      unitOfAnalysis:'executive_decision',
      outcomeSource:'executive_decision_followup',
      groupsBy:['selected_posture','priority_code'],
      minimumSample:sample,
      observationWindowDays:90,
      temporalAssociationOnly:true,
      selectionBiasPossible:true,
      confoundingPossible:true,
      noCounterfactualInference:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticStrategySelection:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      automaticDecisionChange:false
    }
  };
}
