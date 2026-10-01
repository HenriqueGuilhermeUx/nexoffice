import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import FinancialEngineCollectionsCenter from './FinancialEngineCollectionsCenter';

export default function FinancialEngineCollectionsBridge(){
  const[target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    const inspect=()=>{
      const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');
      const title=document.querySelector<HTMLElement>('.topbar h1')?.textContent||'';
      const inFinance=Boolean(selected?.textContent?.includes('Financeiro')||title.includes('Financeiro'));
      setTarget(inFinance?document.querySelector('.content'):null);
    };
    inspect();
    const observer=new MutationObserver(inspect);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    const timer=setInterval(inspect,500);
    return()=>{observer.disconnect();clearInterval(timer)};
  },[]);
  return target?createPortal(<FinancialEngineCollectionsCenter/>,target):null;
}
