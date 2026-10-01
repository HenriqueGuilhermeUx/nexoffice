import {useEffect} from 'react';

const labels:Record<string,string[]>={
  command:['Hoje','Central de Comando'],
  crm:['Clientes','CRM'],
  finance:['Financeiro'],
  agenda:['Operação','Agenda & Tarefas'],
  documents:['Documentos'],
  team:['Assistentes IA','Equipe Digital'],
  marketing:['Crescimento','Marketing'],
  integrations:['Integrações'],
  settings:['Configurações','Empresa & Acessos']
};

export default function AssistantNavigationBridge(){
  useEffect(()=>{
    const navigate=(event:Event)=>{
      const detail=(event as CustomEvent<{view?:string}>).detail;
      const aliases=detail?.view?labels[detail.view]:null;
      if(!aliases?.length)return;
      const buttons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];
      const button=buttons.find(item=>aliases.some(label=>(item.textContent||'').toLowerCase().includes(label.toLowerCase())));
      button?.click();
    };
    window.addEventListener('nexoffice:navigate',navigate);
    return()=>window.removeEventListener('nexoffice:navigate',navigate);
  },[]);
  return null;
}
