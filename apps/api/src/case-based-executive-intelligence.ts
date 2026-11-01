import {query} from './db.js';
import {buildRelationshipIntelligence} from './routes-relationship-intelligence.js';
import {buildContextualDecisionIntelligence} from './contextual-decision-intelligence.js';

type CurrentCase={
  contactId:string;
  name:string;
  relationshipStatus:string;
  context:{contactKind:string;financialState:string;engagementState:string};
  reasons:string[];
  actionFamilies:string[];
};

const financialState=(overdueCount:number)=>overdueCount>=2?'overdue_2plus':overdueCount===1?'overdue_1':'no_overdue';
const engagementState=(daysSinceTouch:number|null|undefined)=>{
  if(daysSinceTouch===null||daysSinceTouch===undefined||!Number.isFinite(Number(daysSinceTouch)))return 'unknown';
  const days=Number(daysSinceTouch);
  return days<=30?'recent_30':days<=90?'stale_31_90':'stale_90plus';
};
const actionFamiliesFor=(status:string)=>{
  if(status==='risk')return['message.','task.','payment.','deal.'];
  if(status==='renewal')return['deal.','document.','message.','task.'];
  if(status==='attention')return['message.','task.','payment.','deal.'];
  if(status==='expansion')return['deal.','message.','task.'];
  return['task.','message.'];
};
const evidenceRank=(value:string)=>value==='substantial'?4:value==='established'?3:value==='developing'?2:1;

export async function buildCaseBasedExecutiveIntelligence(
  workspaceId:string,
  windowDays=180,
  minSample=3,
  precomputed?:{relationship?:any;contextual?:any}
){
  const [relationship,contextual,contactRows]=await Promise.all([
    precomputed?.relationship?Promise.resolve(precomputed.relationship):buildRelationshipIntelligence(workspaceId,false),
    precomputed?.contextual?Promise.resolve(precomputed.contextual):buildContextualDecisionIntelligence(workspaceId,windowDays,minSample),
    query<any>('select id,kind from crm_contacts where workspace_id=$1',[workspaceId])
  ]);

  const kindByContact=new Map(contactRows.map((row:any)=>[String(row.id),String(row.kind||'unknown')]));
  const relationships=Array.isArray((relationship as any)?.relationships)?(relationship as any).relationships:[];
  const patterns=Array.isArray((contextual as any)?.contextualPatterns)?(contextual as any).contextualPatterns:[];

  const currentCases:CurrentCase[]=relationships.slice(0,50).map((row:any)=>({
    contactId:String(row.contactId),
    name:String(row.name||'Cliente'),
    relationshipStatus:String(row.status||'healthy'),
    context:{
      contactKind:kindByContact.get(String(row.contactId))||'unknown',
      financialState:financialState(Number(row.overdueCount||0)),
      engagementState:engagementState(row.daysSinceTouch)
    },
    reasons:Array.isArray(row.reasons)?row.reasons.map(String):[],
    actionFamilies:actionFamiliesFor(String(row.status||'healthy'))
  }));

  const cases=currentCases.map(current=>{
    const matches=patterns
      .filter((pattern:any)=>String(pattern.decision)==='approved')
      .map((pattern:any)=>{
        let score=0;
        const matched:string[]=[];
        const mismatched:string[]=[];
        const actionMatch=current.actionFamilies.some(prefix=>String(pattern.actionType||'').startsWith(prefix));
        if(actionMatch){score+=35;matched.push('action_family')}else mismatched.push('action_family');
        if(String(pattern.context?.contactKind||'unknown')===current.context.contactKind){score+=20;matched.push('contact_kind')}else mismatched.push('contact_kind');
        if(String(pattern.context?.financialState||'unknown')===current.context.financialState){score+=25;matched.push('financial_state')}else mismatched.push('financial_state');
        if(String(pattern.context?.engagementState||'unknown')===current.context.engagementState){score+=20;matched.push('engagement_state')}else mismatched.push('engagement_state');
        const sampleSize=Number(pattern.sampleSize||0);
        const evidenceLevel=String(pattern.evidenceLevel||'early');
        return{
          similarityScore:score,
          matchedDimensions:matched,
          mismatchedDimensions:mismatched,
          actionType:String(pattern.actionType||''),
          decision:String(pattern.decision||''),
          historicalContext:{
            contactKind:String(pattern.context?.contactKind||'unknown'),
            financialState:String(pattern.context?.financialState||'unknown'),
            engagementState:String(pattern.context?.engagementState||'unknown')
          },
          sampleSize,
          uniqueCustomers:Number(pattern.uniqueCustomers||0),
          outcomeCoveragePct:Number(pattern.outcomeCoveragePct||0),
          positiveDecisionPct:Number(pattern.positiveDecisionPct||0),
          negativeDecisionPct:Number(pattern.negativeDecisionPct||0),
          medianDaysToFirstOutcome:pattern.medianDaysToFirstOutcome===null?null:Number(pattern.medianDaysToFirstOutcome),
          evidenceLevel,
          interpretation:String(pattern.interpretation||''),
          mostObservedOutcomes:Array.isArray(pattern.mostObservedOutcomes)?pattern.mostObservedOutcomes:[],
          advisoryOnly:true,
          causalClaim:false
        };
      })
      .filter((item:any)=>item.similarityScore>=55&&item.sampleSize>=minSample)
      .sort((a:any,b:any)=>b.similarityScore-a.similarityScore||evidenceRank(b.evidenceLevel)-evidenceRank(a.evidenceLevel)||b.sampleSize-a.sampleSize||b.outcomeCoveragePct-a.outcomeCoveragePct)
      .slice(0,3);

    return{
      caseId:'relationship:'+current.contactId,
      contactId:current.contactId,
      name:current.name,
      relationshipStatus:current.relationshipStatus,
      reasons:current.reasons,
      currentContext:current.context,
      comparableHistoricalCases:matches,
      bestMatch:matches[0]||null,
      interpretation:matches.length
        ?'Foram encontrados contextos históricos semelhantes. Similaridade organiza evidências; não demonstra que repetir a decisão produzirá o mesmo resultado.'
        :'Ainda não há histórico contextual suficiente para uma comparação confiável.',
      safety:{advisoryOnly:true,humanReviewRequired:true,causalClaim:false,externalEffects:false}
    };
  });

  const withMatches=cases.filter(item=>item.bestMatch);
  return{
    generatedAt:new Date().toISOString(),
    cases,
    summary:{
      currentCases:cases.length,
      casesWithComparableHistory:withMatches.length,
      strongMatches:withMatches.filter(item=>Number(item.bestMatch?.similarityScore||0)>=80).length,
      contextualPatternsAvailable:patterns.length
    },
    methodology:{
      similarityDimensions:{
        actionFamily:35,
        contactKind:20,
        financialState:25,
        engagementState:20
      },
      minimumSimilarityScore:55,
      historicalContextReconstructedAsOfDecision:true,
      currentContextUsesPresentRelationshipState:true,
      rankingOnly:true,
      causalClaims:false
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      automaticPolicyChange:false,
      automaticAutonomyChange:false,
      automaticDecisionChange:false,
      humanReviewRequired:true
    }
  };
}
