import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post} from './api';
import './investment-radar.css';

type Policy={recommendation:false;execution:false;ranking:false;buySellSignal:false;portfolioAdvice:false;advisorClientData:false};
type Health={configured:boolean;provider:string;capabilities?:string[];calculators?:string[];policy:Policy};
type RadarItem={symbol:string;provider?:string|null;lastPrice?:number;change?:number;changePercent?:number;avgVolume?:number;fetchedAt?:string|null;available?:boolean};
type Radar={provider:string;source:string;dataUpdatedAt?:string|null;dataAgeSeconds?:number|null;data:RadarItem[];policy:Policy};
type MacroIndicator={id:string;label:string;value:number;unit:string;date:string;source?:string;trend:string;interpretation:string};
type MacroObservation={id:string;topic:string;title:string;summary:string;explanation:string;source:string;referenceDate:string};
type Macro={provider:string;source:string;updatedAt?:string|null;degraded:boolean;indicators:MacroIndicator[];observations:MacroObservation[];policy:Policy};
type NewsItem={id:string;title:string;summary:string;source:string;url:string;publishedAt?:string|null;tags?:string[]};
type News={provider:string;source:string;latestPublishedAt?:string|null;data:NewsItem[];policy:Policy};
type CalcResult={provider:string;result:any;methodology:any;policy:Policy};
type Tab='radar'|'macro'|'news'|'tools';

const currency=(value:number,symbol:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:symbol.endsWith('.SA')?'BRL':'USD',maximumFractionDigits:2}).format(value);
const pct=(value?:number)=>`${Number(value||0)>=0?'+':''}${Number(value||0).toFixed(2)}%`;
const date=(value?:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const safeLink=(value:string)=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.toString():null}catch{return null}};

const calculators=[
  {id:'compound_with_contributions',label:'Juros + aportes',fields:[['principal','Valor inicial','number','10000'],['monthlyContribution','Aporte mensal','number','1000'],['annualRatePct','Taxa anual (%)','number','10'],['months','Meses','number','60']]},
  {id:'real_return',label:'Retorno real',fields:[['nominalAnnualRatePct','Retorno nominal anual (%)','number','10'],['inflationAnnualPct','Inflação anual (%)','number','4.5']]},
  {id:'fixed_income_scenario',label:'Renda fixa',fields:[['principal','Valor inicial','number','10000'],['annualRatePct','Taxa anual (%)','number','12'],['months','Meses','number','12'],['taxRatePct','Imposto informado (%)','number','17.5']]},
  {id:'benchmark_percentage_scenario',label:'% do benchmark',fields:[['principal','Valor inicial','number','10000'],['benchmarkAnnualRatePct','Benchmark anual (%)','number','12'],['benchmarkPercentagePct','Percentual do benchmark (%)','number','100'],['months','Meses','number','12'],['taxRatePct','Imposto informado (%)','number','17.5']]},
  {id:'average_price',label:'Preço médio',fields:[['currentQuantity','Quantidade atual','number','100'],['currentAveragePrice','Preço médio atual','number','20'],['newQuantity','Nova quantidade','number','50'],['newUnitPrice','Novo preço unitário','number','18'],['costs','Custos adicionais','number','0']]},
  {id:'dividend_yield',label:'Dividend yield',fields:[['annualDividendPerUnit','Dividendos anuais/unidade','number','1.2'],['referencePrice','Preço de referência','number','20']]},
] as const;

