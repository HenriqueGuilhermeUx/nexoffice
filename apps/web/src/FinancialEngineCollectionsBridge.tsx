import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import FinancialEngineCollectionsCenter from './FinancialEngineCollectionsCenter';

export default function FinancialEngineCollectionsBridge(){
  const[target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    const inspect=()=>{
      const active=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');
      const title=document.querySelector<HTMLElement>('.topbar h1')?.textContent||'';
      // Mount the finance collections center in its existing Financeiro /
      // Cobrança workspace, never inside Conta Nexa or a different tenant view.
      const inCollections=Boolean(active?.textContent?.includes('Cobrança')||
        active?.textContent?.includes('Financeiro')||title.includes('Financeiro')||
        title.includes('Cobrança'));
      setTarget(inCollections?document.querySelector('.content'):null);
    };
    inspect();
    const observer=new MutationObserver(inspect);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    const timer=setInterval(inspect,500);
    return()=>{observer.disconnect();clearInterval(timer)};
  },[]);
  return target?createPortal(<FinancialEngineCollectionsCenter/>,target):null;
}
