import {useEffect,useRef,useState} from 'react';
type Status={
 environment:'sandbox';provider:'belvo';institution:'ofmockbank_br_retail';
 credentialsConfigured?:boolean;widgetAvailable:boolean;simulatedData:true
};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'
 ?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');

/** Sandbox demonstration; never presented as a banking consent for real accounts. */
export default function NexaBelvoSandboxPanel({token}:{token:string}){
 const [status,setStatus]=useState<Status|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [widgetUrl,setWidgetUrl]=useState('');
 const [verification,setVerification]=useState<'idle'|'awaiting_webhook'|'verified_sandbox_consent'|'not_confirmed'|'unavailable'>('idle');
 const activeToken=useRef(token);activeToken.current=token;
 useEffect(()=>{
  const controller=new AbortController();
  setStatus(null);setWidgetUrl('');setVerification('idle');setError('');
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
    setVerification(result.status==='verified_sandbox_consent'?'verified_sandbox_consent'
     :result.status==='awaiting_webhook'?'awaiting_webhook':'not_confirmed');
   }
  }catch{
   if(activeToken.current===token){setVerification('unavailable');setError('Verificação indisponível. Nenhum saldo foi importado.');}
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
  {widgetUrl&&<a className="npx-secondary" href={widgetUrl} target="_blank" rel="noopener noreferrer">
   Abrir ambiente seguro da Belvo
  </a>}
  {error&&<small role="status">{error}</small>}
  <small>Mesmo após o retorno do widget, os dados só serão exibidos após validação de consentimento e webhook no servidor.</small>
 </div>;
}
