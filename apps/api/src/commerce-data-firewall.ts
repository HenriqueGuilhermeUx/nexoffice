import {z} from 'zod';

const Count=z.number().int().nonnegative().max(1_000_000_000);
const MoneyMinor=z.number().int().nonnegative().max(100_000_000_000_000);
const BasisPoints=z.number().int().min(0).max(10_000);
const Minutes=z.number().nonnegative().max(1_000_000);
const Source=z.enum(['shopify','woocommerce','nuvemshop','mercadolivre','manual-commerce']);

const Base=z.object({
  sourceProduct:Source,
  externalWorkspaceRef:z.string().trim().min(1).max(220),
  correlationId:z.string().trim().min(8).max(220).optional(),
  periodStart:z.string().datetime({offset:true}),
  periodEnd:z.string().datetime({offset:true}),
  dimensions:z.object({
    window:z.enum(['hour','day','week','month']),
    scope:z.literal('workspace').default('workspace'),
    channel:z.enum(['store','marketplace','social','other']).optional()
  }).strict()
}).strict();

const Orders=Base.extend({
  signalType:z.literal('orders.summary'),
  metrics:z.object({
    orders:Count.default(0),
    grossRevenueMinor:MoneyMinor.default(0),
    netRevenueMinor:MoneyMinor.default(0),
    averageOrderValueMinor:MoneyMinor.default(0),
    cancelled:Count.default(0),
    refundedOrders:Count.default(0),
    refundedMinor:MoneyMinor.default(0),
    costOfGoodsMinor:MoneyMinor.optional(),
    grossMarginBps:BasisPoints.optional()
  }).strict()
});

const Fulfillment=Base.extend({
  signalType:z.literal('fulfillment.summary'),
  metrics:z.object({
    pending:Count.default(0),
    shipped:Count.default(0),
    delivered:Count.default(0),
    delayed:Count.default(0),
    returnsRequested:Count.default(0)
  }).strict()
});

const Inventory=Base.extend({
  signalType:z.literal('inventory.summary'),
  metrics:z.object({
    activeSkus:Count.default(0),
    lowStockSkus:Count.default(0),
    outOfStockSkus:Count.default(0),
    slowMovingSkus:Count.optional(),
    deadStockSkus:Count.optional(),
    inventoryValueMinor:MoneyMinor.optional()
  }).strict()
});

const Customers=Base.extend({
  signalType:z.literal('customers.summary'),
  metrics:z.object({
    newCustomers:Count.default(0),
    returningCustomers:Count.default(0),
    abandonedCarts:Count.default(0),
    recoveredCarts:Count.default(0)
  }).strict()
});

const Support=Base.extend({
  signalType:z.literal('support.summary'),
  metrics:z.object({
    open:Count.default(0),
    overdue:Count.default(0),
    resolved:Count.default(0),
    avgFirstResponseMinutes:Minutes.default(0)
  }).strict()
});

const Conversion=Base.extend({
  signalType:z.literal('conversion.summary'),
  metrics:z.object({
    sessions:Count.default(0),
    carts:Count.default(0),
    checkouts:Count.default(0),
    purchases:Count.default(0),
    conversionRateBps:BasisPoints.default(0)
  }).strict()
});

export const CommerceOperationalSignal=z.discriminatedUnion('signalType',[Orders,Fulfillment,Inventory,Customers,Support,Conversion]).superRefine((value,ctx)=>{
  if(new Date(value.periodEnd).getTime()<new Date(value.periodStart).getTime())ctx.addIssue({code:'custom',message:'periodEnd must be greater than or equal to periodStart',path:['periodEnd']});
});

export type CommerceOperationalSignalInput=z.infer<typeof CommerceOperationalSignal>;
export const COMMERCE_SIGNAL_TYPES=['orders.summary','fulfillment.summary','inventory.summary','customers.summary','support.summary','conversion.summary'] as const;
export const COMMERCE_SOURCES=['shopify','woocommerce','nuvemshop','mercadolivre','manual-commerce'] as const;
