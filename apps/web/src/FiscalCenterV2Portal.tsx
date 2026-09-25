import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import FiscalCenterV2 from './FiscalCenterV2';

export default function FiscalCenterV2Portal(){
  const [host,setHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    const sync=()=>{
      const active=[...document.querySelectorAll<HTMLButtonElement>('.opsTabs button.active')].some(button=>button.textContent?.trim()==='Fiscal');
      const body=document.querySelector<HTMLElement>('.opsBody');
      document.querySelectorAll<HTMLElement>('.opsBody.fiscalV2Host').forEach(el=>{if(el!==body||!active)el.classList.remove('fiscalV2Host')});
      if(active&&body){body.classList.add('fiscalV2Host');setHost(prev=>prev===body?prev:body)}else setHost(null);
    };
    sync();const timer=window.setInterval(sync,250);return()=>{window.clearInterval(timer);document.querySelectorAll<HTMLElement>('.opsBody.fiscalV2Host').forEach(el=>el.classList.remove('fiscalV2Host'))};
  },[]);
  return host?createPortal(<FiscalCenterV2/>,host):null;
}