export default function InvestmentRadarCenter(){
  const[tab,setTab]=useState<Tab>('radar'),[health,setHealth]=useState<Health|null>(null),[radar,setRadar]=useState<Radar|null>(null),[macro,setMacro]=useState<Macro|null>(null),[news,setNews]=useState<News|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const[calcType,setCalcType]=useState<string>('compound_with_contributions'),[calcResult,setCalcResult]=useState<any>(null);
  const selectedCalc=useMemo(()=>calculators.find(item=>item.id===calcType)||calculators[0],[calcType]);

  useEffect(()=>{void load()},[]);
  async function load(){setBusy(true);setError('');try{const h=await api<Health>('/v1/investments/health');setHealth(h);if(!h.configured)return;const[r,m,n]=await Promise.allSettled([api<Radar>('/v1/investments/radar'),api<Macro>('/v1/investments/macro'),api<News>('/v1/investments/news?limit=12')]);if(r.status==='fulfilled')setRadar(r.value);if(m.status==='fulfilled')setMacro(m.value);if(n.status==='fulfilled')setNews(n.value)}catch(e:any){setError(e?.message||'Não foi possível carregar o Radar F-Insight.')}finally{setBusy(false)}}

  async function calculate(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const input:Object={};for(const[field]of selectedCalc.fields)(input as any)[field]=Number(f.get(field)||0);setBusy(true);setError('');try{const result=await post<CalcResult>('/v1/investments/calculate',{type:selectedCalc.id,input});setCalcResult(result.result)}catch(e:any){setError(e?.message||'Não foi possível calcular.')}finally{setBusy(false)}}

  return <section className="investmentRadar">
    <header className="investmentHero"><div><p>INVESTIMENTOS & MERCADOS · F-INSIGHT</p><h2>Entenda o mercado sem transformar informação em recomendação.</h2><span>Radar, contexto macroeconômico, notícias e cálculos financeiros dentro do NexOffice. Você continua tomando as decisões.</span></div><div className="investmentPolicy"><b>Informativo e educacional</b><small>Sem compra/venda · sem ranking · sem execução · sem carteira/custódia</small>{radar?.dataUpdatedAt&&<em>Mercado atualizado: {date(radar.dataUpdatedAt)}</em>}</div></header>

    {!health?.configured&&!busy&&<div className="investmentUnavailable"><b>Módulo preparado, conexão ainda não ativada.</b><span>O bridge F-Insight está pronto tecnicamente, mas permanece desligado neste ambiente até a ativação operacional autorizada.</span></div>}
    {error&&<div className="investmentError">{error}</div>}

    <nav className="investmentTabs">{([['radar','Radar'],['macro','Macro'],['news','Notícias'],['tools','Calculadoras']] as [Tab,string][]).map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}<button className="refresh" onClick={()=>void load()} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button></nav>

    {tab==='radar'&&<div className="investmentPanel"><div className="investmentTitle"><div><p>RADAR</p><h3>Mercados em uma leitura rápida</h3></div><small>Fonte: {radar?.source||'indisponível'}</small></div>{radar?.data?.length?<div className="assetGrid">{radar.data.map(item=><article key={item.symbol} className={!item.lastPrice?'unavailable':''}><div><b>{item.symbol.replace('.SA','')}</b><small>{item.provider||'sem fonte disponível'}</small></div>{item.lastPrice?<><strong>{currency(item.lastPrice,item.symbol)}</strong><span className={Number(item.changePercent||0)>=0?'up':'down'}>{pct(item.changePercent)}</span><em>coleta {date(item.fetchedAt)}</em></>:<span>Dados indisponíveis</span>}</article>)}</div>:<Empty text="Nenhum snapshot de mercado disponível agora."/>}</div>}

    {tab==='macro'&&<div className="investmentPanel"><div className="investmentTitle"><div><p>MACRO</p><h3>Indicadores e contexto</h3></div><small>{macro?.degraded?'Leitura parcial':'Fontes disponíveis'}</small></div>{macro?.indicators?.length?<><div className="macroGrid">{macro.indicators.map(item=><article key={item.id}><span>{item.label}</span><b>{item.id==='usdbrl'?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(item.value):`${item.value.toLocaleString('pt-BR')} ${item.unit}`}</b><small>Fonte: {item.source||macro.source} · {item.date}</small><p>{item.interpretation}</p></article>)}</div><div className="observationGrid">{macro.observations.map(item=><article key={item.id}><b>{item.title}</b><span>{item.summary}</span><p>{item.explanation}</p></article>)}</div></>:<Empty text="Indicadores macroeconômicos temporariamente indisponíveis. Nenhum valor de fallback é exibido."/>}</div>}

    {tab==='news'&&<div className="investmentPanel"><div className="investmentTitle"><div><p>INFORMAÇÃO</p><h3>Notícias financeiras</h3></div><small>Última publicação no feed: {date(news?.latestPublishedAt)}</small></div>{news?.data?.length?<div className="newsGrid">{news.data.map(item=>{const link=safeLink(item.url);const content=<><small>{item.source} · {date(item.publishedAt)}</small><b>{item.title}</b><p>{item.summary}</p></>;return link?<a key={item.id} href={link} target="_blank" rel="noreferrer">{content}</a>:<article key={item.id}>{content}</article>})}</div>:<Empty text="Feed financeiro temporariamente indisponível."/>}</div>}

    {tab==='tools'&&<div className="investmentPanel"><div className="investmentTitle"><div><p>FERRAMENTAS</p><h3>Calculadoras determinísticas</h3></div><small>Premissas informadas por você · sem escolha automática de produto</small></div><div className="calculatorLayout"><div><label className="calcSelector">Ferramenta<select value={calcType} onChange={e=>{setCalcType(e.target.value);setCalcResult(null)}}>{calculators.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label><form onSubmit={calculate} className="calcForm">{selectedCalc.fields.map(([name,label,type,placeholder])=><label key={name}>{label}<input name={name} type={type} step="any" defaultValue={placeholder}/></label>)}<button disabled={busy}>Calcular cenário</button></form></div><div className="calcResult">{calcResult?<Result value={calcResult}/>:<><b>Resultado</b><p>Preencha as premissas e calcule. O motor apenas aplica fórmulas determinísticas e mostra as hipóteses usadas.</p></>}</div></div></div>}

    <footer className="investmentFooter">O F-Insight fornece informação, contexto e cálculo. Não há recomendação individual, ranking de investimentos, ordem, execução, custódia ou promessa de rentabilidade neste módulo.</footer>
  </section>;
}

function Result({value}:{value:any}){const hidden=new Set(['type','assumptions','formula']);return <><b>Resultado do cenário</b><div className="resultRows">{Object.entries(value||{}).filter(([k,v])=>!hidden.has(k)&&['number','string'].includes(typeof v)).map(([k,v])=><div key={k}><span>{label(k)}</span><strong>{typeof v==='number'?Number(v).toLocaleString('pt-BR',{maximumFractionDigits:8}):String(v)}</strong></div>)}</div>{Array.isArray(value?.assumptions)&&<ul>{value.assumptions.map((a:string)=><li key={a}>{a}</li>)}</ul>}</>}
function label(value:string){return({principal:'Valor inicial',monthlyContribution:'Aporte mensal',annualRatePct:'Taxa anual (%)',effectiveMonthlyRatePct:'Taxa mensal efetiva (%)',months:'Meses',totalContributed:'Total aportado',finalBalance:'Saldo final',totalReturn:'Retorno nominal',nominalAnnualRatePct:'Retorno nominal anual (%)',inflationAnnualPct:'Inflação anual (%)',realAnnualRatePct:'Retorno real anual (%)',taxRatePct:'Imposto informado (%)',grossReturn:'Retorno bruto',grossBalance:'Saldo bruto',taxAmount:'Imposto',netReturn:'Retorno líquido',netBalance:'Saldo líquido',benchmarkAnnualRatePct:'Benchmark anual (%)',benchmarkPercentagePct:'% do benchmark',equivalentAnnualRatePct:'Taxa anual equivalente (%)',currentQuantity:'Quantidade atual',newQuantity:'Nova quantidade',totalQuantity:'Quantidade total',totalCost:'Custo total',newAveragePrice:'Novo preço médio',annualDividendPerUnit:'Dividendos anuais/unidade',referencePrice:'Preço de referência',dividendYieldPct:'Dividend yield (%)'} as Record<string,string>)[value]||value}
function Empty({text}:{text:string}){return <div className="investmentEmpty">{text}</div>}
