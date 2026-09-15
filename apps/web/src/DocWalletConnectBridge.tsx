import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {post,session} from './api';

type Probe={ok?:boolean;status?:string;payload?:{workspaceConnected?:boolean;linkedUsers?:number};error?:string};

export default function DocWalletConnectBridge(){
  const [target,setTarget]=useState<Element|null>(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<'unknown'|'connected'|'disconnected'|'error'>('unknown');
  const [message,setMessage]=useState('');

  useEffect(()=>{
    const inspect=()=>{
      const dock=document.querySelector('.opsDock');
      const title=dock?.querySelector('.opsHead h3')?.textContent?.trim();
      const body=dock?.querySelector('.opsBody')||null;
      setTarget(title==='Integrações'?body:null);
    };
    inspect();
    const observer=new MutationObserver(inspect);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!target||!session.token()||!session.workspace())return;
    void probe();
    const onFocus=()=>void probe();
    window.addEventListener('focus',onFocus);
    return()=>window.removeEventListener('focus',onFocus);
  },[target]);

  async function probe(){
    try{
      const result=await post<Probe>('/v1/integrations/docwallet/probe',{});
      if(result.ok||result.status==='connected'){setStatus('connected');setMessage(result.payload?.linkedUsers?`${result.payload.linkedUsers} conta(s) DocWallet vinculada(s) a este workspace.`:'DocWallet conectado a este workspace.');return}
      if(result.status==='disconnected'){setStatus('disconnected');setMessage('Serviço disponível, mas este workspace ainda não foi autorizado no DocWallet.');return}
      setStatus('error');setMessage(result.error||'Não foi possível validar a conexão agora.');
    }catch(error:any){setStatus('error');setMessage(error?.message||'Não foi possível validar a conexão agora.')}
  }

  async function connect(){
    if(busy)return;
    const popup=window.open('about:blank','_blank');
    setBusy(true);setMessage('Gerando autorização segura…');
    try{
      const result=await post<{connectUrl:string;expiresAt:string}>('/v1/integrations/docwallet/connect-token',{});
      if(popup){popup.location.href=result.connectUrl;try{popup.opener=null}catch{}}
      else window.location.href=result.connectUrl;
      setStatus('disconnected');setMessage('Autorize no DocWallet. Ao voltar para esta janela, a conexão será verificada automaticamente.');
    }catch(error:any){try{popup?.close()}catch{}setStatus('error');setMessage(error?.message||'Não foi possível iniciar a conexão com o DocWallet.')}finally{setBusy(false)}
  }

  if(!target)return null;
  return createPortal(
    <section className={`dwConnectCard ${status}`}>
      <div className="dwConnectHead"><div><span>DOCUMENT ENGINE</span><b>DocWallet ↔ NexOffice</b></div><i>{status==='connected'?'Conectado':status==='disconnected'?'Autorização pendente':status==='error'?'Atenção':'Verificando'}</i></div>
      <p>{message||'Conecte uma conta DocWallet para analisar e solicitar assinatura sem copiar arquivos brutos para o NexOffice.'}</p>
      <div className="dwConnectActions"><button onClick={connect} disabled={busy}>{busy?'Preparando…':status==='connected'?'Conectar outra conta':'Conectar DocWallet'}</button><button className="secondary" onClick={()=>void probe()} disabled={busy}>Verificar conexão</button></div>
      <small>Autorização por workspace, revogável e com token temporário. Credenciais de serviço permanecem somente nos backends.</small>
    </section>,target
  );
}
