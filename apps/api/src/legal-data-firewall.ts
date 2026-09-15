import {z} from 'zod';

const Count=z.number().int().nonnegative().max(1_000_000_000);

const Base=z.object({
  sourceProduct:z.literal('nexjud'),
  externalWorkspaceRef:z.string().trim().min(1).max(220),
  correlationId:z.string().trim().min(8).max(220).optional(),
  periodStart:z.string().datetime({offset:true}),
  periodEnd:z.string().datetime({offset:true}),
  dimensions:z.object({
    window:z.enum(['hour','day','week','month']),
    scope:z.enum(['workspace','team','member']).default('workspace')
  }).strict()
}).strict();

const Matters=Base.extend({
  signalType:z.literal('matters.summary'),
  metrics:z.object({
    active:Count.default(0),
    opened:Count.default(0),
    closed:Count.default(0),
    attentionRequired:Count.default(0)
  }).strict()
});

const Deadlines=Base.extend({
  signalType:z.literal('deadlines.summary'),
  metrics:z.object({
    dueToday:Count.default(0),
    due7Days:Count.default(0),
    overdue:Count.default(0),
    completed:Count.default(0)
  }).strict()
});

const Activity=Base.extend({
  signalType:z.literal('activity.summary'),
  metrics:z.object({
    strategicAnalyses:Count.default(0),
    drafts:Count.default(0),
    judgeSessions:Count.default(0),
    agentRuns:Count.default(0)
  }).strict()
});

const Monitoring=Base.extend({
  signalType:z.literal('monitoring.summary'),
  metrics:z.object({
    monitoredCases:Count.default(0),
    newMovements:Count.default(0),
    unreviewedMovements:Count.default(0),
    alerts:Count.default(0)
  }).strict()
});

const Workload=Base.extend({
  signalType:z.literal('workload.summary'),
  metrics:z.object({
    activeMatters:Count.default(0),
    dueToday:Count.default(0),
    waitingReview:Count.default(0),
    backlog:Count.default(0)
  }).strict()
});

export const LegalOperationalSignal=z.discriminatedUnion('signalType',[
  Matters,
  Deadlines,
  Activity,
  Monitoring,
  Workload
]).superRefine((value,ctx)=>{
  if(new Date(value.periodEnd).getTime()<new Date(value.periodStart).getTime()){
    ctx.addIssue({code:'custom',message:'periodEnd must be greater than or equal to periodStart',path:['periodEnd']});
  }
});

export type LegalOperationalSignalInput=z.infer<typeof LegalOperationalSignal>;

export const LEGAL_SIGNAL_TYPES=[
  'matters.summary',
  'deadlines.summary',
  'activity.summary',
  'monitoring.summary',
  'workload.summary'
] as const;
