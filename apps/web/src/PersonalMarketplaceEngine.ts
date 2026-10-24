/**
 * Financial product distribution preview. Deterministic, local and independent
 * of commissions. This is not an APR/CET calculation, lender offer or approval.
 */
export type UserQuote={
  label:string;principalMinor:string;upfrontMinor:string;
  installmentMinor:string;installments:number;extraFeesMinor:string;
};
export type QuoteEvaluation={
  label:string;principalMinor:bigint;upfrontMinor:bigint;
  installments:number;installmentMinor:bigint;extraFeesMinor:bigint;
  totalMinor:bigint;nominalCostMinor:bigint;
};
const limit=10n**13n; // user-input cap for preview; currency BRL cents
function cents(raw:string,allowZero=false):bigint{
 if(!/^\d{1,13}$/.test(raw))throw Error('Valores devem ser informados em centavos inteiros.');
 const value=BigInt(raw);
 if(value>limit||(!allowZero&&value===0n))throw Error('Valor inexistente ou fora do limite de comparação.');
 return value;
}
export function parseBrlInput(value:string,allowZero=false):string{
 const clean=value.replace(/^\s*R\$\s*/i,'').trim().replace(/\s/g,'');
 // pt-BR uses dot for thousands and comma for decimals. A lone dot cannot
 // silently be treated as a decimal separator: 2.500 means R$ 2.500,00.
 const parts=clean.split(',');
 if(parts.length>2)throw Error('Use vírgula para centavos e ponto apenas para milhares (ex.: 1.250,50).');
 const whole=parts[0];
 if(!/^\d{1,10}$/.test(whole)&&!/^\d{1,3}(?:\.\d{3})+$/.test(whole))
  throw Error('Informe um valor como 1.250,00; para centavos use vírgula.');
 const fraction=parts.length===2?parts[1]:'';
 if(parts.length===2&&!/^\d{1,2}$/.test(fraction))
  throw Error('Informe um ou dois dígitos após a vírgula.');
 const minor=BigInt(whole.replace(/\./g,''))*100n+BigInt((fraction+'00').slice(0,2));
 if(minor>limit||(!allowZero&&minor===0n))throw Error('Informe um valor válido para simulação.');
 return String(minor);
}
export function displayBrl(value:bigint):string{
 const abs=value<0n?-value:value;
 return (value<0n?'-':'')+'R$ '+(abs/100n).toLocaleString('pt-BR')+','+String(abs%100n).padStart(2,'0');
}
export function evaluateQuote(input:UserQuote):QuoteEvaluation{
 if(!input.label.trim()||input.label.length>65)throw Error('Dê um nome curto à proposta.');
 const principal=cents(input.principalMinor),upfront=cents(input.upfrontMinor,true);
 const each=cents(input.installmentMinor),fees=cents(input.extraFeesMinor,true);
 if(!Number.isSafeInteger(input.installments)||input.installments<1||input.installments>360)throw Error('Número de parcelas inválido.');
 const total=upfront+each*BigInt(input.installments)+fees;
 if(total>limit)throw Error('Total supera o limite do simulador.');
 return {label:input.label.trim(),principalMinor:principal,upfrontMinor:upfront,
  installments:input.installments,installmentMinor:each,extraFeesMinor:fees,
  totalMinor:total,nominalCostMinor:total-principal};
}
export function compareUserQuotes(a:UserQuote,b:UserQuote){
 const first=evaluateQuote(a),second=evaluateQuote(b);
 const comparable=first.principalMinor===second.principalMinor&&first.installments===second.installments;
 const cheapest=comparable?(first.totalMinor===second.totalMinor?'tie':first.totalMinor<second.totalMinor?'a':'b'):null;
 return {quotes:[first,second],comparable,cheapest,
  differenceMinor:comparable?(first.totalMinor>second.totalMinor?first.totalMinor-second.totalMinor:second.totalMinor-first.totalMinor):null,
  notes:[
   'Propostas digitadas pelo próprio usuário, não verificadas por instituições financeiras.',
   'O total inclui somente entrada, parcelas e encargos adicionais informados. Não inclui cobranças desconhecidas, seguros obrigatórios não declarados ou custos futuros.',
   'O cálculo NÃO é o Custo Efetivo Total (CET), nem uma aprovação ou recomendação de crédito.',
   comparable?'Mesmo principal e mesmo número de parcelas: comparação nominal possível.':'Valores financiados ou prazos diferentes: não classificamos uma proposta como melhor.',
   'Nenhuma proposta foi enviada, contratada, compartilhada com parceiro ou usada para anúncios.'
  ],revenueFromCommissions:false,partnerConnected:false,userDataShared:false,externalEffect:false};
}
/**
 * Future partner-feed contract only. NO source calls or runtime partner offers.
 * Payout and sponsorship must NEVER be ranking criteria.
 */
