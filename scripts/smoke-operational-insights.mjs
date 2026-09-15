import {effectiveOperationalSignal,operationalSignalNarrative} from '../apps/api/dist/operational-signals.js';

const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
const signal=(id,day,scope,metrics)=>({id,source_product:'nexjud',signal_type:'activity.summary',period_start:`${day}T00:00:00.000Z`,period_end:`${day}T23:00:00.000Z`,metrics,dimensions:{window:'day',scope},created_at:`${day}T23:01:00.000Z`});

const memberSignals=[
  signal('a','2026-09-15','member',{strategicAnalyses:3,drafts:2,judgeSessions:1,agentRuns:4}),
  signal('b','2026-09-15','member',{strategicAnalyses:5,drafts:1,judgeSessions:2,agentRuns:6}),
  signal('old','2026-09-14','member',{strategicAnalyses:100,drafts:100,judgeSessions:100,agentRuns:100})
];
const aggregate=effectiveOperationalSignal(memberSignals,'activity.summary');
assert(aggregate?.dimensions?.scope==='team','member signals become anonymous team aggregate');
assert(Number(aggregate?.metrics?.strategicAnalyses)===8,'latest-day member analyses are summed');
assert(Number(aggregate?.metrics?.drafts)===3,'latest-day member drafts are summed');
assert(Number(aggregate?.metrics?.judgeSessions)===3,'latest-day member judge sessions are summed');
assert(Number(aggregate?.metrics?.agentRuns)===10,'latest-day member agent runs are summed');
assert(Number(aggregate?.metrics?.strategicAnalyses)!==108,'older day is not mixed into latest team aggregate');

const narrative=operationalSignalNarrative('legal',memberSignals);
assert(narrative.text.includes('8 análise(s) estratégica(s)'),'Copilot narrative uses team aggregate');
assert(narrative.text.includes('3 minuta(s)'),'Copilot narrative sums member drafts');

const official=signal('workspace','2026-09-15','workspace',{strategicAnalyses:20,drafts:7,judgeSessions:4,agentRuns:30});
const preferred=effectiveOperationalSignal([memberSignals[0],memberSignals[1],official],'activity.summary');
assert(preferred?.id==='workspace','official workspace aggregate takes precedence for the same latest day');
assert(Number(preferred?.metrics?.strategicAnalyses)===20,'workspace aggregate is not double counted with member aggregates');

console.log(JSON.stringify({ok:true,memberAggregation:true,latestDayOnly:true,workspacePrecedence:true,privacy:'aggregate_only'},null,2));
