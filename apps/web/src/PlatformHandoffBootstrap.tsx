import {useEffect,useState} from 'react';
import {post,session} from './api';

type HandoffResult={
  token:string;
  expiresAt:string;
  user:{id:string;name:string;email:string};
  workspace:{id:string;name:string;slug:string;vertical:string;status:string;role:string;permissions:string[]};
};

const platformName=(import.meta as any).env?.VITE_PRODUCT_BRAND==='nexa-pj'?'Nexa PJ':'NexOffice';
export default function PlatformHandoffBootstrap(){
  const [active,setActive]=useState(false);
  const [message,setMessage]=useState(`Abrindo ${platformName}…`);

  useEffect(()=>{
    const params=new URLSearchParams(location.hash.replace(/^#/,''));
    const code=params.get('handoff');
    if(!code)return;
    setActive(true);
    void (async()=>{
      try{
        const result=await post<HandoffResult>('/v1/platform/handoff/consume',{code});
        session.set(result.token,result.workspace.id);
        const nextParams=new URLSearchParams(location.search);nextParams.set('app','1');
        history.replaceState({},'',`${location.pathname}?${nextParams.toString()}`);
        location.reload();
      }catch{
        history.replaceState({},'',`${location.pathname}${location.search}`);
        setMessage('Este acesso expirou ou já foi utilizado. Volte ao produto de origem e abra a plataforma novamente.');
      }
    })();
  },[]);

  if(!active)return null;
  return <div className="handoffOverlay" role="status" aria-live="polite"><div className="handoffCard"><div className="handoffMark">N</div><b>{platformName}</b><p>{message}</p></div></div>;
}
