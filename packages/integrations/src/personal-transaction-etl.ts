/**
 * Nex Personal transaction enrichment, v1 (deterministic, non-custodial).
 * Converts consented bank feeds and explicitly supplied EVM transfers into a
 * comparable *classification* contract, NOT a fiat valuation or account ledger.
 * Never connects providers, fetches wallets, exposes data to an AI model,
 * changes a customer balance or posts payments.
 */
import {createHash} from 'node:crypto';

export type TransactionSource='csv'|'open_finance'|'onchain';
export type PersonalCategory=
 'Alimentação'|'Restaurantes'|'Transporte'|'Assinaturas'|'Saúde'|'Moradia'|
 'Educação'|'Compras'|'Impostos'|'Renda'|'Taxas'|'Investimentos'|
 'Transferências'|'Cripto'|'Outros';
export type Treatment='expense'|'income'|'excluded_internal'|'review';
export type Confidence='high'|'medium'|'low';
export type NormalizedTransaction={
 source:TransactionSource;
 displayDescription:string;category:PersonalCategory;treatment:Treatment;
 confidence:Confidence;reason:string;requiresReview:boolean;
 fingerprint:string;strongReference:boolean;
 provenance:'imported_unverified'|'consented_feed_unverified'|'wallet_transfer_unverified';
 amount:string;unit:string;fractionDigits:number;
 direction:'in'|'out'|'self'|'unknown';
 assetVerified:false;externalEffect:false;
 metadata:{date?:string;chainId?:number;confirmed?:boolean;symbol?:string;transactionKind?:string};
};
export type BankInput={
 source:'csv'|'open_finance';accountRef:string;date:string;description:string;
 amountMinor:string;currency:'BRL';reference?:string;
 merchantName?:string;providerCategory?:string;selfTransferConfirmed?:boolean
};
export type EvmInput={
 source:'onchain';chainId:number;walletAddress:string;from:string;to:string;
 txHash:string;logIndex:number;contractAddress?:string;symbol:string;
 amountAtomic:string;decimals:number;status:'confirmed'|'pending'|'reverted';
 action?:'transfer'|'swap'|'bridge'|'reward'|'gas';
 // Explicitly user-confirmed own wallets, not inferred from matching addresses.
 confirmedOwnWallets?:string[];
};
const digest=(input:string)=>createHash('sha256').update(input).digest('hex');
const normalizeSearch=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clampText=(s:string,max:number)=>s.trim().replace(/\s+/g,' ').slice(0,max);
const categoryRules:Array<[PersonalCategory,RegExp]>=[
 ['Alimentação',/supermerc|mercado|hortifruti|padaria|atacad|mercearia/],
 ['Restaurantes',/ifood|restaurante|lanchonete|pizzaria|delivery|cafeteria/],
 ['Transporte',/uber|99pop|combustivel|posto de gasolina|metro|onibus|pedagio|estacionamento/],
 ['Assinaturas',/netflix|spotify|prime video|assinatura|youtube premium|streaming/],
 ['Saúde',/farmacia|hospital|clinica|laboratorio|consulta medica/],
 ['Moradia',/energia|enel|sabesp|condominio|internet residencial|aluguel|saneamento/],
 ['Educação',/escola|faculdade|universidade|curso|mensalidade escolar/],
 ['Impostos',/iptu|ipva|imposto|receita federal|dar f|tributo/],
 ['Taxas',/tarifa bancaria|anuidade|taxa de manutencao|encargos financeiros/],
 ['Investimentos',/aplicacao cdb|resgate cdb|tesouro direto|compra usdc|compra btc|investimento/]
];
const providerCategories:Record<string,PersonalCategory>={
 'bills & utilities':'Moradia','credits & loans':'Outros','deposits':'Outros',
 'fees & charges':'Taxas','food & groceries':'Alimentação',
 'home & life':'Moradia','income & payments':'Renda',
 'insurance':'Outros','investments & savings':'Investimentos',
 'online platforms & leisure':'Assinaturas','personal shopping':'Compras',
 'taxes':'Impostos','transfers':'Transferências',
 'transport & travel':'Transporte','withdrawal & atm':'Transferências'
};
export function cleanTransactionDescription(raw:string){
 const s=clampText(raw,160);
 // Mask identifiers even in a purely visual preview. Does not change upstream/raw logs.
 return s
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[e-mail]')
  .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[documento]')
  .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,'[documento]')
  .replace(/\b(?:\d[ -]?){13,19}\b/g,'[cartão]')
  .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi,'[hash]')
  .replace(/\s+/g,' ').trim()||'Movimentação';
}
function validDate(s:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)
   throw new Error('Data inválida.');
}
function positiveInt(s:string,maxDigits=32){
 if(!new RegExp('^\\d{1,'+maxDigits+'}$').test(s))throw new Error('Quantidade atômica inválida.');
 return BigInt(s);
}
function byText(description:string,merchant:string){
 const text=normalizeSearch(description+' '+merchant);
 for(const [category,regex] of categoryRules)if(regex.test(text))return category;
 return null;
}
export function enrichBankTransaction(input:BankInput):NormalizedTransaction{
 if(input.source!=='csv'&&input.source!=='open_finance')throw new Error('Origem bancária inválida.');
 if(!input.accountRef||input.accountRef.length>120)throw new Error('Conta não identificada.');
 validDate(input.date);
 if(input.currency!=='BRL'||!/^-?\d{1,13}$/.test(input.amountMinor)||BigInt(input.amountMinor)===0n)
  throw new Error('Valor BRL inválido.');
 if(input.description.length<2||input.description.length>500)throw new Error('Descrição inválida.');
 const sign=BigInt(input.amountMinor)>0n?'in':'out';
 const clean=cleanTransactionDescription(input.merchantName||input.description);
 const search=normalizeSearch(input.description);
 let category:PersonalCategory='Outros',treatment:Treatment=sign==='in'?'review':'expense';
 let confidence:Confidence='low',reason='Sem indícios suficientes de categoria; revise antes de usar em decisões.';
 const mapped=providerCategories[normalizeSearch(input.providerCategory||'')];
 const rule=byText(input.description,input.merchantName||'');
 const looksLikeTransfer=/(?:\bpix\b|\bted\b|\btransferencia\b|\bdoc\b|saque|resgate|deposito)/.test(search);
 const looksLikeInvestment=rule==='Investimentos';
 if(input.selfTransferConfirmed===true){
  category='Transferências';treatment='excluded_internal';confidence='high';
  reason='Transferência entre contas próprias confirmada pelo usuário; não é renda nem despesa.';
 }else if(looksLikeInvestment){
  category='Investimentos';treatment='review';confidence='medium';
  reason='Movimentação de investimento não equivale automaticamente a receita ou consumo.';
 }else if(looksLikeTransfer||mapped==='Transferências'){
  category='Transferências';treatment='review';confidence='low';
  reason='Transferência identificada, mas titularidade e finalidade não confirmadas.';
 }else if(rule){
  category=rule;confidence='medium';
  treatment=rule==='Taxas'&&sign==='out'?'expense':sign==='in'?'review':'expense';
  reason='Regra de descrição/comerciante; não é uma classificação bancária verificada.';
 }else if(mapped){
  category=mapped;confidence='medium';
  treatment=(mapped==='Investimentos'||mapped==='Renda'||sign==='in')?'review':'expense';
  reason='Categoria recebida do provedor, sem validação independente; sujeito a correção.';
 }else if(sign==='in'){
  treatment='review';reason='Crédito não significa necessariamente renda (pode ser reembolso ou transferência).';
 }
 // Stable identifiers are required for *automatic* deduplication: two equal card
 // purchases on the same day are not automatically duplicates.
 const strong=Boolean(input.reference&&input.reference.trim());
 const scope=input.source+'|'+input.accountRef+'|';
 const key=strong
  ?scope+'ref|'+input.reference!.trim()
  :scope+'weak|'+input.date+'|'+input.amountMinor+'|'+normalizeSearch(input.description);
 return {
  source:input.source,displayDescription:clean,category,treatment,confidence,reason,
  requiresReview:treatment==='review'||confidence==='low',
  fingerprint:digest(key),strongReference:strong,
  provenance:input.source==='csv'?'imported_unverified':'consented_feed_unverified',
  amount:input.amountMinor,unit:'BRL',fractionDigits:2,direction:sign,assetVerified:false,
  externalEffect:false,metadata:{date:input.date}
 };
}
const evmAddress=(v:string)=>/^0x[a-fA-F0-9]{40}$/.test(v);
export function enrichEvmTransfer(input:EvmInput):NormalizedTransaction{
 if(input.source!=='onchain'||!Number.isSafeInteger(input.chainId)||input.chainId<1
   ||input.chainId>1_000_000_000||!evmAddress(input.walletAddress)||!evmAddress(input.from)||!evmAddress(input.to))
   throw new Error('Rede ou endereços EVM inválidos.');
 if(!/^0x[a-fA-F0-9]{64}$/.test(input.txHash)||!Number.isInteger(input.logIndex)||input.logIndex<0||input.logIndex>1_000_000)
   throw new Error('Identificador de evento on-chain inválido.');
 if(!Number.isInteger(input.decimals)||input.decimals<0||input.decimals>36)
   throw new Error('Precisão do ativo inválida.');
 if(!/^[A-Za-z0-9._-]{2,20}$/.test(input.symbol)||!['confirmed','pending','reverted'].includes(input.status))
   throw new Error('Ativo ou estado inválido.');
 if(input.contractAddress&&!evmAddress(input.contractAddress))throw new Error('Contrato inválido.');
 const atomic=positiveInt(input.amountAtomic,78);
 if(atomic===0n)throw new Error('Transferência sem valor.');
 const wallet=input.walletAddress.toLowerCase();
 const from=input.from.toLowerCase(),to=input.to.toLowerCase();
 const own=new Set([wallet,...(input.confirmedOwnWallets||[]).filter(evmAddress).map(e=>e.toLowerCase())]);
 const fromOwn=own.has(from),toOwn=own.has(to);
 if(!fromOwn&&!toOwn)throw new Error('Movimento não associado à carteira informada.');
 const internal=fromOwn&&toOwn;
 const direction=internal?'self':fromOwn?'out':'in';
 const action=input.action||'transfer';
 if(!['transfer','swap','bridge','reward','gas'].includes(action))throw new Error('Tipo de evento inválido.');
 // A source's "swap/reward" tag is *not* tax, profit, actual classification or price evidence.
 let category:PersonalCategory=action==='gas'?'Taxas':action==='swap'||action==='reward'?'Investimentos':'Cripto';
 let treatment:Treatment=internal?'excluded_internal':'review';
 let confidence:Confidence=internal?'high':'low';
 let reason=internal?'Ambas as carteiras foram informadas como próprias; movimento não é receita/despesa.'
  :'Entrada/saída cripto não comprova compra, consumo, renda, custo de aquisição ou ganho.';
 if(action==='swap'||action==='bridge'){
  treatment='excluded_internal';confidence='medium';
  reason='Troca/ponte declarada: cada perna não deve ser tratada como gasto ou renda separadamente. Verifique taxas, resultado e valor de aquisição.';
 }
 if(action==='gas'&&direction==='out'&&input.status==='confirmed'){
  treatment='expense';confidence='medium';reason='Taxa da rede no próprio ativo, sem conversão presumida para BRL.';
 }
 if(input.status!=='confirmed'){
  treatment='review';confidence='low';reason='Movimento pendente ou revertido; não contabilizar como liquidado.';
 }
 const idKey='evm|'+input.chainId+'|'+input.txHash.toLowerCase()+'|'+input.logIndex+'|'+(input.contractAddress?.toLowerCase()||'native')+'|'+action;
 return {source:'onchain',displayDescription:action==='gas'?'Taxa de rede':'Atividade on-chain · '+input.symbol,
  category,treatment,confidence,reason,requiresReview:treatment==='review'||confidence==='low',
  fingerprint:digest(idKey),strongReference:true,provenance:'wallet_transfer_unverified',
  amount:input.amountAtomic,unit:input.symbol.toUpperCase(),fractionDigits:input.decimals,
  direction,assetVerified:false,externalEffect:false,
  metadata:{chainId:input.chainId,confirmed:input.status==='confirmed',symbol:input.symbol.toUpperCase(),transactionKind:action}
 };
}
export function previewEnrichment(items:Array<BankInput|EvmInput>){
 if(items.length>40)throw new Error('Limite de 40 movimentações na prévia.');
 const results=items.map(x=>x.source==='onchain'?enrichEvmTransfer(x):enrichBankTransaction(x));
 const occurrences=new Map<string,number>();
 for(const r of results)occurrences.set(r.fingerprint,(occurrences.get(r.fingerprint)||0)+1);
 return {
  items:results.map(r=>({...r,duplicateCandidate:r.strongReference&&(occurrences.get(r.fingerprint)||0)>1})),
  totals:{items:results.length,needsReview:results.filter(x=>x.requiresReview).length,
   excludedInternal:results.filter(x=>x.treatment==='excluded_internal').length,
   confident:results.filter(x=>x.confidence==='high').length},
  notes:['Nenhum valor on-chain é convertido para BRL sem cotação, data e fonte verificáveis.',
    'Referência fraca nunca elimina automaticamente lançamentos idênticos.',
    'Categorias são sugestões; correções do usuário devem prevalecer.',
    'Não houve consulta a bancos, blockchain, outros produtos nem movimentação financeira.'],
  persisted:false,providerConnected:false,externalEffect:false
 };
}
