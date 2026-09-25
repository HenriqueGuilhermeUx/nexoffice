import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import DocumentWorkspaceCenter from './DocumentWorkspaceCenter';

export default function DocumentWorkspaceBridge(){
  const[target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    const inspect=()=>{
      const active=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');
      const content=document.querySelector('.shell main .content');
      setTarget(active?.textContent?.includes('Documentos')&&content?content:null);
    };
    inspect();
    const observer=new MutationObserver(inspect);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    return()=>observer.disconnect();
  },[]);
  return target?createPortal(<DocumentWorkspaceCenter/>,target):null;
}
