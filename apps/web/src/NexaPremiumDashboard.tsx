import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import type {AgentId} from './NexPersonalAgents';
import {routeMayaIntent} from './personal-assistant-routing';
import {buildPremiumFinancialTruth,type PersonalBalance,type PersonalOverview,type PersonalStudioSummary} from './personal-premium-model';
import './nexa-premium-dashboard.css';

type Section='office'|'today'|'money'|'spending'|'planning'|'wealth'|'market'|'crypto'|'agents'|'maya'|'privacy'|'overview';
type Movement={id:string;description:string;amount_minor:string;currency:string;booked_at:string;institution_name:string};
type Consent={id:string;status:string;purpose:string;expires_at:string|null};
type Providers={openFinance:{provider:string;status:string;connectEnabled:boolean};payments:{provider:string;status:string;initiationEnabled:boolean};externalEffect:false};
type Life={intents:Array<{id:string;kind:string;status:string}>;partnerDataShared:false;proactiveDeliveryActive:false};
type Studio=PersonalStudioSummary&{maya:{mode:string;insights:Array<{kind:string;title:string;detail:string}>};externalEffect?:false};
type Props={
 token:string;displayName:string;overview:PersonalOverview|null;
 accounts:PersonalBalance[];movements:Movement[];consents:Consent[];
 onOpenSection:(section:Section)=>void;onOpenAgent:(agent:AgentId)=>void;onRefresh:()=>void
};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'
 ? '' : ((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');
const WALLET_URL='https://trynexa.com.br/portal/';
const WALLET_SIGNUP='https://trynexa.com.br/cadastro';

function money(minor:string|null|undefined,currency='BRL'){
 if(minor===null||minor===undefined||!(/^-?\d{1,20}$/.test(minor)))return '—';
 try{
  const amount=BigInt(minor),absolute=amount<0n?-amount:amount;
  const decimal=String(absolute%100n).padStart(2,'0');
  return (amount<0n?'−':'')+(currency==='BRL'?'R$ ':currency+' ')
   +(absolute/100n).toLocaleString('pt-BR')+','+decimal;
 }catch{return '—';}
}
function date(value:string|null|undefined){
 if(!value)return '—';
 // ISO date-only values are calendar days, not UTC instants.
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const [year,month,day]=value.split('-');
  return day+'/'+month+'/'+year;
 }
 const d=new Date(value);
 return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('pt-BR');
}
function Tile({title,value,note,source}:{title:string;value:string;note:string;source?:string}){
 return <div className="npx-kpi"><span>{title}</span><strong>{value}</strong><small>{note}</small>{source&&<em>{source}</em>}</div>;
}
function Panel({id,title,sub,action,children}:{id?:string;title:string;sub?:string;action?:ReactNode;children:ReactNode}){
 return <section id={id} className="npx-panel"><header className="npx-panel-heading"><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div>{action}</header>{children}</section>;
}
function Status({type,children}:{type:'ready'|'pending'|'manual';children:ReactNode}){
 return <span className={'npx-status npx-status-'+type}>{children}</span>;
}
export default function NexaPremiumDashboard({
 token,displayName,overview,accounts,movements,consents,onOpenSection,onOpenAgent,onRefresh
}:Props){
 const [studio,setStudio]=useState<Studio|null>(null);
 const [providers,setProviders]=useState<Providers|null>(null);
 const [life,setLife]=useState<Life|null>(null);
 const [loading,setLoading]=useState(true);
 const [failed,setFailed]=useState(false);
 const [question,setQuestion]=useState('');
 const [mayaFeedback,setMayaFeedback]=useState('');
 const [reload,setReload]=useState(0);
 const activeToken=useRef(token);activeToken.current=token;
 const refresh=useCallback(()=>{setReload(n=>n+1);onRefresh();},[onRefresh]);

 useEffect(()=>{
  const controller=new AbortController();
  let active=true;
  setStudio(null);setProviders(null);setLife(null);
  setLoading(true);setFailed(false);
  const get=async<T,>(path:string):Promise<T>=>{
   const r=await fetch(API+path,{
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:controller.signal,cache:'no-store'
   });
   if(!r.ok)throw new Error('Dados indisponíveis');
   return await r.json() as T;
  };
  void Promise.allSettled([
   get<Studio>('/v1/personal/studio'),
   get<Providers>('/v1/personal/providers'),
   get<Life>('/v1/personal/life')
  ]).then(([s,p,l])=>{
   if(!active||activeToken.current!==token)return;
   if(s.status==='fulfilled')setStudio(s.value);
   if(p.status==='fulfilled')setProviders(p.value);
   if(l.status==='fulfilled')setLife(l.value);
   setFailed(s.status==='rejected'||p.status==='rejected'||l.status==='rejected');
  }).finally(()=>{if(active&&activeToken.current===token)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[token,reload]);

 const truth=buildPremiumFinancialTruth(overview,accounts,studio);
 const goals=studio?.goals.filter(g=>g.status==='active').slice(0,3)||[];
 const bills=studio?.bills.slice(0,4)||[];
 const declaredInvestments=studio?.wealth.filter(w=>w.kind==='asset'&&/invest|renda fixa|cdb|tesouro|a[cç][aã]o|fundo|fiis?|cripto/i.test(w.category+' '+w.name)).slice(0,3)||[];
 const consentsActive=consents.filter(c=>['active','authorised','authorized'].includes(c.status.toLowerCase())).length;
 const openJourneys=life?.intents.filter(i=>i.status==='planned').length;
 const opAvailable=providers?.openFinance.connectEnabled===true;
 const paymentEnabled=providers?.payments.initiationEnabled===true;
 // Even if a provider flag accidentally flips, this dashboard never performs
 // OAuth, financial transfers or wallet signatures.
 const shortcuts:ReadonlyArray<{title:string,caption:string,section?:Section,agent?:AgentId}>=[
  {title:'Organizar gastos',caption:'Orçamentos e extratos',section:'spending'},
  {title:'Revisar dívidas',caption:'Custo e renegociação',agent:'debt_review'},
  {title:'Planejar pagamentos',caption:'Vencimentos e revisão',agent:'payments'},
  {title:'Documentos e contratos',caption:'Checklist pessoal',agent:'contracts'},
  {title:'Compras e crédito',caption:'Comparar condições',agent:'shopping'},
  {title:'Agenda e prioridades',caption:'Jornadas e tarefas',section:'office'},
  {title:'Investimentos',caption:'Análise e pesquisa',section:'market'},
  {title:'Privacidade',caption:'Acessos e consentimentos',section:'privacy'}
 ];
 function askMaya(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const route=routeMayaIntent(question.trim());
  if(!route){setMayaFeedback('Não identifiquei o assunto. Tente: minhas dívidas, investimentos, metas ou conta a vencer. Não insira dados sensíveis.');return;}
  setQuestion('');
  setMayaFeedback('Encaminhando para '+route.label+'. Nenhum texto ou dado foi enviado para agentes externos.');
  if(route.destination.section==='agents')onOpenAgent(route.destination.agent);
  else onOpenSection(route.destination.section);
 }

 return <div className="npx-premium" data-testid="nexa-premium-dashboard">
  <div className="npx-topline"><span>NEXA · SUA VISÃO FINANCEIRA PREMIUM</span><Status type="pending">Prévia por convite · operações protegidas</Status></div>
  <section className="npx-hero" aria-label="Visão patrimonial Nexa">
   <div className="npx-hero-copy"><span className="npx-eyebrow">BEM-VINDO AO SEU ESPAÇO, {displayName.toLocaleUpperCase('pt-BR')}</span>
    <h2>Seu dinheiro, seu patrimônio. Mais tempo para viver.</h2>
    <p>Instituições, investimentos, dívidas, metas, cripto e serviços pessoais. Uma experiência integrada, com a Maya cuidando do próximo passo.</p>
    <div className="npx-hero-buttons">
     <button type="button" className="npx-main-action" onClick={()=>onOpenSection('money')}>Ver minhas contas</button>
     <button type="button" className="npx-glass-action" onClick={()=>onOpenSection('maya')}>Conversar com Maya</button>
    </div>
   </div>
   <div className="npx-hero-aside"><small>DISPONIBILIDADE VERIFICADA · BRL</small><strong>{money(truth.bank.minor)}</strong><span>{truth.bank.label}</span><small>{truth.bankVerified?'Saldo agregado somente de contas recentes e completas':'A conexão bancária completa ainda não está ativa'}</small></div>
  </section>

  <div className="npx-metrics">
   <Tile title="Disponível em bancos" value={money(truth.bank.minor)} note={truth.bank.label} source={truth.bankVerified?'Dado bancário conectado':'Ainda não verificado'}/>
   <Tile title="Saldos informados" value={money(truth.declared.minor)} note="Contas que você declarou" source="Manual · não bancário"/>
   <Tile title="Ativos declarados" value={money(truth.assetsMinor)} note="Patrimônio informado por você" source="Visão parcial"/>
   <Tile title="Dívidas declaradas" value={money(truth.debtsMinor)} note="Obrigações registradas por você" source="Visão parcial"/>
  </div>
  <div className="npx-contextline">
   <span>{accounts.length} conta(s) registrada(s) · {truth.connectedCount} conectada(s) · {consentsActive} consentimento(s) ativo(s) registrado(s)</span>
   <button type="button" onClick={refresh} disabled={loading}>{loading?'Atualizando…':'Atualizar visão'}</button>
  </div>
  {failed&&<p className="npx-note npx-warning" role="status">Algumas fontes da visão unificada não responderam. Valores ausentes não significam saldo zero. Use Atualizar visão para tentar novamente.</p>}
  <div className="npx-layout">
   <div className="npx-main-col">
    <Panel id="npx-financas" title="Suas instituições" sub="Dados reais importados ou informações inseridas por você" action={<button type="button" className="npx-link" onClick={()=>onOpenSection('money')}>Gerenciar contas</button>}>
     {accounts.length===0?<div className="npx-empty">Nenhuma conta cadastrada. Você pode começar manualmente enquanto o Open Finance é homologado.</div>:
      <div className="npx-list">{accounts.slice(0,5).map(a=><div className="npx-list-row" key={a.id}><div className="npx-symbol">▣</div><div><b>{a.institution_name}</b><small>{a.name} · {a.manually_reported?'Informado manualmente':a.fresh?'Atualização recente':'Dados pendentes'}</small></div><strong>{a.manually_reported||a.fresh?money(a.available_minor,a.currency):'—'}</strong></div>)}</div>}
     <div className="npx-integration-strip"><div><strong>Open Finance</strong><small>{opAvailable?'Conector assinalado no backend; aguarda validação da jornada':'Integração com parceiro em preparação; ainda não há conexão para iniciar'}</small></div><Status type={opAvailable?'manual':'pending'}>{opAvailable?'Revisão necessária':'Em integração'}</Status></div>
    </Panel>

    <div className="npx-half">
     <Panel id="npx-investimentos" title="Investimentos" sub="Posições declaradas e pesquisa sem execução" action={<button className="npx-link" type="button" onClick={()=>onOpenSection('market')}>Analisar</button>}>
      {!studio?<div className="npx-empty">Aguardando a fonte de investimentos e patrimônio informado.</div>:declaredInvestments.length?declaredInvestments.map(w=><div key={w.id} className="npx-mini-line"><span>{w.name}<small>Informado por você · {w.category}</small></span><b>{money(w.amount_minor,w.currency||'BRL')}</b></div>):
       <div className="npx-empty">Ainda não há investimentos declarados. As posições externas aparecerão após consentimento e integração de dados elegíveis.</div>}
      <p className="npx-fine">Sem negociação de ativos ou recomendação personalizada nesta prévia.</p>
     </Panel>
     <Panel id="npx-dividas" title="Dívidas e crédito" sub="Obrigações, parcelas e custo total" action={<button className="npx-link" type="button" onClick={()=>onOpenAgent('debt_review')}>Revisar</button>}>
      <div className="npx-big-number">{money(truth.debtsMinor)}</div><p className="npx-fine">Apenas obrigações declaradas. Empréstimos e cartões de outras instituições dependem de conexão e autorização.</p>
      <button type="button" className="npx-secondary" onClick={()=>onOpenSection('wealth')}>Organizar meu patrimônio</button>
     </Panel>
    </div>

    <Panel id="npx-activity" title="Últimas movimentações" sub="Extratos importados ou registros próprios" action={<button className="npx-link" type="button" onClick={()=>onOpenSection('spending')}>Ver extrato</button>}>
     {movements.length===0?<div className="npx-empty">Nenhuma movimentação ainda. Importe um extrato ou aguarde a conexão autorizada.</div>:
      <div className="npx-list">{movements.slice(0,5).map(m=><div key={m.id} className="npx-list-row"><div className="npx-symbol">↗</div><div><b>{m.description}</b><small>{m.institution_name} · {date(m.booked_at)}</small></div><strong>{money(m.amount_minor,m.currency)}</strong></div>)}</div>}
    </Panel>

    <Panel id="npx-life" title="Vida organizada pela Nexa" sub="Capacidades pessoais reaproveitadas do ecossistema NexOffices">
     <div className="npx-services">{shortcuts.map(s=><button type="button" className="npx-service" key={s.title}
      onClick={()=>s.agent?onOpenAgent(s.agent):s.section&&onOpenSection(s.section)}>
      <b>{s.title}</b><small>{s.caption}</small><span>Explorar</span></button>)}</div>
     <p className="npx-fine">Serviços de organização e análise não equivalem a crédito concedido, assessoria regulada, assinatura ou execução de pagamentos.</p>
    </Panel>
   </div>

   <div className="npx-side-col">
    <Panel id="npx-wallet" title="Nexa Wallet & Cripto" sub="Sua Wallet existente, sem criar outra sessão ou carteira automaticamente">
     <div className="npx-wallet-card"><span>◈ NEXA WALLET</span><strong>Seu saldo cripto</strong><b>Consultar na Wallet</b><small>Privy e carteiras externas exigem autenticação independente.</small></div>
     <div className="npx-wallet-actions">
      <a className="npx-secondary" href={WALLET_URL} target="_blank" rel="noopener noreferrer">Abrir Wallet</a>
      <a className="npx-secondary" href={WALLET_SIGNUP} target="_blank" rel="noopener noreferrer">Criar conta Wallet</a>
      <button className="npx-link" type="button" onClick={()=>onOpenSection('crypto')}>MetaMask e outras carteiras · status</button>
     </div><Status type="pending">Saldo Privy não sincronizado nesta tela</Status>
    </Panel>

    <Panel id="npx-maya" title="Maya · Sua concierge financeira" sub="Uma porta de entrada para os especialistas da Nexa">
     <form onSubmit={askMaya} className="npx-maya-form"><label htmlFor="npx-maya-query">O que deseja resolver?</label><input id="npx-maya-query" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={180} placeholder="Ex.: organizar dívidas ou revisar investimentos" autoComplete="off"/><button type="submit" className="npx-main-action">Encontrar especialista</button></form>
     {mayaFeedback&&<p className="npx-fine" role="status">{mayaFeedback}</p>}
     <p className="npx-fine">Direcionamento local, sem transmissão da mensagem a um modelo externo. Pagamentos e transferências exigirão consentimento e confirmação específica.</p>
    </Panel>

    <Panel id="npx-alertas" title="Próximos compromissos" sub="Lembretes cadastrados, não cobranças verificadas" action={<button className="npx-link" type="button" onClick={()=>onOpenSection('planning')}>Organizar</button>}>
     {!studio?<div className="npx-empty">Aguardando os lembretes de contas e vencimentos.</div>:bills.length===0?<div className="npx-empty">Nenhuma conta a vencer cadastrada.</div>:
      bills.map(b=><div className="npx-mini-line" key={b.id}><span>{b.name}<small>Data informada: {date(b.next_due_on)}</small></span><b>{money(b.amount_minor)}</b></div>)}
     {typeof openJourneys==='number'&&<p className="npx-fine">{openJourneys} jornada(s) pessoal(is) planejada(s).</p>}
    </Panel>
    <Panel id="npx-metas" title="Seus objetivos" sub="Metas com acompanhamento pessoal" action={<button className="npx-link" type="button" onClick={()=>onOpenSection('planning')}>Ver metas</button>}>
     {!studio?<div className="npx-empty">Aguardando suas metas e objetivos.</div>:goals.length===0?<div className="npx-empty">Defina sua primeira meta e acompanhe o progresso.</div>:
      goals.map(g=><div className="npx-goal" key={g.id}><div className="npx-mini-line"><span>{g.name}</span><b>{money(g.saved_minor)} / {money(g.target_minor)}</b></div><div className="npx-progress"><span style={{width:String(Math.min(100,Math.max(0,Number(BigInt(g.saved_minor)*100n/BigInt(g.target_minor||'1')))))+'%'}}/></div></div>)}
    </Panel>
    <Panel id="npx-privacy" title="Privacidade e autonomia" sub="Você controla o que compartilha">
     <div className="npx-privacy-row"><span>Consentimentos registrados</span><b>{consents.length}</b></div>
     <div className="npx-privacy-row"><span>Pagamentos automáticos</span><Status type="pending">{paymentEnabled?'Bloqueados nesta visão':'Desativados'}</Status></div>
     <div className="npx-privacy-row"><span>Uso de credenciais da Wallet</span><Status type="ready">Separado</Status></div>
     <p className="npx-fine">Integração bancária, acesso à Wallet e ações agenticas precisam de permissões independentes. Nenhuma credencial é transferida por este painel.</p>
     <button className="npx-secondary" type="button" onClick={()=>onOpenSection('privacy')}>Gerenciar privacidade</button>
    </Panel>
   </div>
  </div>
  <footer className="npx-disclaimer">Nexa PF · Visão unificada de organização financeira. Dados declarados são parciais. Os produtos de terceiros permanecem nas instituições de origem. Nenhuma custódia, ordem de pagamento, operação de crédito ou investimento é criada por esta tela.</footer>
 </div>;
}
