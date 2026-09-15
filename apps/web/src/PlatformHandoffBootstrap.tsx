import {useEffect,useState} from 'react';
import {post,session} from './api';

type HandoffResult={
  token:string;
  expiresAt:string;
  user:{id:string;name:string;email:string};
  workspace:{id:string;name:string;slug:string;vertical:string;status:string;role:string;permissions:string[]};
};

export default function PlatformHandoffBootstrap(){
  const [active,setActive]=useState(false);
  const [message,setMessage]=useState('Abrindo seu NexOffice…');

  useEffect(()=>{
    const params=new URLSearchParams(location.hash.replace(/^#/,''));
    const code=params.get('handoff');
    if(!code)return;
    setActive(true);
    void (async()=>{
      try{
        const result=await post<HandoffResult>('/v1/platform/handoff/consume',{code});
        session.set(result.token,result.workspace.id);
        history.replaceState({},'',`${location.pathname}${location.search}`);
        location.reload();
      }catch{
        history.replaceState({},'',`${location.pathname}${location.search}`);
        setMessage('Este acesso expirou ou já foi utilizado. Volte ao produto de origem e abra o NexOffice novamente.');
      }
    })();
  },[]);

  if(!active)return null;
  return <div className="handoffOverlay" role="status" aria-live="polite"><div className="handoffCard"><div className="handoffMark">N</div><b>NexOffice</b><p>{message}</p></div></div>;
}
