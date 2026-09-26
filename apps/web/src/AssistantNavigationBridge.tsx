import {useEffect} from 'react';

const labels:Record<string,string>={command:'Central de Comando',crm:'CRM',finance:'Financeiro',agenda:'Agenda & Tarefas',documents:'Documentos',team:'Equipe Digital',marketing:'Marketing',compliance:'Compliance',integrations:'Integrações',settings:'Empresa & Acessos'};

export default function AssistantNavigationBridge(){
  useEffect(()=>{
    const navigate=(event:Event)=>{
      const detail=(event as CustomEvent<{view?:string}>).detail;
      const label=detail?.view?labels[detail.view]:null;
      if(!label)return;
      const button=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')].find(item=>item.textContent?.includes(label));
      button?.click();
    };
    window.addEventListener('nexoffice:navigate',navigate);
    return()=>window.removeEventListener('nexoffice:navigate',navigate);
  },[]);
  return null;
}
