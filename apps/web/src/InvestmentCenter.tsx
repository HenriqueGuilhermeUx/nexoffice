import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post} from './api';
import './investment-center.css';

type Policy={recommendation:boolean;execution:boolean;ranking:boolean;buySellSignal:boolean;portfolioAdvice:boolean;advisorClientData:boolean};
type RadarItem={symbol:string;available?:boolean;provider?:string|null;lastPrice?:number;change?:number;changePercent?:number;avgVolume?:number;fetchedAt?:string|null};
type RadarResponse={provider:string;source:string;dataUpdatedAt?:string|null;dataAgeSeconds?:number|null;data:RadarItem[];policy:Policy;externalEffect:false};
type MacroIndicator={id:string;label:string;value:number;unit:string;date:string;source?:string;trend?:string;interpretation?:string};
type MacroObservation={id?:string;title?:string;summary?:string;detail?:string};
type MacroResponse={provider:string;source:string;updatedAt?:string|null;degraded:boolean;indicators:MacroIndicator[];observations:MacroObservation[];policy:Policy;externalEffect:false};
type NewsItem={id:string;title:string;summary:string;source:string;url:string;publishedAt?:string|null;tags:string[]};
type NewsResponse={provider:string;source:string;latestPublishedAt?:string|null;data:NewsItem[];policy:Policy;externalEffect:false};
type CalculationResponse={provider:string;result:any;methodology?:{deterministic?:boolean;externalMarketDataUsed?:boolean;inputsProvidedByCaller?:boolean};policy:Policy;externalEffect:false};
type HealthResponse={configured:boolean;provider:string;capabilities?:string[];calculators?:string[];policy:Policy;externalEffect:false};

type Tab='radar'|'macro'|'news'|'calculators';
const DEFAULT_SYMBOLS='PETR4.SA,VALE3.SA,ITUB4.SA,WEGE3.SA,AAPL,MSFT,NVDA,BTC-USD,ETH-USD';
const calcLabels:Record<string,string>={compound_with_contributions:'Juros compostos + aportes',real_return:'Retorno real',fixed_income_scenario:'Cenário de renda fixa',benchmark_percentage_scenario:'Percentual de benchmark',average_price:'Preço médio',dividend_yield:'Dividend yield'};
const money=(value?:number)=>Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(Number(value)):'—';
const number=(value?:number,digits=2)=>Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(Number(value)):'—';
const when=(value?:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';

export default function InvestmentCenter({workspaceId}:{workspaceId:string}){
  const [tab,setTab]=useState<Tab>('radar');
  const [health,setHealth]=useState<HealthResponse|null>(null);
  const [radar,setRadar]=useState<RadarResponse|null>(null);
  const [macro,setMacro]=useState<MacroResponse|null>(null);
  const [news,setNews]=useState<NewsResponse|null>(null);
  const [symbols,setSymbols]=useState(DEFAULT_SYMBOLS);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const safePolicy=useMemo(()=>health?.policy||radar?.policy||macro?.policy||news?.policy||null,[health,radar,macro,news]);

  useEffect(()=>{if(workspaceId)void boot()},[workspaceId]);
  async function boot(){setBusy(true);setError('');try{const h=await api<HealthResponse>('/v1/investments/health');setHealth(h);if(h.configured)await loadRadar()}catch(e:any){setError(e?.message||'Não foi possível verificar o F-Insight.')}finally{setBusy(false)}}
  async function loadRadar(){setBusy(true);setError('');try{setRadar(await api<RadarResponse>(`/v1/investments/radar?symbols=${encodeURIComponent(symbols)}`))}catch(e:any){setError(e?.message||'Não foi possível carregar o Radar.')}finally{setBusy(false)}}
  async function loadMacro(){setBusy(true);setError('');try{setMacro(await api<MacroResponse>('/v1/investments/macro'))}catch(e:any){setError(e?.message||'Não foi possível carregar o contexto macro.')}finally{setBusy(false)}}
  async function loadNews(){setBusy(true);setError('');try{setNews(await api<NewsResponse>('/v1/investments/news?limit=18'))}catch(e:any){setError(e?.message||'Não foi possível carregar as notícias.')}finally{setBusy(false)}}
  async function choose(next:Tab){setTab(next);if(next==='radar'&&!radar)await loadRadar();if(next==='macro'&&!macro)await loadMacro();if(next==='news'&&!news)await loadNews()}

  return <div className="investmentCenter">
    <div className="investmentHero"><div><p className="eyebrow">INVESTIMENTOS & MERCADOS · POWERED BY F-INSIGHT</p><h2>Inteligência de mercado dentro do NexOffice</h2><p>Radar, contexto macro, notícias e cálculos para informação e análise. Este módulo não recomenda compra ou venda e não executa investimentos.</p></div><div className={`investmentConnection ${health?.configured?'on':'off'}`}><b>{health?.configured?'F-Insight conectado':'F-Insight ainda não conectado'}</b><span>{health?.configured?'Bridge server-to-server ativo no ambiente.':'Configure o bridge no backend para liberar dados.'}</span></div></div>
    <div className="investmentGuardrails"><span><b>✓</b> Somente informação</span><span><b>✓</b> Dados com fonte e horário</span><span><b>✓</b> Cálculos determinísticos</span><span className="off"><b>○</b> Sem recomendação</span><span className="off"><b>○</b> Sem execução</span></div>
    <div className="investmentTabs">{([['radar','Radar'],['macro','Macro'],['news','Notícias'],['calculators','Calculadoras']] as Array<[Tab,string]>).map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>void choose(key)}>{label}</button>)}</div>
    {busy&&<div className="investmentBusy"/>}{error&&<div className="investmentError">{error}</div>}
    {!health?.configured&&!busy?<div className="investmentEmpty"><b>Bridge F-Insight fechado neste ambiente.</b><p>Isso é intencional: a integração só funciona com URL e credencial server-to-server no backend do NexOffice. Nenhuma chave vai para o navegador.</p></div>:<>
      {tab==='radar'&&<RadarPanel value={radar} symbols={symbols} setSymbols={setSymbols} reload={loadRadar}/>} 
      {tab==='macro'&&<MacroPanel value={macro}/>} 
      {tab==='news'&&<NewsPanel value={news}/>} 
      {tab==='calculators'&&<CalculatorPanel/>}
    </>}
    {safePolicy&&<div className="investmentPolicy"><b>Contrato ativo</b><span>recommendation={String(safePolicy.recommendation)} · execution={String(safePolicy.execution)} · ranking={String(safePolicy.ranking)} · buySellSignal={String(safePolicy.buySellSignal)}</span></div>}
  </div>;
}

