import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import FinancialEngineCollectionsCenter from './FinancialEngineCollectionsCenter';

export default function FinancialEngineCollectionsBridge(){
  const[target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    const inspect=()=>{
      const active=[...document.querySelectorAll<HTMLButtonElement>('.opsTabs button')].find(button=>button.classList.contains('active'));
      const body=document.querySelector('.opsDock .opsBody');
      setTarget(active?.textContent?.includes('Cobrança')&&body?body:null);
    };
    inspect();
    const observer=new MutationObserver(inspect);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    return()=>observer.disconnect();
  },[]);
  return target?createPortal(<FinancialEngineCollectionsCenter/>,target):null;
}