export type ContractedCreditOffer={
 id:string;providerName:string;
 principalMinor:string;termMonths:number;totalPayableMinor:string;
 cetAnnualBps:number;platformCommissionMinor:string;
 sponsored:boolean;sourceVerified:boolean;validUntil:string
};
export function assessVerifiedCreditOffers(
 offers:ContractedCreditOffer[],comparison:{principalMinor:string;termMonths:number},asOf:string
){
 if(offers.length>50)throw Error('Catálogo excede o limite da comparação.');
 const principal=cents(comparison.principalMinor);
 if(!Number.isSafeInteger(comparison.termMonths)||comparison.termMonths<1||comparison.termMonths>360)
  throw Error('Prazo de comparação inválido.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||Number.isNaN(Date.parse(asOf))||
   new Date(asOf).toISOString().slice(0,10)!==asOf)throw Error('Data da comparação inválida.');
 const skipped:string[]=[];
 const accepted:Array<{offer:ContractedCreditOffer;cost:bigint}>=[];
 const ids=new Set<string>();
 for(const offer of offers){
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(offer.id)||ids.has(offer.id))
   throw Error('Identificador de proposta inválido ou repetido.');
  ids.add(offer.id);
  if(!offer.sourceVerified||offer.validUntil<asOf||!offer.providerName.trim()||offer.providerName.length>100){
   skipped.push(offer.id);continue;
  }
  if(offer.principalMinor!==comparison.principalMinor||offer.termMonths!==comparison.termMonths){
   skipped.push(offer.id);continue;
  }
  if(!Number.isSafeInteger(offer.cetAnnualBps)||offer.cetAnnualBps<0||offer.cetAnnualBps>1000000){
   skipped.push(offer.id);continue;
  }
  const cost=cents(offer.totalPayableMinor),commission=cents(offer.platformCommissionMinor,true);
  if(cost<principal||commission>cost){skipped.push(offer.id);continue;}
  accepted.push({offer,cost});
 }
 const sortNeutral=(a:{offer:ContractedCreditOffer;cost:bigint},b:{offer:ContractedCreditOffer;cost:bigint})=>
  a.cost===b.cost?a.offer.cetAnnualBps-b.offer.cetAnnualBps||a.offer.id.localeCompare(b.offer.id):
   a.cost<b.cost?-1:1;
 const organic=accepted.filter(x=>!x.offer.sponsored).sort(sortNeutral);
 const sponsored=accepted.filter(x=>x.offer.sponsored).sort(sortNeutral);
 return {
  organic:organic.map(x=>x.offer),
  sponsored:sponsored.map(x=>x.offer),
  skipped,
  rankingBasis:'total_payable_then_cet_for_equal_principal_and_term',
  commissionsUsedInRanking:false,externalEffect:false,
  disclosure:'Propostas precisam ter fonte verificável, CET e validade. Patrocínios são mostrados à parte, sem alterar a ordenação neutra.'
 };
}

export const FUTURE_MARKETPLACE_CAPABILITIES=[
 {id:'credit',label:'Crédito e financiamento',role:'Correspondente/parceiro autorizado',status:'not_connected'},
 {id:'investment',label:'Investimentos',role:'Intermediário/distribuidor autorizado',status:'not_connected'},
 {id:'insurance',label:'Seguros e proteção',role:'Corretora/habilitado',status:'not_connected'},
 {id:'commerce',label:'Compras e viagens',role:'Lojas, plataformas e operadores',status:'not_connected'},
 {id:'pix',label:'Pix e pagamentos',role:'ITP/participante habilitado',status:'not_connected'},
 {id:'media',label:'Benefícios e ofertas',role:'Mídia separada, opt-in e identificada',status:'disabled'}
] as const;
