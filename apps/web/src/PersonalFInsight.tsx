import {useEffect,useState,type FormEvent} from 'react';
import PersonalBrokerage from './PersonalBrokerage';

/**
 * Nex Personal research surface. The market bridge is separate from PF finances.
 * Nothing is sent upstream until the user actively requests a symbol or macro.
 */
type Status={configured:boolean;readOnly:true;dataSharing:false;accountLinking:false};
type Asset={symbol:string;available:boolean;quote:{value:number;source:string;observedAt:string;currency:'unspecified'}|null;note:string};
type Indicator={id:string;label:string;value:number;unit:string;date:string;source:string};
type Macro={source:string;fetchedAt:string|null;indicators:Indicator[];demoDataUsed:false};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');

async function personalGet<T>(path:string,token:string,signal?:AbortSignal):Promise<T>{
 const r=await fetch(API+path,{headers:{authorization:'Bearer '+token},signal});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(body.message||'Pesquisa indisponível.');
 return body as T;
}
const when=(v:string|null|undefined)=>v&&Number.isFinite(Date.parse(v))?
 new Date(v).toLocaleString('pt-BR'):'não informado';

export default function PersonalFInsight({token,onOpenAgent,onOpenWealth}:{
 token:string;onOpenAgent:()=>void;onOpenWealth:()=>void
}){
 const [status,setStatus]=useState<Status|null>(null);
 const [ticker,setTicker]=useState('');
 const [asset,setAsset]=useState<Asset|null>(null);
 const [macro,setMacro]=useState<Macro|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  setStatus(null);setAsset(null);setMacro(null);setError('');
  void personalGet<Status>('/v1/personal/finsight/status',token,controller.signal)
   .then(v=>{if(!controller.signal.aborted)setStatus(v);})
   .catch(()=>{if(!controller.signal.aborted)setError('Não foi possível verificar a disponibilidade da pesquisa.');});
  return ()=>controller.abort();
 },[token]);
 async function loadAsset(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const s=ticker.trim().toUpperCase();
  if(!/^[A-Z0-9.^-]{1,24}$/.test(s)){setError('Digite um símbolo de mercado válido.');return;}
  setError('');setAsset(null);setBusy(true);
  try{setAsset(await personalGet<Asset>('/v1/personal/finsight/asset/'+encodeURIComponent(s),token));}
  catch(e){setError(e instanceof Error?e.message:'Pesquisa indisponível.');}
  finally{setBusy(false);}
 }
 async function loadMacro(){
  setError('');setMacro(null);setBusy(true);
  try{setMacro(await personalGet<Macro>('/v1/personal/finsight/macro',token));}
  catch(e){setError(e instanceof Error?e.message:'Indicadores indisponíveis.');}
  finally{setBusy(false);}
 }
 return <div className="np-studio">
  <section className="np-panel np-studio-card">
   <span className="np-kicker">NEXA · INTELIGÊNCIA DE INVESTIMENTOS</span>
   <h2>Investimentos & Mercados · F-Insight</h2>
   <p>Léo ajuda a entender riscos, patrimônio e investimentos. O F-Insight acrescenta pesquisa de mercado independente, com fontes e horários identificados.</p>
   <p><strong>Sem ordens, recomendações personalizadas ou conexão automática com bancos, carteiras ou contas do F-Insight.</strong></p>
   <div className="np-studio-form">
    <button type="button" className="np-primary" onClick={onOpenAgent}>Conversar com Léo · análise pessoal</button>
    <button type="button" className="np-studio-secondary" onClick={onOpenWealth}>Organizar patrimônio declarado</button>
   </div>
  </section>

  <section className="np-panel np-studio-card">
   <h2>Pesquisa F-Insight na Nexa</h2>
   <p>Consulte dados informativos sem compartilhar identidade, saldos, histórico, posições ou preferências financeiras entre os produtos.</p>
   {status?.configured===true?<p role="status">Conector habilitado para consulta sob demanda. A disponibilidade dos provedores pode variar.</p>:
    <p role="status">Integração de dados em preparação. O painel permanece seguro e não mostra cotações de demonstração.</p>}
   <form className="np-studio-form" onSubmit={e=>void loadAsset(e)}>
    <label>Pesquisar ativo (ex.: AAPL ou PETR4.SA)
     <input aria-label="Símbolo para pesquisa F-Insight" value={ticker} maxLength={24}
      onChange={e=>setTicker(e.target.value.toUpperCase())} placeholder="AAPL"/>
    </label>
    <button type="submit" className="np-primary" disabled={busy||status?.configured!==true}>Pesquisar ativo</button>
   </form>
   <button type="button" className="np-studio-secondary" onClick={()=>void loadMacro()}
    disabled={busy||status?.configured!==true}>Consultar Selic, IPCA e dólar</button>
   {busy&&<p role="status">Consultando fontes de mercado…</p>}
   {error&&<p role="alert" className="np-error">{error}</p>}
   {asset&&<div role="status" className="np-studio-preview">
    <strong>{asset.symbol}</strong>
    {asset.available&&asset.quote?<p><strong>{asset.quote.value.toLocaleString('pt-BR',{maximumFractionDigits:4})}</strong> · unidade monetária a confirmar no provedor.
      <small> Fonte: {asset.quote.source} · observado em {when(asset.quote.observedAt)}</small></p>:
     <p>Sem cotação válida e atualizada nesta consulta.</p>}
    <p>{asset.note}</p>
   </div>}
   {macro&&<div className="np-studio-preview" role="status">
    <h3>Indicadores do Banco Central</h3>
    {macro.indicators.length?macro.indicators.map(item=><div className="np-line" key={item.id}>
     <span>{item.label}<small>{item.source} · referência {item.date}</small></span>
     <strong>{item.value.toLocaleString('pt-BR')} {item.unit}</strong>
    </div>):<p>Nenhum indicador verificado disponível nesta consulta.</p>}
    <small>Dados obtidos em {when(macro.fetchedAt)}. Séries podem ter datas de referência diferentes.</small>
   </div>}
  </section>

  <PersonalBrokerage token={token}/>

  <section className="np-panel np-studio-card">
   <h2>F-Insight completo</h2>
   <p>Radar avançado, watchlist, alertas, gráficos e ferramentas profissionais continuam na plataforma independente. Ao abri-la, você estará em outro produto, com login e política de privacidade próprios.</p>
   <a className="np-studio-secondary" href="https://f-insight.org/" target="_blank" rel="noopener noreferrer">Abrir F-Insight em nova aba ↗</a>
   <p><small>Nenhum dado deste espaço Nexa ou credencial de acesso é enviado por este link.</small></p>
  </section>
 </div>;
}
