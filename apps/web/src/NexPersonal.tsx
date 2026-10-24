import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import './nex-personal.css';
import NexPersonalStudio from './NexPersonalStudio';
import NexPersonalAgents,{type AgentId} from './NexPersonalAgents';
import NexPersonalLifeOffice from './NexPersonalLifeOffice';
import PersonalPrivacyCenter from './PersonalPrivacyCenter';

const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true' ? '' : ((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');
const TOKEN_KEY='nex.personal.token';
const PREVIEW=(import.meta as any).env?.VITE_PERSONAL_STAGING==='true';
type PersonalMe={user:{id:string;name:string;email:string};activated:boolean};
type Overview={
  currency:string;connectedAccounts:number;freshAccounts:number;manualAccounts?:number;manualAvailableMinor?:string|null;
  availableMinor:string|null;spentThisMonthMinor:string|null;
  lastBalanceAt:string|null;incomplete:boolean;custodial:false;
  maya:{status:string;message:string}
};
type Account={id:string;institution_name:string;name:string;account_type:string;currency:string;current_minor:string|null;available_minor:string|null;balance_as_of:string|null;status:string;fresh:boolean;provider:string;manually_reported:boolean};
type Movement={id:string;description:string;amount_minor:string;currency:string;category:string|null;booked_at:string;institution_name:string};
type Consent={id:string;purpose:string;status:string;created_at:string;expires_at:string|null};

class PersonalRequestError extends Error {
  constructor(message:string,readonly status:number){super(message);this.name='PersonalRequestError';}
}
async function request<T>(path:string,options:RequestInit={},token=sessionStorage.getItem(TOKEN_KEY)||''):Promise<T>{
  const headers=new Headers(options.headers||{});
  headers.set('content-type','application/json');
  if(token)headers.set('authorization','Bearer '+token);
  let response:Response;
  try{response=await fetch(API+path,{...options,headers});}
  catch{throw new PersonalRequestError('Não foi possível conectar ao Nex Personal. Verifique sua conexão e tente novamente.',0);}
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new PersonalRequestError(body.message||body.error||'Não foi possível carregar seus dados.',response.status);
  return body as T;
}
function money(value:string|null|undefined,currency='BRL'){
  if(value===null||value===undefined)return '—';
  try{
    const minor=BigInt(value),absolute=minor<0n?-minor:minor;
    const whole=absolute/100n,cents=(absolute%100n).toString().padStart(2,'0');
    const sign=minor<0n?'-':'';
    return sign+(currency==='BRL'?'R$ ':currency+' ')+whole.toLocaleString('pt-BR')+','+cents;
  }catch{return '—'}
}
function when(value:string|null|undefined){
  return value?new Date(value).toLocaleDateString('pt-BR'):'—';
}

