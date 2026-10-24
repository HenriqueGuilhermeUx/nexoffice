// Pure, manually supplied educational checks; never claim verified bank balances or actual FGC eligibility.
export const COVERED_INSTRUMENTS=['CDB','RDB','LCI','LCA','Poupança'] as const;
export const NONCOVERED_INSTRUMENTS=['Fundo de investimento','Tesouro Direto','Ações / ETF','Outros'] as const;
export type Instrument=typeof COVERED_INSTRUMENTS[number]|typeof NONCOVERED_INSTRUMENTS[number];
const LIMIT=25_000_000n; // BRL cents (R$250.000)
export function formatBrl(minor:bigint){
 const absolute=minor<0n?-minor:minor;
 return (minor<0n?'-':'')+'R$ '+(absolute/100n).toLocaleString('pt-BR')+','+String(absolute%100n).padStart(2,'0');
}
export function parsePositiveBrl(text:string):bigint{
 const v=text.trim().replace(/R\$/gi,'').replace(/\s/g,'');
 const normalized=v.includes(',')?v.replace(/\./g,'').replace(',','.'):v;
 if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized))throw new Error('Informe valores como 280.000,00.');
 const [whole,cents='']=normalized.split('.');
 const value=BigInt(whole)*100n+BigInt((cents+'00').slice(0,2));
 if(value<=0n)throw new Error('Informe um saldo maior que zero.');
 return value;
}
export function evaluateFgcExposure(instrument:Instrument,exposureMinor:bigint){
 const candidate=(COVERED_INSTRUMENTS as readonly string[]).includes(instrument);
 const excess=candidate&&exposureMinor>LIMIT?exposureMinor-LIMIT:0n;
 return {
  candidate,excessMinor:excess,aboveOrdinaryLimit:candidate&&exposureMinor>LIMIT,
  status:candidate?(excess>0n?'potential_excess':'within_illustrative_limit'):'not_generally_covered',
  // Never represent partial data as an actual insured amount.
  verifiedEligibility:false,verifiedGroup:false,verifiedCoverage:false,
  note:candidate
   ?'Simulação apenas: posição e produto informados, sem confirmação do emissor, grupo econômico, elegibilidade, juros acumulados, conta conjunta ou limite global de 4 anos.'
   :'Esta categoria não possui, em regra, cobertura do FGC. Verifique o produto específico e a documentação.',
 };
}
export function prepareBankFeeLetter(args:{bank:string;product:string;feePercent:string;yieldCdiPercent:string}){
 const bank=args.bank.trim().slice(0,80);
 const product=args.product.trim().slice(0,120);
 if(!bank||!product)throw new Error('Informe instituição e nome do investimento.');
 const fee=Number(args.feePercent.replace(',','.')),yieldCdi=Number(args.yieldCdiPercent.replace(',','.'));
 if(!Number.isFinite(fee)||fee<0||fee>30||!Number.isFinite(yieldCdi)||yieldCdi<0||yieldCdi>500)
  throw new Error('Preencha percentuais válidos nos limites informados.');
 const f=fee.toLocaleString('pt-BR',{maximumFractionDigits:2});
 const y=yieldCdi.toLocaleString('pt-BR',{maximumFractionDigits:2});
 return 'Assunto: Pedido de esclarecimento sobre custos e alternativas do investimento '+product+'\n\n'+
 'Olá, equipe '+bank+',\n\n'+
 'Estou revisando os custos e resultados do investimento '+product+'. Segundo as informações que tenho, há referência a taxa anual de '+f+'% e rentabilidade de '+y+'% do CDI.\n\n'+
 'Poderiam confirmar por escrito:\n'+
 '1. As taxas de administração, gestão, distribuição e eventual performance aplicáveis e o efeito total sobre o resultado?\n'+
 '2. Se o percentual de retorno informado já é líquido dessas taxas e qual o período de referência?\n'+
 '3. O prazo, a liquidez, eventuais multas ou carências, o tratamento tributário e os riscos do produto?\n'+
 '4. Quais opções do próprio banco apresentam perfil de risco e liquidez comparáveis, com custos menores, e se há margem para renegociação?\n'+
 '5. Onde encontro o regulamento e a lâmina de informações mais recentes?\n\n'+
 'Quero comparar alternativas de forma informada antes de decidir. Agradeço resposta documentada com os custos efetivos e condições.\n\nObrigado.';
}
