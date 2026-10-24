import {useState,type FormEvent} from 'react';
import {compareUserQuotes,displayBrl,parseBrlInput,FUTURE_MARKETPLACE_CAPABILITIES,type UserQuote} from './PersonalMarketplaceEngine';
import './nex-personal-marketplace.css';

type FormQuote={label:string;principal:string;upfront:string;installment:string;installments:string;fees:string};
const defaultA:FormQuote={label:'Proposta A',principal:'',upfront:'',installment:'',installments:'12',fees:''};
const defaultB:FormQuote={label:'Proposta B',principal:'',upfront:'',installment:'',installments:'12',fees:''};
function toQuote(q:FormQuote):UserQuote{
 const installments=Number(q.installments);
 if(!Number.isInteger(installments)||installments<1||installments>360)throw Error('Escolha de 1 a 360 parcelas.');
 return {label:q.label,principalMinor:parseBrlInput(q.principal),upfrontMinor:q.upfront.trim()?parseBrlInput(q.upfront,true):'0',
  installmentMinor:parseBrlInput(q.installment),installments,extraFeesMinor:q.fees.trim()?parseBrlInput(q.fees,true):'0'};
}
export default function PersonalMarketplaceLab(){
 const [a,setA]=useState<FormQuote>(defaultA),[b,setB]=useState<FormQuote>(defaultB);
 const [result,setResult]=useState<ReturnType<typeof compareUserQuotes>|null>(null);
 const [error,setError]=useState('');
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');
  try{setResult(compareUserQuotes(toQuote(a),toQuote(b)));}
  catch(err){setResult(null);setError(err instanceof Error?err.message:'Valores inválidos.');}
 }
 function field(q:FormQuote,change:(v:FormQuote)=>void,key:keyof FormQuote,label:string,placeholder:string){
  return <label key={key}>{label}<input aria-label={q.label+' · '+label} type={key==='installments'?'number':'text'}
   inputMode={key==='installments'?'numeric':'decimal'} min={key==='installments'?1:undefined} max={key==='installments'?360:undefined}
   maxLength={key==='installments'?undefined:25} value={q[key]} placeholder={placeholder}
   onChange={e=>{change({...q,[key]:e.target.value});setResult(null);}} required={key==='principal'||key==='installment'||key==='installments'}/></label>;
 }
 const form=(q:FormQuote,change:(v:FormQuote)=>void)=>(
  <div className="np-market-quote" key={q.label}>
   <h4>{q.label}</h4>
   <p>Preencha números de uma proposta que você recebeu. Use ponto apenas para milhares e vírgula para centavos (ex.: 2.500 = R$ 2.500,00; 2.500,50 = R$ 2.500,50). Não solicitamos seus documentos ou dados bancários.</p>
   {field(q,change,'principal','Preço/valor de referência (R$)','Ex.: 20.000,00')}
   {field(q,change,'upfront','Entrada (R$)','Ex.: 2.000,00')}
   {field(q,change,'installments','Número de parcelas','Ex.: 12')}
   {field(q,change,'installment','Valor de cada parcela (R$)','Ex.: 1.800,00')}
   {field(q,change,'fees','Custos extras informados (R$)','Ex.: 350,00')}
  </div>);
 return <div className="np-market-lab">
  <section className="np-panel">
   <span className="np-kicker">NOAH · OPORTUNIDADES COM LIBERDADE</span>
   <h2>Compare antes de decidir.</h2>
   <p>O Nex Personal está preparando a distribuição de crédito, investimentos, seguros e serviços de parceiros. <strong>Ainda não há ofertas integradas ou pré-aprovadas.</strong> Enquanto isso, você pode comparar os valores de duas propostas que já possui, no próprio navegador.</p>
   <div className="np-market-privacy"><strong>Privacidade primeiro.</strong> Valores digitados nesta comparação permanecem na aba; não são enviados à API, parceiros, publicidade ou bancos. Não há consulta de CPF, anúncio dirigido ou pedido de crédito.</div>
   <form onSubmit={submit}>
    <div className="np-market-quotes">{form(a,setA)}{form(b,setB)}</div>
    <button type="submit" className="np-primary">Comparar custos informados</button>
   </form>
   {error&&<p role="alert" className="np-error">{error}</p>}
   {result&&<div role="status" className="np-market-result">
    <h3>Comparação nominal — valores declarados</h3>
    <div className="np-market-totals">
     {result.quotes.map((q,i)=><div key={i}><small>{q.label}</small><strong>{displayBrl(q.totalMinor)}</strong><span>Entrada + parcelas + extras informados</span></div>)}
    </div>
    {result.comparable
      ?<p>{result.cheapest==='tie'?'As propostas têm o mesmo total nominal informado.':
      'A proposta '+(result.cheapest==='a'?result.quotes[0].label:result.quotes[1].label)+' tem total nominal menor em '+displayBrl(result.differenceMinor||0n)+'.'} Isso não estabelece qual crédito é melhor.</p>
      :<p>Os valores de referência ou os prazos são diferentes. Para evitar uma comparação enganosa, não apontamos uma vencedora.</p>}
    <ul>{result.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>
   </div>}
  </section>
  <section className="np-panel">
   <span className="np-kicker">FUTUROS SERVIÇOS E PARCEIROS</span>
   <h2>Uma escolha clara, com várias possibilidades.</h2>
   <p>As integrações abaixo são projetos de distribuição, e não produtos financeiros disponíveis ou autorizados neste ambiente.</p>
   <div className="np-market-capabilities">
    {FUTURE_MARKETPLACE_CAPABILITIES.map(item=><div key={item.id}><strong>{item.label}</strong>
     <small>{item.role} · {item.status==='disabled'?'Sem publicidade ativa':'Sem parceiro conectado'}</small></div>)}
   </div>
   <p className="np-market-legal">Futuras propostas reais deverão informar nome do fornecedor, condições, CET (quando aplicável), prazo, riscos, fonte, validade e remuneração/comissão recebida pela plataforma. Conteúdo patrocinado será identificado e separado do comparador imparcial. Sem publicidade baseada em transações por padrão.</p>
  </section>
 </div>;
}
