import {useEffect,useState} from 'react';
import {api,post,session} from './api';
import './relationship-intelligence-panel.css';

type Option={
  action:'view_context'|'review_finance'|'create_followup_task'|'create_renewal_proposal'|'create_expansion_proposal';
  label:string;
  reason:string;
  contactId:string;
  catalogItemId?:string|null;
};
type Relationship={
  contactId:string;name:string;email?:string|null;phone?:string|null;companyName?:string|null;
  status:'healthy'|'attention'|'risk'|'renewal'|'expansion';reasons:string[];
  lastTouchAt?:string|null;daysSinceTouch:number;activeRules:number;nextCycleAt?:string|null;renewalAt?:string|null;
  overdueCount:number;overdueMinor:number;incomeCount:number;paidCount:number;lastPaidAt?:string|null;documentRenewalAt?:string|null;documentRenewalTitle?:string|null;
  openDeals:number;openPipelineMinor:number;wonDeals:number;lost90:number;noShow180:number;operationCount:number;
  expansionCandidate?:{id:string;name:string;kind:string;priceMinor:number;billingCycle:string}|null;
  bestOptions:Option[];
};
type Payload={
  summary:{customers:number;atRisk:number;renewalSoon:number;attention:number;expansion:number;healthy:number};
  relationships:Relationship[];bestOptions:Option[];
  rules:Record<string,string>;
  safety:{externalCommunication:false;automaticProposalSend:false;automaticDiscount:false;automaticRenewal:false};
};

