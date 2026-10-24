/**
 * Nex Personal — conservative local recurring-expense detector.
 *
 * Inputs come ONLY from one authenticated owner's BRL, confirmed-as-expense
 * transactions. The caller must apply the owner filter at query time.
 * Pure analysis: no provider calls, cross-product joins, profiling for ads,
 * auto-cancellation or financial effects.
 */
export type ExpenseSample={
  bookedAt:string;
  description:string;
  category:string|null;
  amountMinor:string;
  analysisRole:'expense'|'income'|'excluded_internal'|'review'|null;
};
export type RecurringPattern={
  displayName:string;
  category:string;
  occurrences:number;
  monthlyAmountMinor:string;
  firstDate:string;
  latestDate:string;
  amountChangeMinor:string;
  increaseDetected:boolean;
  confidence:'medium';
  reason:string;
  externalEffect:false;
};
const excluded=/\b(pix|ted|doc|transferencia|saque|resgate|deposito|estorno|refund|cashback|cdb|usdc|btc|ethereum|ethereum|cripto|swap|bridge|token|carteira)\b/i;
const sensitive=/\b(clinica|clinico|hospital|farmacia|medico|psiquiatr|psicolog|laboratorio|terapia|aposta|bet|cassino|jogo|filho|crianca)\b/i;
const accent=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function dateOf(value:string){
 const parsed=value.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(parsed)||Number.isNaN(Date.parse(parsed))||new Date(parsed).toISOString().slice(0,10)!==parsed)
  return null;
 return parsed;
}
function identify(description:string,category:string|null){
 const normal=accent(description).replace(/\s+/g,' ').trim();
 if(normal.length<4||normal.length>300||excluded.test(normal)||sensitive.test(normal))return null;
 const c=accent(category||'');
 if(/saude|investimento|transferencia|renda|imposto|educacao/.test(c))return null;
 // Remove numeric references, account/card tails and calendar labels, but
 // do not erase merchant tokens. Never emit raw bank narratives as an identifier.
 let key=normal
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g,' ')
  .replace(/\b(?:\d[ -]?){4,}\b/g,' ')
  .replace(/\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:eiro|embro|ubro)?[\/-]?\d{0,4}\b/g,' ')
  .replace(/\b(?:pagamento|compra|cartao|credito|debito|parcela|assinatura|mensalidade|automatico|aut|via|ref|id)\b/g,' ')
  .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
 if(key.length<4||key.length>75)return null;
 // Description might be a personal name rather than a merchant: avoid
 // categorizing generic unrecognized transfers as recurrent services.
 const known=/(netflix|spotify|prime|youtube|streaming|assinatura|energia|sabesp|internet|telefone|condominio|aluguel|seguro|academia|tv|cloud|software|plano)/.test(normal);
 if(!known && c!=='assinaturas' && c!=='moradia')return null;
 // Mask labels: only a small normalized merchant reference is returned.
 const display=key.slice(0,42).replace(/\b\w/g,x=>x.toUpperCase());
 return {key,display};
}
function dayNumber(d:string){return Number(d.slice(8,10));}
function monthNumber(d:string){return Number(d.slice(0,4))*12+Number(d.slice(5,7));}
function formatAmount(input:string){
 if(!/^-?\d{1,13}$/.test(input))return null;
 const n=BigInt(input);
 return n<0n?-n:null;
}
export function detectRecurringExpenses(items:ExpenseSample[],asOfDate:string,limit=8){
 if(!dateOf(asOfDate)||asOfDate.length!==10)throw Error('Data de referência inválida.');
 if(!Number.isInteger(limit)||limit<1||limit>25)throw Error('Limite de resultados inválido.');
 const todayMonth=monthNumber(asOfDate);
 const group=new Map<string,Array<{date:string;amount:bigint;name:string;category:string}>>();
 for(const item of items.slice(0,2000)){
  if(item.analysisRole!=='expense')continue;
  const date=dateOf(item.bookedAt);
  const amount=formatAmount(item.amountMinor);
  const merchant=identify(item.description,item.category);
  if(!date||!amount||!merchant)continue;
  const month=monthNumber(date);
  if(month>todayMonth||month<todayMonth-13)continue;
  const list=group.get(merchant.key)||[];
  list.push({date,amount,name:merchant.display,category:item.category||'Outros'});
  group.set(merchant.key,list);
 }
 const detected:RecurringPattern[]=[];
 for(const [,rows] of group){
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  const monthly=new Map<number,typeof rows>();
  for(const row of rows){
   const key=monthNumber(row.date),bucket=monthly.get(key)||[];
   bucket.push(row);monthly.set(key,bucket);
  }
  // All months must contain a single charge for this merchant; otherwise
  // weekly purchases or duplicate feeds can masquerade as subscriptions.
  const months=[...monthly.keys()].sort((a,b)=>a-b);
  if(months.length<3||months.some(m=>monthly.get(m)!.length!==1))continue;
  const last=months.slice(-3);
  if(last[2]-last[1]!==1||last[1]-last[0]!==1)continue;
  const triple=last.map(m=>monthly.get(m)![0]);
  const low=triple.reduce((a,b)=>a.amount<b.amount?a:b).amount;
  const high=triple.reduce((a,b)=>a.amount>b.amount?a:b).amount;
  if(high*100n>low*120n)continue; // >20% variation is ambiguous.
  const days=triple.map(x=>dayNumber(x.date)),minDay=Math.min(...days),maxDay=Math.max(...days);
  if(maxDay-minDay>8)continue;
  const recent=triple[2],first=triple[0],difference=recent.amount-first.amount;
  const increase=difference>=500n&&difference*100n>=first.amount*10n;
  detected.push({
   displayName:recent.name,category:recent.category,
   occurrences:months.length,monthlyAmountMinor:String(recent.amount),
   firstDate:rows[0].date,latestDate:recent.date,
   amountChangeMinor:String(difference),increaseDetected:increase,
   confidence:'medium',
   reason:'Possível despesa mensal: três meses consecutivos com valores e datas semelhantes; confirme se é assinatura ou conta recorrente.',
   externalEffect:false
  });
 }
 detected.sort((a,b)=>Number(b.increaseDetected)-Number(a.increaseDetected)||
  b.latestDate.localeCompare(a.latestDate)||a.displayName.localeCompare(b.displayName));
 return {
  patterns:detected.slice(0,limit),
  candidateCount:detected.length,
  note:'Somente despesas BRL já classificadas. Recorrência sugerida, não verificada; não confirma contrato, preço futuro, cobrança duplicada ou economia possível.',
  marketingUsed:false,externalEffect:false,providerConnected:false
 };
}
