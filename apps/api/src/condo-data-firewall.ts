import {z} from 'zod';

const Count=z.number().int().nonnegative().max(1_000_000_000);
const Base=z.object({
  sourceProduct:z.literal('sindcopilot'),
  externalWorkspaceRef:z.string().trim().min(1).max(220),
  correlationId:z.string().trim().min(8).max(220).optional(),
  periodStart:z.string().datetime({offset:true}),
  periodEnd:z.string().datetime({offset:true}),
  dimensions:z.object({window:z.enum(['hour','day','week','month']),scope:z.enum(['workspace','team']).default('workspace')}).strict()
}).strict();

const Portfolio=Base.extend({
  signalType:z.literal('portfolio.summary'),
  metrics:z.object({totalCondominiums:Count.default(0),activeCondominiums:Count.default(0),activeAssistants:Count.default(0)}).strict()
});
const Compliance=Base.extend({
  signalType:z.literal('compliance.summary'),
  metrics:z.object({pending:Count.default(0),upcoming:Count.default(0),overdue:Count.default(0),completed:Count.default(0),alertsFailed:Count.default(0)}).strict()
});
const Documents=Base.extend({
  signalType:z.literal('documents.summary'),
  metrics:z.object({pendingReview:Count.default(0),ocrPending:Count.default(0),ocrFailed:Count.default(0),indexingPending:Count.default(0),indexingFailed:Count.default(0)}).strict()
});
const Notices=Base.extend({
  signalType:z.literal('notices.summary'),
  metrics:z.object({drafts:Count.default(0),sent:Count.default(0),cancelled:Count.default(0)}).strict()
});
const Suppliers=Base.extend({
  signalType:z.literal('suppliers.summary'),
  metrics:z.object({total:Count.default(0),rated:Count.default(0)}).strict()
});

export const CondoOperationalSignal=z.discriminatedUnion('signalType',[Portfolio,Compliance,Documents,Notices,Suppliers]).superRefine((value,ctx)=>{
  if(new Date(value.periodEnd).getTime()<new Date(value.periodStart).getTime())ctx.addIssue({code:'custom',message:'periodEnd must be greater than or equal to periodStart',path:['periodEnd']});
});

export type CondoOperationalSignalInput=z.infer<typeof CondoOperationalSignal>;
export const CONDO_SIGNAL_TYPES=['portfolio.summary','compliance.summary','documents.summary','notices.summary','suppliers.summary'] as const;
