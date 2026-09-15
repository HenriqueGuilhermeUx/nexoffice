import {z} from 'zod';

const Count=z.number().int().nonnegative().max(1_000_000_000);
const Duration=z.number().nonnegative().max(525_600);
const Ratio=z.number().nonnegative().max(1);

const Base=z.object({
  sourceProduct:z.enum(['mydatamed','health-wallet']),
  externalWorkspaceRef:z.string().trim().min(1).max(220),
  correlationId:z.string().trim().min(8).max(220).optional(),
  periodStart:z.string().datetime({offset:true}),
  periodEnd:z.string().datetime({offset:true}),
  dimensions:z.object({
    window:z.enum(['hour','day','week','month']),
    scope:z.enum(['workspace','team']).default('workspace')
  }).strict()
}).strict();

const Appointments=Base.extend({
  signalType:z.literal('appointments.summary'),
  metrics:z.object({
    scheduled:Count.default(0),
    completed:Count.default(0),
    cancelled:Count.default(0),
    noShow:Count.default(0),
    pending:Count.default(0)
  }).strict()
});

const Requests=Base.extend({
  signalType:z.literal('requests.summary'),
  metrics:z.object({
    open:Count.default(0),
    overdue:Count.default(0),
    escalated:Count.default(0),
    resolved:Count.default(0)
  }).strict()
});

const Sla=Base.extend({
  signalType:z.literal('sla.summary'),
  metrics:z.object({
    total:Count.default(0),
    withinSla:Count.default(0),
    breached:Count.default(0),
    avgFirstResponseMinutes:Duration.default(0),
    complianceRatio:Ratio.default(0)
  }).strict()
});

const Workload=Base.extend({
  signalType:z.literal('workload.summary'),
  metrics:z.object({
    activeCases:Count.default(0),
    waitingReview:Count.default(0),
    waitingPatientReply:Count.default(0),
    dueToday:Count.default(0)
  }).strict()
});

const Programs=Base.extend({
  signalType:z.literal('programs.summary'),
  metrics:z.object({
    enrolled:Count.default(0),
    active:Count.default(0),
    completed:Count.default(0),
    paused:Count.default(0)
  }).strict()
});

export const HealthOperationalSignal=z.discriminatedUnion('signalType',[
  Appointments,
  Requests,
  Sla,
  Workload,
  Programs
]).superRefine((value,ctx)=>{
  if(new Date(value.periodEnd).getTime()<new Date(value.periodStart).getTime()){
    ctx.addIssue({code:'custom',message:'periodEnd must be greater than or equal to periodStart',path:['periodEnd']});
  }
});

export type HealthOperationalSignalInput=z.infer<typeof HealthOperationalSignal>;

export const HEALTH_SIGNAL_TYPES=[
  'appointments.summary',
  'requests.summary',
  'sla.summary',
  'workload.summary',
  'programs.summary'
] as const;
