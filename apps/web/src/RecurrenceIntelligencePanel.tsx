import {useEffect,useState} from 'react';
import {api,post,session} from './api';
import './recurrence-intelligence-panel.css';

type Option={
  action:'activate_recurrence'|'generate_upcoming'|'review_receivables'|'open_client'|'create_proposal'|'review_catalog_cycle';
  label:string;
  reason:string;
  operationId?:string|null;
  ruleId?:string|null;
  contactId?:string|null;
  catalogItemId?:string|null;
  view?:'finance'|'crm'|'materials';
};

type Rule={
  id:string;
  contact_id?:string|null;
  source_operation_id?:string|null;
  catalog_item_id?:string|null;
  contact_name?:string|null;
  catalog_name?:string|null;
  billing_cycle?:string|null;
  description:string;
  amount_minor:number;
  frequency:string;
  interval_count:number;
  next_run_at:string;
  ends_at?:string|null;
  active:boolean;
  generated_count:number;
  paid_count:number;
  overdue_count:number;
  overdue_minor:number;
  expected_30_minor:number;
  occurrences_30:number;
  risk:'healthy'|'attention'|'high'|'paused';
  best_options:Option[];
};

type Uncovered={
  operation_id:string;
  contact_id:string;
  catalog_item_id:string;
  contact_name:string;
  catalog_name:string;
  billing_cycle:string;
  amount_minor:number;
  supported_cycle:boolean;
  best_options:Option[];
};

type RecurrenceData={
  summary:{
    activeRules:number;
    expected30Minor:number;
    dueSoonRules:number;
    overdueCount:number;
    overdueMinor:number;
    uncoveredRelationships:number;
    supportedUncoveredRelationships:number;
  };
  rules:Rule[];
  uncovered:Uncovered[];
  bestOptions:Option[];
  safety:{automaticExternalActions:false;retroactiveGeneration:false;generationRequiresExplicitUserAction:true};
};

