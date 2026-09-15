export type CommerceProvider='shopify'|'woocommerce'|'nuvemshop'|'mercadolivre'|'manual-commerce';
export type CommerceExternalProvider=Exclude<CommerceProvider,'manual-commerce'>;
export type CommerceChannel='store'|'marketplace'|'social'|'other';
export type CommerceWindow='hour'|'day'|'week'|'month';

export interface CommerceCollectionWindow {
  externalWorkspaceRef:string;
  correlationPrefix:string;
  periodStart:string;
  periodEnd:string;
  window:CommerceWindow;
  channel?:CommerceChannel;
}

type CommerceSignalBase={
  sourceProduct:CommerceProvider;
  externalWorkspaceRef:string;
  correlationId?:string;
  periodStart:string;
  periodEnd:string;
  dimensions:{window:CommerceWindow;scope:'workspace';channel?:CommerceChannel};
};

export type CommerceOperationalSignalInput=CommerceSignalBase&(
  |{signalType:'orders.summary';metrics:{orders:number;grossRevenueMinor:number;netRevenueMinor:number;averageOrderValueMinor:number;cancelled:number;refundedOrders:number;refundedMinor:number}}
  |{signalType:'fulfillment.summary';metrics:{pending:number;shipped:number;delivered:number;delayed:number;returnsRequested:number}}
  |{signalType:'inventory.summary';metrics:{activeSkus:number;lowStockSkus:number;outOfStockSkus:number}}
  |{signalType:'customers.summary';metrics:{newCustomers:number;returningCustomers:number;abandonedCarts:number;recoveredCarts:number}}
  |{signalType:'support.summary';metrics:{open:number;overdue:number;resolved:number;avgFirstResponseMinutes:number}}
  |{signalType:'conversion.summary';metrics:{sessions:number;carts:number;checkouts:number;purchases:number;conversionRateBps:number}}
);

export interface CommerceConnectorAdapter {
  readonly source:CommerceExternalProvider;
  /**
   * Adapters may read their provider internally, but the NexOffice boundary receives
   * only aggregate operational signals. Raw orders, customer PII and addresses are
   * deliberately absent from this contract.
   */
  collectOperationalSignals(window:CommerceCollectionWindow):Promise<CommerceOperationalSignalInput[]>;
}

export interface CommerceSignalResult {
  ok:true;
  privacy:'aggregate_only';
  signal:{id:string;workspace_id:string;source_product:CommerceProvider;signal_type:string;period_start:string;period_end:string;metrics:Record<string,number>;dimensions:Record<string,string>;created_at:string};
  actionSync?:{created?:number;updated?:number;priorities?:number};
}

export class NexOfficeCommerceSignalClient {
  private readonly baseUrl:string;
  constructor(baseUrl:string,private readonly internalKey:string,private readonly timeoutMs=10000){
    this.baseUrl=baseUrl.replace(/\/$/,'');
    if(!this.baseUrl)throw new Error('NexOffice base URL is required');
    if(!this.internalKey)throw new Error('NexOffice internal key is required');
  }

  async push(signal:CommerceOperationalSignalInput):Promise<CommerceSignalResult>{
    return this.request('/v1/platform/commerce-signals',signal);
  }

  async pushMany(signals:CommerceOperationalSignalInput[]):Promise<CommerceSignalResult[]>{
    const results:CommerceSignalResult[]=[];
    for(const signal of signals)results.push(await this.push(signal));
    return results;
  }

  private async request(path:string,body:unknown):Promise<CommerceSignalResult>{
    const response=await fetch(`${this.baseUrl}${path}`,{
      method:'POST',
      headers:{accept:'application/json','content-type':'application/json','x-nexoffice-key':this.internalKey},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(this.timeoutMs)
    });
    const text=await response.text();
    const payload=(()=>{try{return JSON.parse(text)}catch{return {message:text.slice(0,2000)}}})();
    if(!response.ok){
      const error=new Error(String((payload as any)?.message||(payload as any)?.error||`NexOffice commerce HTTP ${response.status}`));
      (error as any).status=response.status;(error as any).code=(payload as any)?.error;(error as any).payload=payload;throw error;
    }
    return payload as CommerceSignalResult;
  }
}
