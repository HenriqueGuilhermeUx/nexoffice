import {useEffect,useRef,useState} from 'react';
type Status={
 environment:'sandbox';provider:'belvo';institution:'ofmockbank_br_retail';
 credentialsConfigured?:boolean;widgetAvailable:boolean;simulatedData:true;
 consentReview?:{status:'not_verified'|'verified_recent'|'review_required'|'verification_stale';verifiedAt:string|null}
};
type SandboxDemo={
 state:'sandbox_data'|'consent_recheck_required';source:'belvo_sandbox_demo';simulatedData:true;
 noCurrencyTotal:true;
 accounts:Array<{id:string;kind:string;balanceType:string;currency:'BRL'|null;currentMinor:string|null}>;
 transactions:Array<{id:string;kind:string;accountId:string;bookedAt:string|null;currency:'BRL'|null;amountMinor:string|null}>;
};
function displayMockMinor(minor:string|null,currency:'BRL'|null):string{
 if(!currency||minor===null||!/^[-]?\\d{1,16}$/.test(minor))return 'Valor não disponível';
 const amount=Number(minor)/100;
 if(!Number.isSafeInteger(Number(minor)))return 'Valor não disponível';
 return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(amount);
}
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'
 ?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');

/** Sandbox demonstration; never presented as a banking consent for real accounts. */
export default function NexaBelvoSandboxPanel({token}:{token:string}){
 const [status,setStatus]=useState<Status|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [widgetUrl,setWidgetUrl]=useState('');
 const [demo,setDemo]=useState<SandboxDemo|null>(null);
 const [verification,setVerification]=useState<'idle'|'awaiting_webhook'|'verified_sandbox_consent'|'not_confirmed'|'unavailable'>('idle');
 const activeToken=useRef(token);activeToken.current=token;
 useEffect(()=>{
  const controller=new AbortController();
  setStatus(null);setWidgetUrl('');setDemo(null);setVerification('idle');setError('');
  void fetch(API+'/v1/personal/belvo-sandbox/status',{
   method:'GET',headers:{authorization:'Bearer '+token},
   signal:controller.signal,cache:'no-store'
  }).then(async r=>{
   if(!r.ok)throw new Error('Indisponível');
   return await r.json() as Status;
  }).then(data=>{if(activeToken.current===token)setStatus(data);})
   .catch(()=>{if(activeToken.current===token&&!controller.signal.aborted)setError('Estado da homologação indisponível.');});
  return()=>controller.abort();
 },[token]);
 async function verify(){
  if(busy||!status?.widgetAvailable)return;
  setBusy(true);setError('');
  try{
   const response=await fetch(API+'/v1/personal/belvo-sandbox/verify',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({confirmSandbox:true})
   });
   if(!response.ok)throw new Error('Não foi possível verificar com a Belvo.');
   const result=await response.json() as {status?:string};
   if(activeToken.current===token){
    // After the explicit provider check, refresh owner-scoped status from the
    // backend instead of treating a browser success callback as proof.
    const current=await fetch(API+'/v1/personal/belvo-sandbox/status',{
      method:'GET',headers:{authorization:'Bearer '+token},cache:'no-store'
    });
    if(current.ok&&activeToken.current===token)
      setStatus(await current.json() as Status);
    setVerification(result.status==='verified_sandbox_consent'?'verified_sandbox_consent'
     :result.status==='awaiting_webhook'?'awaiting_webhook':'not_confirmed');
   }
  }catch{
   if(activeToken.current===token){setVerification('unavailable');setError('Verificação indisponível. Nenhum saldo foi importado.');}
  }finally{if(activeToken.current===token)setBusy(false);}
 }
 async function loadDemo(){
  if(busy||status?.consentReview?.status!=='verified_recent')return;
  setBusy(true);setError('');setDemo(null);
  try{
   const response=await fetch(API+'/v1/personal/belvo-sandbox/demo-data',{
    method:'GET',cache:'no-store',headers:{authorization:'Bearer '+token}
   });
   if(!response.ok)throw new Error('A demonstração do banco fictício não está disponível.');
   const data=await response.json() as SandboxDemo;
   if(data.source!=='belvo_sandbox_demo'||data.simulatedData!==true
    ||data.noCurrencyTotal!==true||!Array.isArray(data.accounts)
    ||!Array.isArray(data.transactions))
    throw new Error('Resposta de teste inválida.');
   if(activeToken.current===token)setDemo(data);
  }catch{
   if(activeToken.current===token)setError('Não foi possível ler os dados fictícios. Nenhum saldo foi importado.');
  }finally{if(activeToken.current===token)setBusy(false);}
 }
 async function connect(){
  if(busy||!status?.widgetAvailable)return;
  setBusy(true);setWidgetUrl('');setError('');
  try{
   const response=await fetch(API+'/v1/personal/belvo-sandbox/widget/start',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({confirmSandbox:true})
   });
   if(!response.ok)throw new Error('A conexão do banco fictício não pôde ser preparada.');
   const data=await response.json() as {widgetUrl?:unknown};
   if(typeof data.widgetUrl!=='string')throw new Error('Resposta inválida.');
   const parsed=new URL(data.widgetUrl);
   if(parsed.protocol!=='https:'||parsed.hostname!=='widget.belvo.io'
    ||parsed.searchParams.get('institutions')!=='ofmockbank_br_retail')
    throw new Error('URL de demonstração inválida.');
   if(activeToken.current===token)setWidgetUrl(parsed.toString());
  }catch(e){if(activeToken.current===token)setError(e instanceof Error?e.message:'Falha ao preparar teste.');}
  finally{if(activeToken.current===token)setBusy(false);}
 }
 return <div className="npx-belvo-sandbox" role="region" aria-label="Belvo banco fictício em homologação">
  <div><strong>Belvo Open Finance · banco fictício</strong>
   <small>Teste com dados simulados. Nenhuma instituição real ou pagamento é conectado aqui.</small></div>
  <span className="npx-status npx-status-pending">{status?.widgetAvailable?'Teste liberado':'Preparando conexão segura'}</span>
  {status?.consentReview&&<small role="status">{
   status.consentReview.status==='verified_recent'
    ?'Banco fictício: consentimento verificado recentemente na Belvo (sem saldo importado).'
   :status.consentReview.status==='review_required'
    ?'Consentimento fictício: alteração recebida. Nova verificação obrigatória.'
   :status.consentReview.status==='verification_stale'
    ?'Consentimento fictício: confirmação antiga. Verifique novamente.'
    :'Nenhum consentimento de demonstração verificado ainda.'
  }</small>}
  {status?.widgetAvailable&&<button type="button" className="npx-secondary" disabled={busy} onClick={()=>void connect()}>
   {busy?'Preparando…':'Testar banco fictício'}
  </button>}
  {status?.widgetAvailable&&<button className="npx-secondary" type="button"
   disabled={busy} onClick={()=>void verify()}>{busy?'Verificando…':'Verificar consentimento'}</button>}
  {verification!=='idle'&&<small role="status">{verification==='verified_sandbox_consent'
   ?'Consentimento do banco fictício confirmado na Belvo. Nenhum saldo foi importado.'
   :verification==='awaiting_webhook'?'Aguardando evento do banco fictício.'
   :verification==='not_confirmed'?'Consentimento ainda não confirmado pela Belvo.'
   :'Falha temporária na verificação.'}</small>}
  {status?.consentReview?.status==='verified_recent'&&status.widgetAvailable
   &&<button className="npx-secondary" type="button" disabled={busy}
    onClick={()=>void loadDemo()}>{busy?'Consultando…':'Ver contas e extratos fictícios'}</button>}
  {demo?.state==='consent_recheck_required'&&<small role="status">
    O consentimento precisa ser reconfirmado na Belvo. Nenhum dado importado.
   </small>}
  {demo?.state==='sandbox_data'&&<section className="npx-demo-results" aria-label="Dados simulados, excluídos do patrimônio real">
    <strong>DEMONSTRAÇÃO · dados fictícios, fora do seu patrimônio</strong>
    <small>Informações da Belvo Sandbox. Não entram nos saldos, investimentos ou dívidas reais.</small>
    <div className="npx-demo-list">
     {demo.accounts.length===0&&<small>Nenhuma conta fictícia disponível.</small>}
     {demo.accounts.slice(0,10).map(a=><div key={a.id} className="npx-demo-entry">
      <span>{a.kind} · {a.balanceType==='LIABILITY'?'Passivo':a.balanceType==='ASSET'?'Ativo':'Não classificado'}</span>
      <strong>{displayMockMinor(a.currentMinor,a.currency)}</strong>
     </div>)}
    </div>
    <small>Movimentações simuladas</small>
    <div className="npx-demo-list">
     {demo.transactions.length===0&&<small>Nenhuma movimentação fictícia disponível.</small>}
     {demo.transactions.slice(0,8).map(t=><div key={t.id} className="npx-demo-entry">
      <span>{t.kind}{t.bookedAt?' · '+new Date(t.bookedAt).toLocaleDateString('pt-BR'):''}</span>
      <strong>{displayMockMinor(t.amountMinor,t.currency)}</strong>
     </div>)}
    </div>
    <small>Sem total consolidado: não misturamos moedas, passivos, valores simulados e contas reais.</small>
   </section>}
  {widgetUrl&&<a className="npx-secondary" href={widgetUrl} target="_blank" rel="noopener noreferrer">
   Abrir ambiente seguro da Belvo
  </a>}
  {error&&<small role="status">{error}</small>}
  <small>Mesmo após o retorno do widget, os dados só serão exibidos após validação de consentimento e webhook no servidor.</small>
 </div>;
}