const money=(minor:unknown=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const date=(value?:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(value)):'—';
const cycle:Record<string,string>={weekly:'Semanal',monthly:'Mensal',quarterly:'Trimestral',yearly:'Anual',custom:'Personalizada'};
const riskLabel:Record<string,string>={healthy:'Em dia',attention:'Próximo ciclo',high:'Atenção',paused:'Pausada'};

export default function RecurrenceIntelligencePanel(){
  const[workspaceKey,setWorkspaceKey]=useState(()=>session.workspace());
  const[data,setData]=useState<RecurrenceData|null>(null);
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');
  const[expanded,setExpanded]=useState(false);

  useEffect(()=>{const timer=setInterval(()=>{const next=session.workspace();setWorkspaceKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(workspaceKey)void load()},[workspaceKey]);

  async function load(){
    setError('');
    try{setData(await api<RecurrenceData>('/v1/finance/recurrence-intelligence'))}
    catch(e:any){setError(e?.message||'Não foi possível carregar a recorrência inteligente.')}
  }

  async function act(option:Option){
    setError('');setNotice('');
    if(option.action==='activate_recurrence'&&option.operationId){
      setBusy('activate:'+option.operationId);
      try{
        const result=await post<any>('/v1/finance/recurrence-intelligence/activate/'+encodeURIComponent(option.operationId),{});
        setNotice(result?.reused?'A recorrência desta operação já estava ativada.':'Recorrência ativada para o próximo ciclo futuro.');
        await load();
      }catch(e:any){setError(e?.message||'Não foi possível ativar a recorrência.')}
      finally{setBusy('')}
      return;
    }
    if(option.action==='generate_upcoming'){
      setBusy('generate');
      try{
        const result=await post<{created:number;processedRules:number}>('/v1/recurring-rules/run',{days:30});
        setNotice(result.created?String(result.created)+' recebível(is) criado(s) para os próximos 30 dias.':'Os próximos 30 dias já estavam organizados; nenhum recebível novo foi necessário.');
        await load();
      }catch(e:any){setError(e?.message||'Não foi possível gerar os próximos recebíveis.')}
      finally{setBusy('')}
      return;
    }
    if(option.action==='review_receivables'){
      const target=document.querySelector('.financeTable');target?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(option.action==='open_client'){
      if(option.contactId)sessionStorage.setItem('nexoffice.crm.contactId',option.contactId);
      window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'crm'}}));
      return;
    }
    if(option.action==='create_proposal'){
      if(option.catalogItemId)sessionStorage.setItem('nexoffice.material.catalogItemId',option.catalogItemId);
      window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'materials'}}));
      return;
    }
    if(option.action==='review_catalog_cycle'){
      window.dispatchEvent(new CustomEvent('nexoffice:business-operations',{detail:{action:'catalog',catalogItemId:option.catalogItemId||''}}));
    }
  }

  const s=data?.summary;
  const risky=data?.rules.filter(rule=>rule.risk==='high'||rule.risk==='attention')||[];
  return <section className="recurrencePanel">
    <header className="recurrenceHead">
      <div><small>RECORRÊNCIA INTELIGENTE</small><h3>O próximo ciclo não pode depender da memória.</h3><p>Previsão, risco e próximos recebimentos com as melhores opções já à mão.</p></div>
      <div className="recurrenceHeadActions">{Boolean(s?.dueSoonRules)&&<button className="primary" disabled={busy==='generate'} onClick={()=>void act({action:'generate_upcoming',label:'Gerar próximos 30 dias',reason:''})}>{busy==='generate'?'Gerando…':'Gerar próximos 30 dias'}</button>}<button onClick={()=>void load()}>↻</button></div>
    </header>
    {error&&<div className="recurrenceError">{error}</div>}
    {notice&&<div className="recurrenceNotice">{notice}</div>}

    {s&&<><div className="recurrenceKpis">
      <article><small>Recorrências ativas</small><b>{s.activeRules}</b><span>regras de receita em acompanhamento</span></article>
      <article><small>Próximos 30 dias</small><b>{money(s.expected30Minor)}</b><span>{s.dueSoonRules} regra(s) entram na janela</span></article>
      <article><small>Em atraso</small><b>{money(s.overdueMinor)}</b><span>{s.overdueCount} recebimento(s) vencido(s)</span></article>
      <article><small>Ainda não ativadas</small><b>{s.uncoveredRelationships}</b><span>{s.supportedUncoveredRelationships} podem ser ativadas agora</span></article>
    </div>

    <div className="recurrenceBest">
      <div className="recurrenceTitle"><div><small>MELHORES OPÇÕES AGORA</small><h4>Não deixe o próximo ciclo solto</h4></div><span>{data?.bestOptions.length||0}</span></div>
      <div className="recurrenceOptions">{data?.bestOptions.length?data.bestOptions.map((option,index)=><article key={option.action+String(option.operationId||option.ruleId||index)}><div><b>{option.label}</b><p>{option.reason}</p></div><button className={index===0?'primary':''} disabled={busy==='generate'||busy==='activate:'+option.operationId} onClick={()=>void act(option)}>{busy==='activate:'+option.operationId?'Ativando…':busy==='generate'&&option.action==='generate_upcoming'?'Gerando…':'Fazer agora'}</button></article>):<div className="recurrenceEmpty">As recorrências estão organizadas. O NexOffice continua acompanhando os próximos ciclos.</div>}</div>
    </div>

    {risky.length>0&&<div className="recurrenceRiskStrip"><div><small>PRECISA DE ATENÇÃO</small><b>{risky[0].contact_name||'Cliente'} · {risky[0].catalog_name||risky[0].description}</b><span>{risky[0].risk==='high'?String(risky[0].overdue_count)+' recebimento(s) vencido(s)':'próximo ciclo em '+date(risky[0].next_run_at)}</span></div><div>{risky[0].best_options.slice(0,2).map(option=><button key={option.action} onClick={()=>void act(option)}>{option.label}</button>)}</div></div>}

    <button className="recurrenceExpand" onClick={()=>setExpanded(v=>!v)}>{expanded?'Ocultar recorrências':'Ver recorrências e oportunidades'} <span>{expanded?'↑':'↓'}</span></button>

    {expanded&&<div className="recurrenceDetails">
      <section>
        <div className="recurrenceTitle"><div><small>RECORRÊNCIAS ATIVAS</small><h4>Próximos ciclos e risco</h4></div></div>
        <div className="recurrenceList">{data?.rules.length?data.rules.map(rule=><article key={rule.id}>
          <div className="recurrenceMain"><span>{rule.catalog_name||rule.description}</span><b>{rule.contact_name||'Cliente'}</b><small>{cycle[rule.billing_cycle||'']||rule.frequency} · próximo em {date(rule.next_run_at)}</small></div>
          <div><small>Valor/ciclo</small><b>{money(rule.amount_minor)}</b></div>
          <div><small>30 dias</small><b>{money(rule.expected_30_minor)}</b></div>
          <div><small>Status</small><b className={'risk '+rule.risk}>{riskLabel[rule.risk]||rule.risk}</b></div>
          <div className="recurrenceRowActions">{rule.best_options.slice(0,2).map(option=><button key={option.action} onClick={()=>void act(option)}>{option.label}</button>)}</div>
        </article>):<div className="recurrenceEmpty">Nenhuma recorrência financeira ativa ainda.</div>}</div>
      </section>

      <section>
        <div className="recurrenceTitle"><div><small>OPORTUNIDADES</small><h4>Vendido como recorrente, ainda não ativado</h4></div></div>
        <div className="recurrenceUncovered">{data?.uncovered.length?data.uncovered.slice(0,12).map(item=><article key={item.operation_id}>
          <div><b>{item.contact_name}</b><span>{item.catalog_name}</span><small>{cycle[item.billing_cycle]||item.billing_cycle} · {money(item.amount_minor)}</small></div>
          <div className="recurrenceRowActions">{item.best_options.slice(0,2).map(option=><button className={option.action==='activate_recurrence'?'primary':''} key={option.action} disabled={busy==='activate:'+item.operation_id} onClick={()=>void act(option)}>{busy==='activate:'+item.operation_id?'Ativando…':option.label}</button>)}</div>
        </article>):<div className="recurrenceEmpty">Nenhuma venda recorrente ficou sem regra ativa.</div>}</div>
      </section>
    </div>}
    <footer>Ativar recorrência é uma ação explícita e começa no próximo ciclo futuro. Gerar recebíveis também exige ação do usuário; nenhuma cobrança, mensagem ou pagamento externo é disparado automaticamente.</footer>
  </>}</section>;
}
