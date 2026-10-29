/**
 * Minimal F-Insight quote contract for the independent Nex Personal preview.
 * Source and timestamp are required; stale prices and demo/fallback values
 * must never appear as current. No currency is inferred from symbol alone.
 */
export type PersonalResearchQuote={
 value:number;source:'finnhub';observedAt:string;currency:'unspecified'
};
export function verifyFInsightQuote(input:unknown,symbol:string,now=Date.now()):PersonalResearchQuote|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const quote=input as Record<string,unknown>;
 if(quote.provider!=='finnhub'||typeof quote.symbol!=='string'||
    quote.symbol.trim().toUpperCase()!==symbol||
    typeof quote.price!=='number'||!Number.isFinite(quote.price)||quote.price<=0||
    typeof quote.timestamp!=='string')return null;
 const at=Date.parse(quote.timestamp);
 if(!Number.isFinite(at)||at>now+5*60_000||at<now-7*24*60*60_000)return null;
 return {value:quote.price,source:'finnhub',observedAt:quote.timestamp,currency:'unspecified'};
}
