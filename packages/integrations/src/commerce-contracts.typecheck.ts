import type {CommerceConnectorAdapter,CommerceOperationalSignalInput} from './commerce.js';

const valid:CommerceOperationalSignalInput={
  sourceProduct:'shopify',externalWorkspaceRef:'store-001',correlationId:'commerce-typecheck-001',periodStart:'2026-09-15T00:00:00-03:00',periodEnd:'2026-09-15T23:59:59-03:00',dimensions:{window:'day',scope:'workspace',channel:'store'},signalType:'orders.summary',metrics:{orders:2,grossRevenueMinor:20000,netRevenueMinor:19000,averageOrderValueMinor:10000,cancelled:0,refundedOrders:0,refundedMinor:0}
};
void valid;

// @ts-expect-error Commerce signals are workspace aggregates only.
const invalidScope:CommerceOperationalSignalInput={...valid,dimensions:{window:'day',scope:'team'}};
void invalidScope;

// @ts-expect-error Raw customer/order PII is deliberately outside the Commerce boundary.
const invalidPii:CommerceOperationalSignalInput={...valid,customerEmail:'private@example.com'};
void invalidPii;

const adapter:CommerceConnectorAdapter={
  source:'woocommerce',
  async collectOperationalSignals(window){return [{sourceProduct:'woocommerce',externalWorkspaceRef:window.externalWorkspaceRef,correlationId:`${window.correlationPrefix}-orders`,periodStart:window.periodStart,periodEnd:window.periodEnd,dimensions:{window:window.window,scope:'workspace',channel:window.channel},signalType:'orders.summary',metrics:{orders:0,grossRevenueMinor:0,netRevenueMinor:0,averageOrderValueMinor:0,cancelled:0,refundedOrders:0,refundedMinor:0}}]}
};
void adapter;