export default function NexPersonal(){
  const [token,setToken]=useState(()=>sessionStorage.getItem(TOKEN_KEY)||'');
  // Async replies from an old account must never repopulate the new session.
  const activeTokenRef=useRef(token);
  const [me,setMe]=useState<PersonalMe|null>(null);
  const [overview,setOverview]=useState<Overview|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [movements,setMovements]=useState<Movement[]>([]);
  const [consents,setConsents]=useState<Consent[]>([]);
  const [section,setSection]=useState<'office'|'today'|'money'|'spending'|'planning'|'wealth'|'agents'|'maya'|'privacy'>('office');
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [initialSpecialist,setInitialSpecialist]=useState<AgentId>('expenses');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);

  const refresh=useCallback(async(currentToken:string)=>{
    const p=await request<PersonalMe>('/v1/personal/me',{},currentToken);
    if(activeTokenRef.current!==currentToken)return;
    setMe(p);
    if(p.activated){
      const [ov,acc,mov,co]=await Promise.all([
        request<Overview>('/v1/personal/overview',{},currentToken),
        request<{accounts:Account[]}>('/v1/personal/accounts',{},currentToken),
        request<{transactions:Movement[]}>('/v1/personal/transactions',{},currentToken),
        request<{consents:Consent[]}>('/v1/personal/consents',{},currentToken)
      ]);
      if(activeTokenRef.current!==currentToken)return;
      setOverview(ov);setAccounts(acc.accounts);setMovements(mov.transactions);setConsents(co.consents);
    }
  },[]);

  useEffect(()=>{
    if(!token){setReady(true);return;}
    activeTokenRef.current=token;
    setReady(false);
    void refresh(token).then(()=>{
      if(activeTokenRef.current===token)setError('');
    }).catch((err:unknown)=>{
      if(activeTokenRef.current!==token)return;
      if(err instanceof PersonalRequestError&&err.status===401){
        clearLocalSession();
        setError('Sua sessão expirou. Entre novamente para acessar suas finanças.');
      }else{
        // Network failures / provider cold-starts do not invalidate tokens.
        setError('Não conseguimos atualizar seus dados agora. Seu login foi mantido; tente novamente.');
      }
    }).finally(()=>{if(activeTokenRef.current===token)setReady(true);});
  },[refresh,token]);

  async function submitAuth(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    const data=new FormData(e.currentTarget);
    const payload={email:String(data.get('email')||''),password:String(data.get('password')||'')};
    const path=mode==='register'?'/v1/personal/auth/register':'/v1/auth/login';
    try{
      const response=await request<{token:string}>(path,{method:'POST',body:JSON.stringify(mode==='register'?{...payload,name:String(data.get('name')||''),...(PREVIEW?{previewInviteCode:String(data.get('previewInviteCode')||'')}:{} )}:payload)},'');
      activeTokenRef.current=response.token;
      sessionStorage.setItem(TOKEN_KEY,response.token);setToken(response.token);
    }catch(err){setError(err instanceof Error?err.message:'Falha de autenticação.');}
    finally{setBusy(false);}
  }
  async function activate(){
    setBusy(true);setError('');
    try{await request('/v1/personal/activate',{method:'POST',body:'{}'},token);await refresh(token);}
    catch(err){setError(err instanceof Error?err.message:'Não foi possível ativar o perfil.');}
    finally{setBusy(false);}
  }
  function clearLocalSession(){
    activeTokenRef.current='';
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');setMe(null);setOverview(null);setAccounts([]);setMovements([]);setConsents([]);
  }
  function logout(){
    const endingToken=token;
    clearLocalSession();
    setError('');
    if(endingToken)void request('/v1/auth/logout',{method:'POST',body:'{}'},endingToken)
      .catch(()=>{
        if(activeTokenRef.current==='')setError('Você saiu deste navegador, mas não foi possível confirmar a revogação da sessão no servidor.');
      });
  }
  async function retryLoading(){
    if(!token||busy)return;
    setReady(false);setError('');
    try{
      await refresh(token);
      if(activeTokenRef.current===token)setError('');
    }catch(err){
      if(activeTokenRef.current!==token)return;
      if(err instanceof PersonalRequestError&&err.status===401){
        clearLocalSession();
        setError('Sua sessão expirou. Entre novamente.');
      }else setError('Não conseguimos atualizar seus dados. Seu login continua salvo; tente novamente.');
    }finally{
      // An older retry may finish after logout or a different account login.
      // Never mark the newer account's loading state as ready.
      if(activeTokenRef.current===token)setReady(true);
    }
  }

  if(!ready)return <div className="np-root np-center">Carregando seu espaço pessoal…</div>;
  if(token&&!me)return <div className="np-root np-auth"><main className="np-auth-card">
    <div className="np-brand"><span className="np-mark">N</span> Nex <strong>Personal</strong></div>
    <h1>Não foi possível carregar seu espaço.</h1>
    <p>{error||'A conexão foi interrompida. Seu login continua salvo neste navegador.'}</p>
    <button className="np-primary" onClick={()=>void retryLoading()}>Tentar novamente</button>
    <button className="np-text-button" onClick={logout}>Sair deste navegador</button>
  </main></div>;
  if(!token)return <div className="np-root np-auth">
    <main className="np-auth-card">
      <div className="np-brand"><span className="np-mark">N</span> Nex <strong>Personal</strong></div>
      <div className="np-auth-kicker">Sua vida mais simples. Seu tempo de volta.</div>
      <h1>Uma equipe para facilitar a sua vida.</h1>
      <p>Dinheiro, compras, planejamento, documentos, família e mais. Escolha o que importa para você. Seus dados permanecem separados e sob seu controle.</p>
      <form onSubmit={submitAuth}>
        {mode==='register'&&<label>Seu nome<input name="name" type="text" autoComplete="name" required minLength={2}/></label>}
        {mode==='register'&&PREVIEW&&<label>Código de convite para homologação<input name="previewInviteCode" type="password" autoComplete="off" minLength={8} maxLength={128} required/></label>}
        <label>E-mail<input name="email" type="email" autoComplete="email" required/></label>
        <label>Senha<input name="password" type="password" autoComplete={mode==='register'?'new-password':'current-password'} minLength={mode==='register'?8:1} required/></label>
        {error&&<div className="np-error" role="alert">{error} <button type="button" className="np-text-button" onClick={()=>void retryLoading()}>Tentar atualizar</button></div>}
        <button className="np-primary" type="submit" disabled={busy}>{busy?'Processando…':mode==='register'?'Criar meu espaço':'Entrar no Nex Personal'}</button>
      </form>
      <button className="np-text-button" onClick={()=>{setMode(mode==='register'?'login':'register');setError('');}}>
        {mode==='register'?'Já tenho uma conta':'Criar uma conta pessoal'}
      </button>
      <small>Sem custódia de recursos. Nenhuma conta bancária será aberta ao se cadastrar.</small>
    </main>
  </div>;

  if(me&&!me.activated)return <div className="np-root np-auth"><main className="np-auth-card">
    <div className="np-brand"><span className="np-mark">N</span> Nex <strong>Personal</strong></div>
    <h1>Ative seu espaço pessoal</h1>
    <p>Sua identidade já existe. Vamos criar um contexto financeiro PF separado das suas empresas, sem copiar dados.</p>
    {error&&<div className="np-error" role="alert">{error}</div>}
    <button className="np-primary" disabled={busy} onClick={()=>void activate()}>{busy?'Ativando…':'Ativar Nex Personal'}</button>
    <button className="np-text-button" onClick={logout}>Sair</button>
  </main></div>;

  const displayName=me?.user.name.split(' ')[0]||'';
  return <div className="np-root np-shell">
    <aside className="np-sidebar">
      <div className="np-brand"><span className="np-mark">N</span> Nex <strong>Personal</strong></div>
      <div className="np-nav-label">SEU ESPAÇO</div>
      {([['office','Meu escritório 2D'],['today','Hoje'],['money','Meu Dinheiro'],['spending','Gastos'],['planning','Metas & Contas'],['wealth','Patrimônio'],['agents','Agentes especializados'],['maya','Maya · Coordenadora'],['privacy','Privacidade']] as const).map(([key,title])=>
        <button key={key} className={'np-nav '+(section===key?'np-active':'')} onClick={()=>setSection(key)}>{title}</button>)}
      <div className="np-sidebar-bottom"><span>O Nex Personal não mantém custódia de dinheiro.</span><button className="np-text-button" onClick={logout}>Sair</button></div>
    </aside>
    <main className="np-main">
      <header className="np-top"><div><div className="np-kicker">NEX PERSONAL · SUA VIDA, UM SÓ LUGAR</div><h1>Olá, {displayName}.</h1><p>Sua vida mais simples. Seu tempo de volta.</p></div><span className="np-pill">Sem transferências reais</span></header>
      {error&&<div className="np-error" role="alert">{error}</div>}
      {section==='office'&&<NexPersonalLifeOffice token={token} onOpenSection={setSection} onOpenAgent={(agent)=>{setInitialSpecialist(agent);setSection('agents');}}/>}
      {section==='today'&&<>
        <div className="np-stats">
          <div className="np-stat"><span>{overview?.availableMinor!==null&&overview?.availableMinor!==undefined?'Disponível conectado':'Saldo declarado'}</span><strong>{money(overview?.availableMinor??overview?.manualAvailableMinor)}</strong><small>{overview?.availableMinor!==null&&overview?.availableMinor!==undefined?'Saldo informado pelas instituições':'Informado por você · sem verificação bancária'}</small></div>
          <div className="np-stat"><span>Contas organizadas</span><strong>{(overview?.connectedAccounts??0)+(overview?.manualAccounts??0)}</strong><small>{overview?.manualAccounts??0} manuais · {overview?.connectedAccounts??0} conectadas</small></div>
          <div className="np-stat"><span>Gastos neste mês</span><strong>{money(overview?.spentThisMonthMinor)}</strong><small>Movimentações que você registrou ou importou · visão parcial</small></div>
        </div>
        <section className="np-panel np-agents-spotlight">
          <div><span className="np-kicker">SUA EQUIPE DE ESPECIALISTAS</span><h2>11 especialistas. Uma visão integrada.</h2>
            <p>Gastos, investimentos, compras, dívidas, serviços públicos, orientação jurídica e outras áreas. A Maya coordena sua equipe.</p>
            <small>Hoje: diagnósticos e simulações sobre informações declaradas · ações financeiras reais indisponíveis.</small>
          </div><button type="button" className="np-primary" onClick={()=>setSection('agents')}>Conhecer meus agentes →</button>
        </section>
        <section className="np-panel np-maya"><div className="np-maya-avatar">M</div><div><span className="np-kicker">MAYA · COORDENADORA DOS ESPECIALISTAS</span><h2>Comece pelos dados e escolha seu agente.</h2><p>{overview?.maya.message}</p><small>A equipe não realiza transações nesta homologação.</small></div></section>
        <section className="np-panel"><div className="np-panel-head"><div><h2>Suas instituições</h2><p>Uma visão consolidada, sem transferir sua custódia.</p></div><span className="np-pill">Manual agora · Open Finance depois</span></div>
          {accounts.length===0?<div className="np-empty"><strong>Suas contas ainda não estão conectadas.</strong><p>A integração segura com o provedor Open Finance está em preparação. Nenhum saldo fictício será exibido.</p><button className="np-primary" onClick={()=>setSection('money')}>Adicionar conta manual</button></div>:
            <div className="np-account-list">{accounts.slice(0,6).map(a=><div key={a.id} className="np-line"><span><strong>{a.institution_name}</strong><small>{a.name}</small></span><span><strong>{a.manually_reported?money(a.available_minor,a.currency):a.fresh?money(a.available_minor,a.currency):'Aguardando atualização'}</strong><small>{a.manually_reported?'Informado por você':'Atualizado em '+when(a.balance_as_of)}</small></span></div>)}</div>}
        </section>
      </>}
      {section==='money'&&<NexPersonalStudio view="money" token={token} onChanged={()=>void refresh(token)}/>}
      {section==='spending'&&<NexPersonalStudio view="spending" token={token} onChanged={()=>void refresh(token)}/>}
      {section==='planning'&&<NexPersonalStudio view="planning" token={token} onChanged={()=>void refresh(token)}/>}
      {section==='wealth'&&<NexPersonalStudio view="wealth" token={token} onChanged={()=>void refresh(token)}/>}
      {section==='agents'&&<NexPersonalAgents key={initialSpecialist} token={token} initialAgent={initialSpecialist} onOpenSection={setSection}/>}
            {section==='maya'&&<NexPersonalStudio view="maya" token={token} onChanged={()=>void refresh(token)}/>}
      {section==='privacy'&&<PersonalPrivacyCenter token={token}/>}
    </main>
  </div>;
}
