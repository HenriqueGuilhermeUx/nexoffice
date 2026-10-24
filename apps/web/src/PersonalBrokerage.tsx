import {useEffect,useState,type FormEvent} from 'react';
import './personal-brokerage.css';

/** Educational comparison is local to the browser. No partner lead, order or
 * personal financial information is sent by this component. */
type Category={id:string;label:string;focus:string};
type Brokerage={status:'preparation'|'open';distributionEnabled:boolean;recommendationEnabled:boolean;
 suitabilityVerified:boolean;partners:unknown[];products:unknown[];leadSubmissionEnabled:boolean;
 accountOpeningEnabled:boolean;orderExecutionEnabled:boolean;customerDataShared:boolean;
 commissionDisclosureRequired:true;categories:Category[];note:string};
type Draft={provider:string;product:string;family:string;minimum:string;fee:string;liquidity:string;risks:string};
const emptyDraft:Draft={provider:'',product:'',family:'',minimum:'',fee:'',liquidity:'',risks:''};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');

export default function PersonalBrokerage({token}:{token:string}){
 const [catalog,setCatalog]=useState<Brokerage|null>(null);
 const [error,setError]=useState('');
 const [left,setLeft]=useState<Draft>({...emptyDraft});
 const [right,setRight]=useState<Draft>({...emptyDraft});
 const [showComparison,setShowComparison]=useState(false);
 useEffect(()=>{
  const abort=new AbortController();
  setCatalog(null);setError('');setLeft({...emptyDraft});setRight({...emptyDraft});setShowComparison(false);
  void fetch(API+'/v1/personal/finsight/brokerage',{
   headers:{authorization:'Bearer '+token},signal:abort.signal
  }).then(async r=>{
   const payload=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error('Não foi possível verificar a vitrine de corretoras.');
   if(!abort.signal.aborted)setCatalog(payload as Brokerage);
  }).catch(()=>{if(!abort.signal.aborted)setError('Vitrine indisponível. Nenhuma oferta foi carregada.');});
  return ()=>abort.abort();
 },[token]);

 function draftField(value:Draft,set:(value:Draft)=>void,key:keyof Draft,label:string,placeholder:string){
  return <label key={key}>{label}
   <input value={value[key]} onChange={e=>{set({...value,[key]:e.target.value});setShowComparison(false);}}
    maxLength={key==='risks'?400:120} placeholder={placeholder}/>
  </label>;
 }
 function preview(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!left.provider.trim()||!right.provider.trim()||!left.product.trim()||!right.product.trim()){
   setError('Identifique a instituição e o produto nas duas propostas.');return;
  }
  setError('');setShowComparison(true);
 }
 const partnerLive=Boolean(catalog?.status==='open'&&catalog?.distributionEnabled===true&&catalog?.suitabilityVerified===true&&catalog.partners.length>0&&catalog.products.length>0);
 return <section className="np-panel np-studio-card" aria-label="Corretoras e produtos de investimento">
  <span className="np-kicker">F-INSIGHT · FUTURO MARKETPLACE DE INVESTIMENTOS</span>
  <h2>Corretoras & Produtos</h2>
  <p>A Nexa poderá reunir produtos de instituições parceiras, exibindo as condições e os riscos de cada alternativa. Por enquanto, explore os critérios e compare propostas que você já recebeu — sem encaminhar dados a nenhuma corretora.</p>
  {!partnerLive&&<p role="status" className="np-privacy-disclaimer"><strong>Parcerias em preparação.</strong> Ainda não temos ofertas contratáveis ou instituições parceiras habilitadas neste ambiente. Nenhum rendimento ou preço de demonstração aparece como real.</p>}
  {error&&<p className="np-error" role="alert">{error}</p>}
  <h3>O que considerar antes de escolher?</h3>
  <div className="np-studio-preview">
   {(catalog?.categories||[]).map(c=><div className="np-line" key={c.id}>
    <span><strong>{c.label}</strong><small>{c.focus}</small></span>
   </div>)}
   {!catalog&&!error&&<p>Consultando os módulos disponíveis…</p>}
  </div>
  <h3>Compare duas propostas que você já recebeu</h3>
  <p>Preencha as condições como foram informadas pela instituição. Nenhuma comparação representa recomendação ou verificação de preço, disponibilidade, proteção ou suitability.</p>
  <form onSubmit={preview} className="np-studio-form">
   <div className="np-life-columns">
    {[{draft:left,set:setLeft,title:'Proposta A'},{draft:right,set:setRight,title:'Proposta B'}].map(({draft,set,title})=>
     <div key={title} className="np-studio-preview">
      <h3>{title}</h3>
      {draftField(draft,set,'provider','Instituição / corretora','Nome da instituição')}
      {draftField(draft,set,'product','Produto','Ex.: título, fundo ou ETF')}
      {draftField(draft,set,'family','Categoria','Ex.: renda fixa')}
      {draftField(draft,set,'minimum','Aplicação mínima informada','Ex.: R$ 1.000,00')}
      {draftField(draft,set,'fee','Taxas e custos informados','Ex.: taxa de administração 0,5% a.a.')}
      {draftField(draft,set,'liquidity','Liquidez / prazo','Ex.: resgate D+1')}
      {draftField(draft,set,'risks','Riscos e observações','Ex.: carência, variação a mercado')}
     </div>)}
   </div>
   <button type="submit" className="np-primary">Comparar condições informadas</button>
   <button type="button" className="np-studio-secondary" onClick={()=>{
    setLeft({...emptyDraft});setRight({...emptyDraft});setShowComparison(false);setError('');
   }}>Limpar comparação</button>
  </form>
  {showComparison&&<div className="np-studio-preview" role="status">
   <h3>Quadro de comparação — dados declarados</h3>
   <div className="np-brokerage-table-scroll">
    <table className="np-brokerage-table">
     <caption>Comparação lado a lado das duas propostas informadas manualmente</caption>
     <thead><tr><th scope="col">Critério</th><th scope="col">Proposta A</th><th scope="col">Proposta B</th></tr></thead>
     <tbody>
      {([
       ['Instituição','provider'],['Produto','product'],['Categoria','family'],
       ['Aplicação mínima','minimum'],['Taxas','fee'],['Liquidez','liquidity'],['Riscos','risks']
      ] as Array<[string,keyof Draft]>).map(([label,key])=>
       <tr key={key}><th scope="row">{label}</th><td>{left[key]||'Não informado'}</td><td>{right[key]||'Não informado'}</td></tr>)}
     </tbody>
    </table>
   </div>
   <p><strong>Verifique no emissor e na corretora:</strong> documento oficial, tributação, garantias quando aplicáveis, liquidez real, custos totais e adequação ao seu perfil.</p>
   <p><small>A comparação acontece apenas nesta aba, não é salva, compartilhada ou enviada a parceiros. Sem pontuação ou escolha automática de vencedor.</small></p>
  </div>}
  <h3>Como funcionarão as parcerias?</h3>
  <p>Quando habilitadas, ofertas deverão identificar instituição emissora e distribuidora, data de atualização, custos, riscos, elegibilidade e eventual remuneração comercial da plataforma. A contratação permanecerá bloqueada até validação regulatória e integração autorizada.</p>
  <p><small>Futuros encaminhamentos dependerão de autorização separada e explícita. Não há indicação remunerada, abertura de conta ou execução disponível hoje.</small></p>
 </section>;
}