const money=(minor:unknown=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const date=(value?:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(value)):'—';
const statusLabel:Record<string,string>={risk:'Em risco',renewal:'Renovação próxima',attention:'Atenção',expansion:'Expansão possível',healthy:'Saudável'};

export default function RelationshipIntelligencePanel(){
  const[workspaceKey,setWorkspaceKey]=useState(()=>session.workspace());
  const[data,setData]=useState<Payload|null>(null);
  const[expanded,setExpanded]=useState('');
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');

  useEffect(()=>{const timer=setInterval(()=>{const next=session.workspace();setWorkspaceKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(workspaceKey)void load()},[workspaceKey]);

  async function load(){
    setError('');
    try{setData(await api<Payload>('/v1/crm/relationship-intelligence'))}
    catch(e:any){setError(e?.message||'Não foi possível carregar a inteligência de relacionamento.');}
  }

  async function act(option:Option,row?:Relationship){
    setError('');setNotice('');
    if(option.action==='view_context'){setExpanded(prev=>prev===option.contactId?'':option.contactId);return;}
    if(option.action==='review_finance'){
      sessionStorage.setItem('nexoffice.finance.contactId',option.contactId);
      window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'finance'}}));
      return;
    }
    if(option.action==='create_followup_task'){
      setBusy('task:'+option.contactId);
      try{
        const due=new Date(Date.now()+(row?.status==='risk'?1:3)*86400000).toISOString();
        const title=row?.status==='renewal'?'Preparar renovação · '+(row?.name||'Cliente'):row?.status==='risk'?'Recuperar relacionamento · '+(row?.name||'Cliente'):'Follow-up de relacionamento · '+(row?.name||'Cliente');
        await post('/v1/tasks',{contactId:option.contactId,title,description:(row?.reasons||[]).join(' · '),priority:row?.status==='risk'||row?.status==='renewal'?'high':'normal',dueAt:due,metadata:{source:'relationship_intelligence_v1',relationshipStatus:row?.status||null}});
        setNotice('Tarefa criada na Agenda. Nenhuma mensagem foi enviada ao cliente.');
        await load();
      }catch(e:any){setError(e?.message||'Não foi possível criar a tarefa.');}
      finally{setBusy('');}
      return;
    }
    if(option.action==='create_renewal_proposal'||option.action==='create_expansion_proposal'){
      sessionStorage.setItem('nexoffice.material.contactId',option.contactId);
      if(option.catalogItemId)sessionStorage.setItem('nexoffice.material.catalogItemId',option.catalogItemId);
      window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'materials'}}));
    }
  }

  const s=data?.summary;
  return <section className="relationshipPanel">
    <header className="relationshipHead"><div><small>RELACIONAMENTO & RENOVAÇÃO</small><h3>Cuide do cliente antes do problema aparecer.</h3><p>Sinais explicáveis de risco, renovação e expansão com próximas ações prontas.</p></div><button onClick={()=>void load()}>↻</button></header>
    {error&&<div className="relationshipError">{error}</div>}
    {notice&&<div className="relationshipNotice">{notice}</div>}
    {s&&<>
      <div className="relationshipKpis">
        <article><small>Clientes acompanhados</small><b>{s.customers}</b><span>com histórico real de negócio</span></article>
        <article><small>Em risco</small><b>{s.atRisk}</b><span>prioridade de recuperação</span></article>
        <article><small>Renovação próxima</small><b>{s.renewalSoon}</b><span>janela de até 60 dias</span></article>
        <article><small>Expansão possível</small><b>{s.expansion}</b><span>ofertas ainda não utilizadas</span></article>
      </div>

      <div className="relationshipBest">
        <div className="relationshipTitle"><div><small>MELHORES OPÇÕES AGORA</small><h4>Prioridades de relacionamento</h4></div><span>{data?.bestOptions.length||0}</span></div>
        <div className="relationshipOptions">{data?.bestOptions.length?data.bestOptions.map((option,index)=>{const row=data.relationships.find(x=>x.contactId===option.contactId);return <article key={option.action+option.contactId}><div><b>{option.label}</b><p>{row?.name?row.name+' · ':''}{option.reason}</p></div><button className={index===0?'primary':''} disabled={busy==='task:'+option.contactId} onClick={()=>void act(option,row)}>{busy==='task:'+option.contactId?'Criando…':'Fazer agora'}</button></article>}):<div className="relationshipEmpty">Nenhuma prioridade crítica agora. O NexOffice continua acompanhando os sinais.</div>}</div>
      </div>

      <div className="relationshipList">
        {data?.relationships.slice(0,30).map(row=><article key={row.contactId} className={'relationshipRow '+row.status}>
          <div className="relationshipRowMain"><span className={'relationshipStatus '+row.status}>{statusLabel[row.status]}</span><b>{row.name}</b><small>{row.reasons.join(' · ')}</small></div>
          <div><small>Último contato</small><b>{row.daysSinceTouch}d</b><span>{date(row.lastTouchAt)}</span></div>
          <div><small>Em atraso</small><b>{money(row.overdueMinor)}</b><span>{row.overdueCount} recebimento(s)</span></div>
          <div><small>Pipeline</small><b>{money(row.openPipelineMinor)}</b><span>{row.openDeals} oportunidade(s)</span></div>
          <div className="relationshipRowActions">{row.bestOptions.slice(0,3).map(option=><button className={option.action==='create_renewal_proposal'||option.action==='create_expansion_proposal'?'primary':''} key={option.action} disabled={busy==='task:'+row.contactId} onClick={()=>void act(option,row)}>{busy==='task:'+row.contactId&&option.action==='create_followup_task'?'Criando…':option.label}</button>)}</div>
          {expanded===row.contactId&&<div className="relationshipContext">
            <div><small>SINAIS</small><ul>{row.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>
            <div><small>RECORRÊNCIA & CONTRATO</small><b>{row.activeRules} regra(s) ativa(s)</b><span>Próximo ciclo: {date(row.nextCycleAt)}</span><span>Renovação/término: {date(row.renewalAt)}</span>{row.documentRenewalAt&&<span>DocWallet: {row.documentRenewalTitle||'Contrato'} · {date(row.documentRenewalAt)}</span>}</div>
            <div><small>HISTÓRICO</small><b>{row.wonDeals} negócio(s) ganho(s)</b><span>{row.paidCount} recebimento(s) pago(s)</span><span>{row.lost90} perda(s) em 90 dias · {row.noShow180} falta(s) em 180 dias</span></div>
            <div><small>EXPANSÃO</small>{row.expansionCandidate?<><b>{row.expansionCandidate.name}</b><span>{money(row.expansionCandidate.priceMinor)} · oferta ainda não utilizada</span></>:<span>Nenhuma oferta adicional identificada no catálogo.</span>}</div>
          </div>}
        </article>)}
      </div>
      <footer>As classificações usam regras visíveis e dados do próprio negócio. O NexOffice não envia mensagens, não renova contratos, não concede desconto e não envia propostas automaticamente.</footer>
    </>}
  </section>;
}
