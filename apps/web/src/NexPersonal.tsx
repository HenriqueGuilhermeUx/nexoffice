import {useCallback,useEffect,useState,type FormEvent} from 'react';
import './nex-personal.css';

const API=(import.meta as any).env?.VITE_API_URL||'http://localhost:4000';
const TOKEN_KEY='nex.personal.token';
type PersonalMe={user:{id:string;name:string;email:string};activated:boolean};
type Overview={
  currency:string;connectedAccounts:number;freshAccounts:number;
  availableMinor:string|null;spentThisMonthMinor:string|null;
  lastBalanceAt:string|null;incomplete:boolean;custodial:false;
  maya:{status:string;message:string}
};
type Account={id:string;institution_name:string;name:string;account_type:string;currency:string;current_minor:string|null;available_minor:string|null;balance_as_of:string|null;status:string;fresh:boolean};
type Movement={id:string;description:string;amount_minor:string;currency:string;category:string|null;booked_at:string;institution_name:string};
type Consent={id:string;purpose:string;status:string;created_at:string;expires_at:string|null};

async function request<T>(path:string,options:RequestInit={},token=sessionStorage.getItem(TOKEN_KEY)||''):Promise<T>{
  const headers=new Headers(options.headers||{});
  headers.set('content-type','application/json');
  if(token)headers.set('authorization','Bearer '+token);
  const response=await fetch(API+path,{...options,headers});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.message||body.error||'Não foi possível carregar seus dados.');
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
  const [me,setMe]=useState<PersonalMe|null>(null);
  const [overview,setOverview]=useState<Overview|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [movements,setMovements]=useState<Movement[]>([]);
  const [consents,setConsents]=useState<Consent[]>([]);
  const [section,setSection]=useState<'today'|'money'|'spending'|'privacy'>('today');
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);

  const refresh=useCallback(async(currentToken:string)=>{
    const p=await request<PersonalMe>('/v1/personal/me',{},currentToken);
    setMe(p);
    if(p.activated){
      const [ov,acc,mov,co]=await Promise.all([
        request<Overview>('/v1/personal/overview',{},currentToken),
        request<{accounts:Account[]}>('/v1/personal/accounts',{},currentToken),
        request<{transactions:Movement[]}>('/v1/personal/transactions',{},currentToken),
        request<{consents:Consent[]}>('/v1/personal/consents',{},currentToken)
      ]);
      setOverview(ov);setAccounts(acc.accounts);setMovements(mov.transactions);setConsents(co.consents);
    }
  },[]);

  useEffect(()=>{
    if(!token){setReady(true);return;}
    setReady(false);
    void refresh(token).catch(()=>{
      sessionStorage.removeItem(TOKEN_KEY);setToken('');setMe(null);setError('Entre novamente para acessar suas finanças.');
    }).finally(()=>setReady(true));
  },[refresh,token]);

  async function submitAuth(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    const data=new FormData(e.currentTarget);
    const payload={email:String(data.get('email')||''),password:String(data.get('password')||'')};
    const path=mode==='register'?'/v1/personal/auth/register':'/v1/auth/login';
    try{
      const response=await request<{token:string}>(path,{method:'POST',body:JSON.stringify(mode==='register'?{...payload,name:String(data.get('name')||'')}:payload)},'');
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
  function logout(){
    sessionStorage.removeItem(TOKEN_KEY);setToken('');setMe(null);setOverview(null);setAccounts([]);setMovements([]);setConsents([]);
  }

  if(!ready)return <div className="np-root np-center">Carregando seu espaço pessoal…</div>;
  if(!token)return <div className="np-root np-auth">
    <main className="np-auth-card">
      <div className="np-brand"><span className="np-mark">N</span> Nex <strong>Personal</strong></div>
      <div className="np-auth-kicker">Todos os seus bancos. Uma só inteligência.</div>
      <h1>Sua vida financeira merece clareza.</h1>
      <p>Organize contas, acompanhe gastos e tome decisões mais inteligentes. Seu dinheiro permanece nos seus bancos.</p>
      <form onSubmit={submitAuth}>
        {mode==='register'&&<label>Seu nome<input name="name" type="text" autoComplete="name" required minLength={2}/></label>}
        <label>E-mail<input name="email" type="email" autoComplete="email" required/></label>
        <label>Senha<input name="password" type="password" autoComplete={mode==='register'?'new-password':'current-password'} minLength={mode==='register'?8:1} required/></label>
        {error&&<div className="np-error" role="alert">{error}</div>}
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
      {([['today','Hoje'],['money','Meu Dinheiro'],['spending','Gastos'],['privacy','Privacidade']] as const).map(([key,title])=>
        <button key={key} className={'np-nav '+(section===key?'np-active':'')} onClick={()=>setSection(key)}>{title}</button>)}
      <div className="np-sidebar-bottom"><span>Seus recursos continuam nas instituições conectadas.</span><button className="np-text-button" onClick={logout}>Sair</button></div>
    </aside>
    <main className="np-main">
      <header className="np-top"><div><div className="np-kicker">NEX PERSONAL · VISÃO UNIFICADA</div><h1>Olá, {displayName}.</h1><p>Entenda seu dinheiro. Decida com tranquilidade.</p></div><span className="np-pill">Modo leitura</span></header>
      {error&&<div className="np-error" role="alert">{error}</div>}
      {section==='today'&&<>
        <div className="np-stats">
          <div className="np-stat"><span>Disponível nas contas</span><strong>{money(overview?.availableMinor)}</strong><small>{overview?.incomplete?'Aguardando saldos atualizados de todas as contas':'Saldos informados pelas instituições'}</small></div>
          <div className="np-stat"><span>Contas conectadas</span><strong>{overview?.connectedAccounts??'—'}</strong><small>Instituições verificadas</small></div>
          <div className="np-stat"><span>Gastos neste mês</span><strong>{money(overview?.spentThisMonthMinor)}</strong><small>{overview?.incomplete?'Aguardando conexão e sincronização':'Movimentações importadas'}</small></div>
        </div>
        <section className="np-panel np-maya"><div className="np-maya-avatar">M</div><div><span className="np-kicker">MAYA · SUA INTELIGÊNCIA FINANCEIRA</span><h2>Seu próximo passo, com base em dados.</h2><p>{overview?.maya.message}</p><small>A Maya não cria números nem executa transações sem sua autorização.</small></div></section>
        <section className="np-panel"><div className="np-panel-head"><div><h2>Suas instituições</h2><p>Uma visão consolidada, sem transferir sua custódia.</p></div><span className="np-pill">Open Finance</span></div>
          {accounts.length===0?<div className="np-empty"><strong>Suas contas ainda não estão conectadas.</strong><p>A integração segura com o provedor Open Finance está em preparação. Nenhum saldo fictício será exibido.</p><button disabled className="np-primary">Conectar instituição · em breve</button></div>:
            <div className="np-account-list">{accounts.slice(0,6).map(a=><div key={a.id} className="np-line"><span><strong>{a.institution_name}</strong><small>{a.name}</small></span><span><strong>{a.fresh?money(a.available_minor,a.currency):'Aguardando atualização'}</strong><small>Atualizado em {when(a.balance_as_of)}</small></span></div>)}</div>}
        </section>
      </>}
      {section==='money'&&<section className="np-panel"><h2>Meu Dinheiro</h2><p>Contas e movimentações importadas — somente consulta.</p>
        {accounts.map(a=><div key={a.id} className="np-line"><span><strong>{a.institution_name} · {a.name}</strong><small>{a.account_type}</small></span><span><strong>{a.fresh?money(a.available_minor,a.currency):'Saldo desatualizado'}</strong><small>{when(a.balance_as_of)}</small></span></div>)}
        <h3>Últimas movimentações</h3>{movements.length===0?<p className="np-empty">Sem movimentações importadas. Aguardando conexão Open Finance.</p>:movements.map(m=><div key={m.id} className="np-line"><span><strong>{m.description}</strong><small>{m.institution_name} · {when(m.booked_at)}</small></span><strong>{money(m.amount_minor,m.currency)}</strong></div>)}
      </section>}
      {section==='spending'&&<section className="np-panel"><h2>Gastos e planejamento</h2><p>O orçamento pessoal será calculado apenas quando existirem transações financeiras verificadas.</p><div className="np-stat"><span>Saídas do mês</span><strong>{money(overview?.spentThisMonthMinor)}</strong></div><p>Em breve: categorias, assinaturas, metas e previsões da Maya.</p></section>}
      {section==='privacy'&&<section className="np-panel"><h2>Privacidade e consentimentos</h2><p>Seus dados PF não são compartilhados com nenhum workspace empresarial. Ofertas personalizadas e compartilhamento com parceiros dependem de autorizações separadas.</p>
        {consents.length===0?<p className="np-empty">Nenhum consentimento registrado. A conexão Open Finance permanece indisponível até a integração real.</p>:consents.map(c=><div key={c.id} className="np-line"><strong>{c.purpose}</strong><span>{c.status} · {when(c.created_at)}</span></div>)}
        <p className="np-footnote">Não vendemos sua base de dados. O Nex Personal não é banco nem custodiante.</p>
      </section>}
    </main>
  </div>;
}
