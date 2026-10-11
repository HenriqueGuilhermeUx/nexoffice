import {useEffect,useState} from 'react';
import {api,post,session} from './api';
import './reconciliation-intelligence-panel.css';

type Candidate={id:string;description:string;amount_minor:number|string;status:string;contact_name?:string|null;confidence:number|string};
type Item={
  id:string;description:string;counterparty?:string|null;occurred_at:string;direction:'income'|'expense';amount_minor:number;account_name:string;
  match:{strength:'strong'|'review'|'none';confidence:number;bestCandidate?:Candidate|null;reasons:string[]};
  bestOptions:Array<{action:string;label:string;reason:string;transactionId:string;ledgerEntryId?:string}>;
};
type Payload={summary:{unmatched:number;unmatchedIncomeMinor:number;unmatchedExpenseMinor:number;strongMatches:number;needsReview:number};items:Item[]};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const date=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(value));

export default function ReconciliationIntelligencePanel(){
  const[data,setData]=useState<Payload|null>(null);
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');
  const[open,setOpen]=useState(false);
  const[sessionKey,setSessionKey]=useState(()=>session.workspace());
  useEffect(()=>{const timer=setInterval(()=>{const next=session.workspace();setSessionKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(sessionKey)void load()},[sessionKey]);

  async function load(){setError('');try{setData(await api<Payload>('/v1/reconciliation/intelligence?max=40'))}catch(e:any){setError(e?.message||'Não foi possível analisar a conciliação.')}}
  async function act(item:Item,action:string,ledgerEntryId?:string){
    setError('');setNotice('');
    if(action==='confirm_match'&&ledgerEntryId){
      setBusy(item.id);
      try{await post('/v1/reconciliation/'+item.id+'/match',{ledgerEntryId});setNotice('Movimentação conciliada. O lançamento correspondente foi atualizado.');await load()}
      catch(e:any){setError(e?.message||'Não foi possível conciliar.')}
      finally{setBusy('')}
      return;
    }
    if(action==='ignore_transaction'){
      setBusy(item.id);
      try{await post('/v1/reconciliation/'+item.id+'/ignore',{});setNotice('Movimentação ignorada nesta conciliação.');await load()}
      catch(e:any){setError(e?.message||'Não foi possível ignorar a movimentação.')}
      finally{setBusy('')}
      return;
    }
    if(action==='view_ledger'){
      document.querySelector('.financeTable')?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(action==='create_ledger'){
      sessionStorage.setItem('nexoffice.finance.prefillLedger',JSON.stringify({direction:item.direction,description:item.description,amount:(item.amount_minor/100).toFixed(2),status:'paid',paidAt:item.occurred_at}));
      window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'finance',modal:'ledger'}}));
    }
  }

  const s=data?.summary;
  if(!s)return null;
  return <section className="reconIntel">
    <header><div><small>CONCILIAÇÃO INTELIGENTE</small><h3>O dinheiro entrou. O NexOffice encontra onde ele pertence.</h3><p>Compara valor, data e contraparte e deixa a confirmação na sua mão.</p></div><div className="reconIntelHeadActions"><span>{s.unmatched} pendente(s)</span><button onClick={()=>setOpen(v=>!v)}>{open?'Fechar':'Revisar'}</button><button onClick={()=>void load()}>↻</button></div></header>
    <div className="reconIntelKpis"><span><small>Matches fortes</small><b>{s.strongMatches}</b></span><span><small>Revisar</small><b>{s.needsReview}</b></span><span><small>Entradas sem conciliar</small><b>{money(s.unmatchedIncomeMinor)}</b></span><span><small>Saídas sem conciliar</small><b>{money(s.unmatchedExpenseMinor)}</b></span></div>
    {error&&<div className="reconIntelError">{error}</div>}{notice&&<div className="reconIntelNotice">{notice}</div>}
    {open&&<div className="reconIntelList">{data?.items.length?data.items.map(item=>{
      const best=item.match.bestCandidate;
      return <article key={item.id} className={item.match.strength}>
        <div className="reconIntelTx"><span>{item.direction==='income'?'Entrada':'Saída'} · {date(item.occurred_at)} · {item.account_name}</span><b>{item.description}</b><small>{item.counterparty||'Contraparte não identificada'}</small><strong>{money(item.amount_minor)}</strong></div>
        <div className="reconIntelMatch">{best?<><span>Melhor correspondência</span><b>{best.description}</b><small>{best.contact_name||'Sem cliente'} · {money(best.amount_minor)}</small><em>{Math.round(item.match.confidence*100)}% · {item.match.reasons.join(' · ')||'sem sinais adicionais'}</em></>:<><span>Sem correspondência forte</span><b>Crie ou revise um lançamento</b><small>O NexOffice não encontrou candidato seguro.</small></>}</div>
        <div className="reconIntelActions">{item.bestOptions.slice(0,3).map(option=><button key={option.action} className={option.action==='confirm_match'?'primary':''} disabled={busy===item.id} onClick={()=>void act(item,option.action,option.ledgerEntryId)}>{busy===item.id?'Processando…':option.label}</button>)}</div>
      </article>
    }):<div className="reconIntelEmpty">Tudo conciliado por enquanto.</div>}</div>}
    <footer>Nenhuma sugestão desta área é confirmada sozinha. A conciliação altera o estado financeiro interno, por isso exige sua confirmação.</footer>
  </section>;
}