function RadarPanel({value,symbols,setSymbols,reload}:{value:RadarResponse|null;symbols:string;setSymbols:(v:string)=>void;reload:()=>Promise<void>}){return <div className="investmentPanel"><div className="investmentPanelHead"><div><small>RADAR</small><h3>Snapshots de mercado</h3><p>Última coleta: {when(value?.dataUpdatedAt)}{value?.dataAgeSeconds!=null?` · ${value.dataAgeSeconds}s atrás`:''}</p></div><div className="investmentRadarInput"><input value={symbols} onChange={e=>setSymbols(e.target.value.toUpperCase())} aria-label="Ativos do radar"/><button onClick={()=>void reload()}>Atualizar</button></div></div><div className="investmentGrid">{value?.data?.length?value.data.map(item=><article className="investmentAsset" key={item.symbol}><div><b>{item.symbol}</b><small>{item.available===false?'Indisponível':item.provider||value.source}</small></div>{item.available===false?<p className="muted">Sem snapshot válido.</p>:<><strong>{money(item.lastPrice)}</strong><span className={(item.changePercent||0)>=0?'positive':'negative'}>{number(item.changePercent)}%</span><small>Coletado {when(item.fetchedAt)}</small></>}</article>):<div className="investmentEmpty"><b>Nenhum snapshot disponível.</b><p>O NexOffice não inventa cotação quando o provider não entrega dado válido.</p></div>}</div></div>}

function MacroPanel({value}:{value:MacroResponse|null}){return <div className="investmentPanel"><div className="investmentPanelHead"><div><small>MACRO</small><h3>Contexto oficial disponível</h3><p>Fonte: {value?.source||'—'} · Atualizado: {when(value?.updatedAt)}</p></div></div><div className="investmentGrid macro">{value?.indicators?.length?value.indicators.map(item=><article className="investmentMacro" key={item.id}><small>{item.label}</small><strong>{number(item.value)} {item.unit}</strong><span>{item.date}</span><p>{item.interpretation||'Indicador informativo.'}</p><em>{item.source||value.source}</em></article>):<div className="investmentEmpty"><b>Indicadores macro indisponíveis.</b><p>Nenhum fallback numérico é exibido como se fosse dado atual.</p></div>}</div>{Boolean(value?.observations?.length)&&<div className="investmentObservations"><h4>Contexto neutro</h4>{value!.observations.map((item,index)=><article key={item.id||index}><b>{item.title||'Observação'}</b><p>{item.summary||item.detail||''}</p></article>)}</div>}</div>}

