import {useEffect,useState,type FormEvent} from 'react';
import {api,post,session} from './api';

type BillingSummary={
  planName:string;priceMinor:number;currency:string;status:string;access:boolean;trialEndsAt:string;trialDaysRemaining:number;billingConfigured:boolean;
  workspace:{id:string;name:string};user:{name:string;email:string};providerSubscriptionId?:string|null;
};
type Checkout={provider:string;globalID:string;journey:string;emv?:string|null;pixRecurringStatus?:string|null};

const money=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100);

export default function BillingCenter(){
  const [billing,setBilling]=useState<BillingSummary|null>(null);
  const [open,setOpen]=useState(false);
  const [checkout,setCheckout]=useState<Checkout|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    if(!session.token())return;
    try{setBilling(await api<BillingSummary>('/v1/billing/summary'))}catch{}
  }
  useEffect(()=>{load();const id=setInterval(load,30000);return()=>clearInterval(id)},[]);
  if(!session.token()||!billing)return null;
  if(billing.status==='active'||billing.status==='exempt')return null;

  const expired=!billing.access;
  const label=billing.status==='pending_activation'?'Assinatura aguardando autorização':expired?'Seu teste grátis terminou':`${billing.trialDaysRemaining} dia${billing.trialDaysRemaining===1?'':'s'} grátis restante${billing.trialDaysRemaining===1?'':'s'}`;

  async function subscribe(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    const f=new FormData(e.currentTarget);const value=(k:string)=>String(f.get(k)||'').trim();
    try{
      const r=await post<any>('/v1/billing/subscribe',{customer:{name:value('name'),taxID:value('taxID').replace(/\D/g,''),email:value('email'),phone:value('phone').replace(/\D/g,''),address:{zipcode:value('zipcode').replace(/\D/g,''),street:value('street'),number:value('number'),neighborhood:value('neighborhood'),city:value('city'),state:value('state').toUpperCase(),complement:value('complement')||undefined}}});
      if(r.checkout)setCheckout(r.checkout);await load();
    }catch(err:any){setError(err?.message||'Não foi possível iniciar a assinatura.')}finally{setBusy(false)}
  }
  async function refresh(){setBusy(true);setError('');try{await post('/v1/billing/refresh',{});await load();if((await api<BillingSummary>('/v1/billing/summary')).status==='active'){setOpen(false);setCheckout(null);location.reload()}}catch(err:any){setError(err?.message||'Ainda não identificamos a autorização.')}finally{setBusy(false)}}
  async function copy(){if(checkout?.emv)await navigator.clipboard.writeText(checkout.emv)}

  return <>
    <div className={`billingBanner ${expired?'billingExpired':''}`}>
      <div><b>{label}</b><span>{billing.planName} · {money(billing.priceMinor)}/mês · cancele quando quiser</span></div>
      <button onClick={()=>setOpen(true)}>{billing.status==='pending_activation'?'Finalizar assinatura':'Assinar NexOffice Pro'}</button>
    </div>
    {open&&<div className="billingBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="billingModal">
      <button className="billingClose" onClick={()=>setOpen(false)}>×</button>
      <p className="billingEyebrow">NEXOFFICE PRO</p><h2>Continue operando seu negócio por {money(billing.priceMinor)}/mês</h2>
      <p className="billingLead">CRM, financeiro, agenda, Central de Comando, Equipe Digital, documentos, automações e integrações em um único sistema operacional.</p>
      {!billing.billingConfigured&&<div className="billingNotice">A cobrança Woovi ainda está em configuração neste ambiente. Seu trial continua normalmente.</div>}
      {error&&<div className="billingError">{error}</div>}
      {checkout?.emv?<div className="billingCheckout"><h3>Autorize o Pix Automático no seu banco</h3><p>Copie o código abaixo e abra seu aplicativo bancário. A cobrança começa no fim do trial; se o trial já terminou, a primeira mensalidade é paga na autorização.</p><textarea readOnly value={checkout.emv}/><div className="billingActions"><button onClick={copy}>Copiar código Pix</button><button className="billingPrimary" disabled={busy} onClick={refresh}>{busy?'Verificando…':'Já autorizei no banco'}</button></div></div>:
      <form className="billingForm" onSubmit={subscribe}>
        <div className="billingGrid"><label>Nome / razão social<input name="name" defaultValue={billing.user.name} required/></label><label>CPF ou CNPJ<input name="taxID" required/></label><label>E-mail<input name="email" type="email" defaultValue={billing.user.email} required/></label><label>Celular / WhatsApp<input name="phone" required/></label><label>CEP<input name="zipcode" required/></label><label>Rua<input name="street" required/></label><label>Número<input name="number" required/></label><label>Bairro<input name="neighborhood" required/></label><label>Cidade<input name="city" required/></label><label>UF<input name="state" maxLength={2} required/></label><label className="billingWide">Complemento<input name="complement"/></label></div>
        <div className="billingSummary"><span>Plano</span><b>{billing.planName}</b><span>Mensalidade</span><b>{money(billing.priceMinor)}</b><span>Trial</span><b>7 dias grátis</b></div>
        <button className="billingPrimary billingSubmit" disabled={busy||!billing.billingConfigured}>{busy?'Criando assinatura…':'Autorizar Pix Automático'}</button>
        <small>Sem cartão. Cobrança mensal via Pix Automático. Você pode cancelar quando quiser.</small>
      </form>}
    </div></div>}
  </>;
}
