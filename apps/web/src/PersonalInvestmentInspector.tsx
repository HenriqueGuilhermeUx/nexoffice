import {useState,type FormEvent} from 'react';
import {COVERED_INSTRUMENTS,NONCOVERED_INSTRUMENTS,evaluateFgcExposure,formatBrl,parsePositiveBrl,prepareBankFeeLetter,type Instrument} from './PersonalFinancialReview';

export default function PersonalInvestmentInspector(){
 const [institution,setInstitution]=useState('');
 const [instrument,setInstrument]=useState<Instrument>('CDB');
 const [balance,setBalance]=useState('');
 const [fgc,setFgc]=useState<ReturnType<typeof evaluateFgcExposure>|null>(null);
 const [product,setProduct]=useState('');
 const [fee,setFee]=useState('');
 const [yieldPct,setYieldPct]=useState('');
 const [draft,setDraft]=useState('');
 const [error,setError]=useState('');
 const [copied,setCopied]=useState(false);
 function checkFGC(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  try{setFgc(evaluateFgcExposure(instrument,parsePositiveBrl(balance)));}
  catch(err){setFgc(null);setError(err instanceof Error?err.message:'Valor inválido.');}
 }
 function writeLetter(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setCopied(false);
  try{setDraft(prepareBankFeeLetter({bank:institution,product,feePercent:fee,yieldCdiPercent:yieldPct}));}
  catch(err){setError(err instanceof Error?err.message:'Confira os dados informados.');}
 }
 async function copy(){
  if(!draft)return;
  try{await navigator.clipboard.writeText(draft);setCopied(true);}
  catch{setError('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.');}
 }
 return <div className="np-invest-inspector">
  <section className="np-panel">
   <span className="np-kicker">LÉO · CONCENTRAÇÃO DE RISCO</span>
   <h2>Estou acima do limite ordinário do FGC?</h2>
   <p>Informe o valor total de instrumentos possivelmente cobertos no <strong>mesmo conglomerado emissor</strong>. Esta é uma análise didática com valores declarados, não uma conexão com o banco.</p>
   <form onSubmit={checkFGC} className="np-invest-form">
    <label>Instituição / conglomerado informado<input value={institution} onChange={e=>{setInstitution(e.target.value);setFgc(null);}} maxLength={80} placeholder="Ex.: Banco de exemplo" required/></label>
    <label>Tipo de investimento<select value={instrument} onChange={e=>{setInstrument(e.target.value as Instrument);setFgc(null);}}>
     {[...COVERED_INSTRUMENTS,...NONCOVERED_INSTRUMENTS].map(item=><option key={item}>{item}</option>)}</select></label>
    <label>Exposição que você informou (R$)<input value={balance} onChange={e=>{setBalance(e.target.value);setFgc(null);}} placeholder="Ex.: 280.000,00" inputMode="decimal" required/></label>
    <button className="np-primary" type="submit">Calcular alerta ilustrativo</button>
   </form>
   {fgc&&<div className="np-invest-result" role="status">
     <strong>{fgc.aboveOrdinaryLimit?'Atenção: exposição declarada acima de R$ 250 mil':fgc.candidate?'Exposição declarada até R$ 250 mil':'Produto sem cobertura ordinária do FGC'}</strong>
     {fgc.aboveOrdinaryLimit&&<p>O valor que <em>poderia</em> exceder o limite individual ordinário, sob as hipóteses da simulação, é <strong>{formatBrl(fgc.excessMinor)}</strong>.</p>}
     <p>{fgc.note}</p>
     <small>Limite ordinário geral FGC: R$ 250 mil por CPF/CNPJ e instituição/conglomerado; há limite agregado de R$ 1 milhão em 4 anos. Não deduzir cobertura real desta simulação.</small>
   </div>}
   <p className="np-invest-legal">Fonte: <a href="https://www.fgc.org.br/sobre-garantia-fgc" target="_blank" rel="noopener noreferrer">Regras oficiais do FGC</a>. Verifique titularidade, produto, emissor e saldos atualizados.</p>
  </section>
  <section className="np-panel">
   <span className="np-kicker">LÉO · CUSTOS E NEGOCIAÇÃO</span>
   <h2>Questione taxas e peça alternativas ao banco</h2>
   <p>O modelo gera um pedido documentado de esclarecimentos, sem inventar produtos mais rentáveis. Uma rentabilidade de fundo divulgada já pode estar líquida de taxas: não as subtraia novamente.</p>
   <form onSubmit={writeLetter} className="np-invest-form">
    <label>Nome do produto<input value={product} onChange={e=>setProduct(e.target.value)} maxLength={120} placeholder="Ex.: Fundo Renda Fixa X" required/></label>
    <label>Taxa de administração informada ao ano (%)<input value={fee} onChange={e=>setFee(e.target.value)} inputMode="decimal" placeholder="Ex.: 3" required/></label>
    <label>Rentabilidade informada (% do CDI)<input value={yieldPct} onChange={e=>setYieldPct(e.target.value)} inputMode="decimal" placeholder="Ex.: 90" required/></label>
    <button className="np-primary" type="submit">Preparar e-mail de negociação</button>
   </form>
   {draft&&<div className="np-invest-draft">
    <div className="np-invest-draft-head"><strong>Texto pronto para você revisar</strong><button className="np-studio-secondary" type="button" onClick={()=>void copy()}>{copied?'Copiado':'Copiar texto'}</button></div>
    <textarea readOnly value={draft} rows={16} aria-label="Texto de solicitação ao banco"/>
    <small>Nenhuma mensagem foi enviada. O usuário escolhe o destinatário e confirma o envio externamente.</small>
   </div>}
  </section>
  {error&&<p role="alert" className="np-error">{error}</p>}
  <p className="np-invest-legal">Análise educacional baseada em valores digitados. Não acessa contas, realiza investimentos nem constitui consultoria individualizada.</p>
 </div>;
}
