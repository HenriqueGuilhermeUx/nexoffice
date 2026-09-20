import {useEffect,useState} from 'react';
import {api,post,session} from './api';

type ActivationItem={key:string;target:'profile'|'crm'|'finance'|'agenda'|'documents'|'trajectory'};
type Knowledge={activation?:{actions?:ActivationItem[]}};

export default function ActivationJourneyTracker(){
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  useEffect(()=>{const timer=setInterval(()=>{const next=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{
    if(!session.token()||!session.workspace())return;
    let disposed=false,lastSignature='';const cleanups:Array<()=>void>=[];
    const inspect=async()=>{
      const panel=document.querySelector('.knowledgeActivation .activationList');if(!panel)return;
      const buttons=[...panel.querySelectorAll<HTMLButtonElement>('article button')];if(!buttons.length)return;
      const signature=buttons.map(x=>x.textContent||'').join('|');if(signature===lastSignature)return;lastSignature=signature;
      try{
        const knowledge=await api<Knowledge>('/v1/intelligence/knowledge');if(disposed)return;const actions=knowledge.activation?.actions||[];const day=new Date().toISOString().slice(0,10);const storageKey=`nexoffice.activation.seen.${session.workspace()}.${day}`;let seen:string[]=[];try{seen=JSON.parse(sessionStorage.getItem(storageKey)||'[]')}catch{}const seenSet=new Set(seen);
        actions.forEach((item,index)=>{
          if(!seenSet.has(item.key)){seenSet.add(item.key);void post('/v1/intelligence/activation/event',{recommendationKey:item.key,target:item.target,event:'shown'}).catch(()=>{})}
          const button=buttons[index];if(!button)return;const onClick=()=>void post('/v1/intelligence/activation/event',{recommendationKey:item.key,target:item.target,event:'clicked'}).catch(()=>{});button.addEventListener('click',onClick,{once:true});cleanups.push(()=>button.removeEventListener('click',onClick));
        });
        sessionStorage.setItem(storageKey,JSON.stringify([...seenSet]));
      }catch{}
    };
    const observer=new MutationObserver(()=>void inspect());observer.observe(document.body,{subtree:true,childList:true});void inspect();
    return()=>{disposed=true;observer.disconnect();cleanups.splice(0).forEach(fn=>fn())};
  },[sessionKey]);
  return null;
}
