import {useState,type FormEvent} from 'react';
import './nex-personal-agents.css';
import PersonalInvestmentInspector from './PersonalInvestmentInspector';

export type AgentId='expenses'|'financial'|'planning'|'investments'|'shopping'|'simulations'|'payments'|'contracts';
export const PERSONAL_AGENTS:ReadonlyArray<{
 id:AgentId;name:string;role:string;description:string;icon:string;prompt:string;status:'active'|'limited'
}>=[
 {id:'expenses',name:'Atlas',role:'Gastos',icon:'◔',status:'active',description:'Onde, quanto e por que você gasta.',prompt:'Analisar gastos e orçamentos'},
 {id:'financial',name:'Norte',role:'Análise financeira',icon:'▦',status:'active',description:'Receitas, despesas, saldos e patrimônio.',prompt:'Gerar diagnóstico financeiro'},
 {id:'planning',name:'Prisma',role:'Planejamento',icon:'◎',status:'active',description:'Metas, reserva e compromissos futuros.',prompt:'Revisar minhas metas'},
 {id:'investments',name:'Lume',role:'Investimentos',icon:'↗',status:'limited',description:'Organiza sua carteira declarada, sem cotações.',prompt:'Revisar meus investimentos'},
 {id:'shopping',name:'Faro',role:'Compras',icon:'◇',status:'active',description:'Impacto de compras e parcelamentos.',prompt:'Avaliar uma compra'},
 {id:'simulations',name:'Cenário',role:'Simulações',icon:'▤',status:'active',description:'Planeje valores ao longo do tempo.',prompt:'Simular meu cenário'},
 {id:'payments',name:'Fluxo',role:'Pagamentos',icon:'◷',status:'limited',description:'Agenda de contas, sem transferências reais.',prompt:'Revisar contas a vencer'},
 {id:'contracts',name:'Clara',role:'Contratos',icon:'≡',status:'limited',description:'Checklist preliminar de cláusulas contratuais.',prompt:'Examinar contrato'}
];
type AgentResult={
 agentId:AgentId;agentName:string;title:string;answer:string;facts:string[];sources:string[];
 limitation:string;verifiedBanking:false;modelCalled:false;externalEffect:false;canInitiatePayment:false;provenance:string
};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');
function parseBrl(raw:string):string|undefined{
 const cleaned=raw.trim().replace(/R\$/gi,'').replace(/\s/g,'');
 if(!cleaned)return undefined;
 const decimal=cleaned.includes(',')?cleaned.replace(/\./g,'').replace(',','.'):cleaned;
 if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(decimal))throw new Error('Informe um valor válido, como 850,00.');
 const [whole,cents='']=decimal.split('.');
 const minor=BigInt(whole)*100n+BigInt((cents+'00').slice(0,2));
 if(minor<=0n)throw new Error('O valor deve ser maior que zero.');
 return String(minor);
}
export default function NexPersonalAgents({token,initialAgent='expenses',onOpenSection}:{
 token:string;initialAgent?:AgentId;onOpenSection?:(section:'money'|'spending'|'planning'|'wealth')=>void
}){
 const [selected,setSelected]=useState<AgentId>(initialAgent);
 const [price,setPrice]=useState('');
 const [monthly,setMonthly]=useState('');
 const [installments,setInstallments]=useState('1');
 const [months,setMonths]=useState('12');
 const [contractText,setContractText]=useState('');
 const [result,setResult]=useState<AgentResult|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const agent=PERSONAL_AGENTS.find(a=>a.id===selected)!;
 async function analyze(event?:FormEvent<HTMLFormElement>){
  event?.preventDefault();setBusy(true);setError('');
  try{
   const amountMinor=(selected==='shopping'||selected==='simulations')?parseBrl(price):undefined;
   const monthlyMinor=selected==='simulations'?parseBrl(monthly):undefined;
   const payload={
    ...(amountMinor?{amountMinor}:{}),
    ...(monthlyMinor?{monthlyMinor}:{}),
    ...((selected==='shopping'||selected==='simulations')?{installments:Number(installments)}:{}),
    ...(selected==='simulations'?{months:Number(months)}:{}),
    ...(selected==='contracts'&&contractText.trim()?{contractText:contractText.trim()}:{} )
   };
   const response=await fetch(API+'/v1/personal/agents/'+selected+'/analyze',{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload)
   }).catch(()=>{throw new Error('Conexão indisponível. Tente novamente usando o endereço atual da homologação.');});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.message||'Não foi possível gerar a análise.');
   setResult(body as AgentResult);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao analisar.');setResult(null);}
  finally{setBusy(false);}
 }
 return <div className="np-agents">
  <section className="np-agents-intro">
   <span className="np-kicker">CENTRAL DE AGENTES · NEX PERSONAL</span>
   <h2>Sua equipe financeira pessoal.</h2>
   <p>A Maya coordena o trabalho; cada agente resolve uma necessidade. Nesta homologação, as análises são cálculos e verificações explicáveis, baseados nos dados que você informou.</p>
   <div className="np-agents-note"><strong>Maya · Coordenadora</strong><span>Escolha o especialista abaixo. Nenhum agente executa pagamentos, compras, investimentos ou assinaturas.</span></div>
  </section>
  <div className="np-agents-grid" aria-label="Especialistas disponíveis">
   {PERSONAL_AGENTS.map(item=><button type="button" key={item.id} className={'np-agent-tile '+(item.id===selected?'np-agent-selected':'')} aria-pressed={selected===item.id} onClick={()=>{setSelected(item.id);setError('');setResult(null);}}>
    <span className="np-agent-icon" aria-hidden="true">{item.icon}</span>
    <span className="np-agent-meta"><strong>{item.name}</strong><small>{item.role}</small></span>
    <span className="np-agent-desc">{item.description}</span>
    <span className="np-agent-status">{item.status==='limited'?'Análise inicial · sem integração':'Análise disponível'}</span>
   </button>)}
  </div>
  <section className="np-panel np-agent-workspace" aria-labelledby="np-agent-title">
   <div className="np-agent-heading"><div className="np-agent-icon np-agent-icon-big" aria-hidden="true">{agent.icon}</div><div>
    <span className="np-kicker">ESPECIALISTA · {agent.role.toUpperCase()}</span>
    <h2 id="np-agent-title">{agent.name}</h2><p>{agent.description}</p>
   </div></div>
   <form onSubmit={e=>void analyze(e)} className="np-agent-form">
    {(selected==='shopping'||selected==='simulations')&&<label>Valor da compra ou do cenário (R$)
      <input value={price} onChange={e=>setPrice(e.target.value)} inputMode="decimal" placeholder="Ex.: 1.250,00" maxLength={20}/>
    </label>}
    {selected==='simulations'&&<label>Valor a reservar por mês (R$)
      <input value={monthly} onChange={e=>setMonthly(e.target.value)} inputMode="decimal" placeholder="Ex.: 350,00" maxLength={20}/>
    </label>}
    {(selected==='shopping'||selected==='simulations')&&<label>Quantidade de parcelas
      <input type="number" min="1" max="120" step="1" value={installments} onChange={e=>setInstallments(e.target.value)} required/>
    </label>}
    {selected==='simulations'&&<label>Horizonte (meses)
      <input type="number" min="1" max="360" step="1" value={months} onChange={e=>setMonths(e.target.value)} required/>
    </label>}
    {selected==='contracts'&&<label className="np-agent-full">Cole um trecho do contrato para checklist
      <textarea value={contractText} maxLength={4000} rows={5} onChange={e=>setContractText(e.target.value)} placeholder="Cole apenas um trecho não sensível. O texto não é armazenado nem enviado a um serviço externo."/>
    </label>}
    <button className="np-primary" type="submit" disabled={busy}>{busy?'Analisando…':agent.prompt}</button>
   </form>
   {error&&<p role="alert" className="np-error">{error}</p>}
   {result&&<div className="np-agent-result" role="status">
    <div className="np-agent-result-top"><span className="np-kicker">DIAGNÓSTICO · {result.agentName.toUpperCase()}</span><h3>{result.title}</h3></div>
    <p>{result.answer}</p>
    {result.facts.length>0&&<ul>{result.facts.map((fact,i)=><li key={i}>{fact}</li>)}</ul>}
    {result.limitation&&<p className="np-agent-caution">{result.limitation}</p>}
    <small>Fontes: {result.sources.join(' · ')}. Dados bancários não verificados. Sem execução financeira e sem modelo de IA externo.</small>
   </div>}
   <div className="np-agent-shortcuts">
    <strong>Organize os dados que alimentam os agentes</strong>
    <div>
     <button onClick={()=>onOpenSection?.('money')} className="np-studio-secondary" type="button">Contas e extratos</button>
     <button onClick={()=>onOpenSection?.('spending')} className="np-studio-secondary" type="button">Gastos</button>
     <button onClick={()=>onOpenSection?.('planning')} className="np-studio-secondary" type="button">Metas e vencimentos</button>
     <button onClick={()=>onOpenSection?.('wealth')} className="np-studio-secondary" type="button">Patrimônio</button>
    </div>
   </div>
  </section>
  {selected==='investments'&&<PersonalInvestmentInspector/>}
 </div>;
}
