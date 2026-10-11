import {useEffect,useState} from 'react';
import {api,session} from './api';
import './profitability-panel.css';

type Option={
  action:'catalog_set_cost'|'catalog_review_price'|'create_operation'|'create_proposal'|'review_clients'|'review_receivables'|'marketing_focus';
  label:string;
  reason:string;
  catalogItemId?:string|null;
  view?:'finance'|'crm'|'materials'|'marketing';
};
type ProfitItem={
  catalog_key:string;
  catalog_item_id?:string|null;
  item_name:string;
  item_kind:string;
  billing_cycle:string;
  operations:number;
  booked_revenue_minor:number;
  received_revenue_minor:number;
  estimated_cost_minor:number;
  estimated_gross_profit_minor:number;
  margin_pct:number|null;
  cost_coverage_pct:number;
  best_options:Option[];
};
type Profitability={
  summary:{days:number;operations:number;bookedRevenueMinor:number;receivedRevenueMinor:number;coveredRevenueMinor:number;estimatedCostMinor:number;estimatedGrossProfitMinor:number;estimatedGrossMarginPct:number|null;costCoveragePct:number;methodology:string};
  items:ProfitItem[];
  customers:Array<{contact_id?:string|null;customer_name:string;operations:number;booked_revenue_minor:number;received_revenue_minor:number;cost_known_revenue_minor:number;estimated_cost_minor:number;estimated_gross_profit_minor:number;margin_pct:number|null;cost_coverage_pct:number}>;
  bestOptions:Option[];
};