function NewsPanel({value}:{value:NewsResponse|null}){return <div className="investmentPanel"><div className="investmentPanelHead"><div><small>NOTÍCIAS</small><h3>Feed com fonte e publicação</h3><p>Última publicação recebida: {when(value?.latestPublishedAt)}</p></div></div><div className="investmentNews">{value?.data?.length?value.data.map(item=><article key={item.id}><div><span>{item.source}</span><small>{when(item.publishedAt)}</small></div><h4>{item.title}</h4><p>{item.summary}</p>{item.url&&item.url!=='#'&&<a href={item.url} target="_blank" rel="noreferrer">Abrir fonte ↗</a>}</article>):<div className="investmentEmpty"><b>Nenhuma notícia disponível.</b><p>O módulo não substitui falha de provider por manchetes de demonstração.</p></div>}</div></div>}

function CalculatorPanel(){const [type,setType]=useState('compound_with_contributions'),[result,setResult]=useState<CalculationResponse|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);async function calculate(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');setResult(null);const form=new FormData(e.currentTarget);const input=Object.fromEntries([...form.entries()].filter(([key])=>!['type'].includes(key)).map(([key,value])=>[key,Number(value)]));try{setResult(await post<CalculationResponse>('/v1/investments/calculate',{type,input}))}catch(e:any){setError(e?.message||'Não foi possível calcular.')}finally{setBusy(false)}}return <div className="investmentPanel"><div className="investmentPanelHead"><div><small>CALCULADORAS</small><h3>Cenários com premissas explícitas</h3><p>O cálculo usa apenas os valores fornecidos aqui. Não escolhe produto, ativo ou estratégia.</p></div></div><form className="investmentCalc" onSubmit={calculate}><label><span>Cálculo</span><select name="type" value={type} onChange={e=>{setType(e.target.value);setResult(null)}}>{Object.entries(calcLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><CalcFields type={type}/><button className="primary" disabled={busy}>{busy?'Calculando…':'Calcular cenário'}</button></form>{error&&<div className="investmentError">{error}</div>}{result&&<div className="investmentResult"><div><small>RESULTADO</small><pre>{JSON.stringify(result.result,null,2)}</pre></div><aside><b>Metodologia</b><span>Determinístico: {String(result.methodology?.deterministic)}</span><span>Usou mercado externo: {String(result.methodology?.externalMarketDataUsed)}</span><span>Entradas fornecidas pelo usuário: {String(result.methodology?.inputsProvidedByCaller)}</span></aside></div>}</div>}

function CalcFields({type}:{type:string}){if(type==='compound_with_contributions')return <><Num name="initialAmount" label="Valor inicial"/><Num name="monthlyContribution" label="Aporte mensal"/><Num name="annualRatePct" label="Taxa anual (%)"/><Num name="months" label="Prazo (meses)"/></>;if(type==='real_return')return <><Num name="nominalAnnualRatePct" label="Retorno nominal anual (%)"/><Num name="inflationAnnualPct" label="Inflação anual (%)"/></>;if(type==='fixed_income_scenario')return <><Num name="principal" label="Principal"/><Num name="annualRatePct" label="Taxa anual (%)"/><Num name="months" label="Prazo (meses)"/><Num name="taxRatePct" label="Imposto informado (%)"/></>;if(type==='benchmark_percentage_scenario')return <><Num name="principal" label="Principal"/><Num name="benchmarkAnnualRatePct" label="Benchmark anual (%)"/><Num name="benchmarkPercent" label="Percentual do benchmark (%)"/><Num name="months" label="Prazo (meses)"/></>;if(type==='average_price')return <><Num name="currentQuantity" label="Quantidade atual"/><Num name="currentAveragePrice" label="Preço médio atual"/><Num name="newQuantity" label="Nova quantidade"/><Num name="newUnitPrice" label="Novo preço unitário"/></>;return <><Num name="annualDividendPerShare" label="Dividendo anual por cota/ação"/><Num name="pricePerShare" label="Preço por cota/ação"/></>}
function Num({name,label}:{name:string;label:string}){return <label><span>{label}</span><input name={name} type="number" step="any" required/></label>}