const money=(minor:unknown=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const pct=(value:unknown)=>value===null||value===undefined?'—':Number(value).toFixed(1)+'%';

export default function ProfitabilityPanel(){
  const [workspaceKey,setWorkspaceKey]=useState(()=>session.workspace());
  const [days,setDays]=useState(90);
  const [data,setData]=useState<Profitability|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [expanded,setExpanded]=useState(false);

  useEffect(()=>{
    const timer=setInterval(()=>{const next=session.workspace();setWorkspaceKey(prev=>prev===next?prev:next)},700);
    return()=>clearInterval(timer);
  },[]);
  useEffect(()=>{if(workspaceKey)void load()},[workspaceKey,days]);

  async function load(){
    setBusy(true);setError('');
    try{setData(await api<Profitability>('/v1/finance/profitability?days='+days))}
    catch(e:any){setError(e?.message||'Não foi possível calcular a rentabilidade.')}
    finally{setBusy(false)}
  }

  function act(option:Option){
    const id=option.catalogItemId||'';
    if(option.action==='catalog_set_cost'||option.action==='catalog_review_price'){
      window.dispatchEvent(new CustomEvent('nexoffice:business-operations',{detail:{action:'catalog',catalogItemId:id}}));
      return;
    }
    if(option.action==='create_operation'){
      window.dispatchEvent(new CustomEvent('nexoffice:business-operations',{detail:{action:'use-catalog',catalogItemId:id}}));
      return;
    }
    if(option.action==='create_proposal'){
      if(id)sessionStorage.setItem('nexoffice.material.catalogItemId',id);
      window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'materials'}}));
      return;
    }
    if(option.action==='review_clients'){window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'crm'}}));return}
    if(option.action==='review_receivables'){window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'finance'}}));return}
    if(option.action==='marketing_focus'){window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:'marketing'}}));return}
  }

  const s=data?.summary;
  const top=data?.items?.[0]||null;
  return <section className="profitabilityPanel">
    <header className="profitabilityHead">
      <div><small>RENTABILIDADE DO NEGÓCIO</small><h3>O que está dando dinheiro?</h3><p>Vendas, custo estimado e margem por oferta — com as melhores opções já à mão.</p></div>
      <div className="profitabilityHeadActions"><select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={30}>30 dias</option><option value={90}>90 dias</option><option value={180}>180 dias</option><option value={365}>12 meses</option></select><button onClick={()=>void load()} disabled={busy}>↻</button></div>
    </header>
    {busy&&<div className="profitabilityBusy"/>}
    {error&&<div className="profitabilityError">{error}</div>}
    {s&&<><div className="profitabilityKpis">
      <article><small>Vendido</small><b>{money(s.bookedRevenueMinor)}</b><span>{s.operations} operações no período</span></article>
      <article><small>Recebido</small><b>{money(s.receivedRevenueMinor)}</b><span>{s.bookedRevenueMinor?Math.round(s.receivedRevenueMinor/s.bookedRevenueMinor*100):0}% do vendido</span></article>
      <article><small>Lucro bruto estimado</small><b>{money(s.estimatedGrossProfitMinor)}</b><span>sobre {money(s.coveredRevenueMinor)} com custo conhecido</span></article>
      <article><small>Margem estimada</small><b>{pct(s.estimatedGrossMarginPct)}</b><span>{pct(s.costCoveragePct)} das operações com custo conhecido</span></article>
    </div>

    <div className="profitabilityBest">
      <div className="profitabilityTitle"><div><small>MELHORES OPÇÕES AGORA</small><h4>O próximo passo já está aqui</h4></div><span>{data?.bestOptions.length||0}</span></div>
      <div className="profitabilityOptions">{data?.bestOptions.length?data.bestOptions.map((option,index)=><article key={option.action+index}><div><b>{option.label}</b><p>{option.reason}</p></div><button className={index===0?'primary':''} onClick={()=>act(option)}>Fazer agora</button></article>):<div className="profitabilityEmpty">Registre operações pelo catálogo para o NexOffice sugerir as melhores ações.</div>}</div>
    </div>

    {top&&<div className="profitabilityHighlight"><div><small>OFERTA COM MAIOR FATURAMENTO NO PERÍODO</small><b>{top.item_name}</b><span>{money(top.booked_revenue_minor)} vendidos · margem {pct(top.margin_pct)}</span></div><div className="profitabilityQuick">{top.best_options.slice(0,2).map(option=><button key={option.action} onClick={()=>act(option)}>{option.label}</button>)}</div></div>}

    <button className="profitabilityExpand" onClick={()=>setExpanded(v=>!v)}>{expanded?'Ocultar detalhes':'Ver ofertas e clientes'} <span>{expanded?'↑':'↓'}</span></button>
    {expanded&&<div className="profitabilityDetails">
      <section><div className="profitabilityTitle"><div><small>OFERTAS</small><h4>Receita e margem</h4></div></div><div className="profitabilityTable">
        {data?.items.length?data.items.map(item=><article key={item.catalog_key}><div className="profitabilityItem"><span>{item.item_kind==='service'?'Serviço':'Produto'}{item.billing_cycle!=='one_time'?' · recorrente':''}</span><b>{item.item_name}</b><small>{item.operations} operações · {pct(item.cost_coverage_pct)} com custo conhecido</small></div><div><small>Vendido</small><b>{money(item.booked_revenue_minor)}</b></div><div><small>Lucro estimado</small><b>{money(item.estimated_gross_profit_minor)}</b></div><div><small>Margem</small><b className={item.margin_pct!==null&&item.margin_pct<20?'profitabilityRisk':''}>{pct(item.margin_pct)}</b></div><div className="profitabilityRowActions">{item.best_options.slice(0,2).map(option=><button key={option.action} onClick={()=>act(option)}>{option.label}</button>)}</div></article>):<div className="profitabilityEmpty">Ainda não há operações suficientes para comparar ofertas.</div>}
      </div></section>
      <section><div className="profitabilityTitle"><div><small>CLIENTES</small><h4>Quem gera mais resultado</h4></div><button onClick={()=>act({action:'review_clients',label:'Abrir CRM',reason:'',view:'crm'})}>Abrir CRM</button></div><div className="profitabilityCustomers">{data?.customers.length?data.customers.slice(0,8).map(customer=><article key={customer.contact_id||customer.customer_name}><div><b>{customer.customer_name}</b><small>{customer.operations} operações</small></div><strong>{money(customer.estimated_gross_profit_minor)}</strong><span>margem {pct(customer.margin_pct)} · cobertura {pct(customer.cost_coverage_pct)}</span></article>):<div className="profitabilityEmpty">Sem clientes suficientes no período.</div>}</div></section>
    </div>}
    <footer>Margem estimada usa somente vendas com custo conhecido. Operações antigas sem snapshot podem usar o custo atual do catálogo; a cobertura mostra quanto da análise tem custo disponível.</footer>
  </>}</section>;
}
