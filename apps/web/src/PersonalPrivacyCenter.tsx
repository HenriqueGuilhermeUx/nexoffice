import {useEffect,useState} from 'react';

type PrivacyStatus={
 dataControl:string;marketingPersonalization:boolean;linkedProducts:string[];
 externalDataSharing:boolean;backgroundAgentActions:boolean;serasaConnected:boolean;
 cloudStoredData:string[];browserOnlyTools:string[];encryptionScope:string;notice:string
};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');
const DATA_LABELS:Record<string,string>={
 identity:'Identidade da conta',manual_accounts:'Contas preenchidas por você',
 imported_financial_rows:'Movimentações lançadas ou importadas',
 user_preferences:'Preferências e prioridades',audit_metadata:'Registros técnicos de acesso e alterações'
};
async function fetchPrivate(path:string,token:string){
 const response=await fetch(API+path,{headers:{authorization:'Bearer '+token},cache:'no-store'});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.message||'Não foi possível consultar seu espaço.');
 return body;
}
export default function PersonalPrivacyCenter({token}:{token:string}){
 const [status,setStatus]=useState<PrivacyStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{let live=true;void fetchPrivate('/v1/personal/privacy/status',token).then(x=>{if(live)setStatus(x as PrivacyStatus);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Falha ao verificar privacidade.');});return()=>{live=false;};},[token]);
 async function exportData(){
  setBusy(true);setError('');setNotice('');
  try{
   const snapshot=await fetchPrivate('/v1/personal/privacy/export',token);
   const data=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
   const link=URL.createObjectURL(data);
   const element=document.createElement('a');
   element.href=link;element.download='nex-personal-meus-dados-'+new Date().toISOString().slice(0,10)+'.json';
   document.body.appendChild(element);element.click();element.remove();URL.revokeObjectURL(link);
   setNotice(snapshot.complete?'Arquivo preparado. Guarde-o em local seguro; ele contém seus dados pessoais.':
    'Arquivo gerado com limite por categoria: alguns registros podem não estar incluídos. Consulte o detalhe no próprio arquivo.');
  }catch(e){setError(e instanceof Error?e.message:'Falha na exportação.');}
  finally{setBusy(false);}
 }
 return <div className="np-privacy-center">
  <section className="np-panel">
   <span className="np-kicker">SEUS DADOS · SUAS ESCOLHAS</span>
   <h2>Um espaço privado, sem promessas impossíveis.</h2>
   <p>Suas informações são suas. Nós usamos dados apenas conforme a função e as autorizações aplicáveis. O funcionamento atual de cada tipo de dado é explicado abaixo.</p>
   {status?<div className="np-privacy-rows">
    <div><strong>Compartilhamento automático entre aplicativos</strong><span>{status.externalDataSharing?'Configurado':'Desativado'}</span></div>
    <div><strong>Publicidade personalizada com seus dados</strong><span>{status.marketingPersonalization?'Configurada':'Desativada'}</span></div>
    <div><strong>Agentes executando ações em segundo plano</strong><span>{status.backgroundAgentActions?'Habilitados':'Desativados'}</span></div>
    <div><strong>Consultas automáticas de CPF e dívidas</strong><span>{status.serasaConnected?'Disponível':'Não conectadas'}</span></div>
   </div>:<p>{error||'Verificando as definições da sua conta…'}</p>}
   <p className="np-privacy-disclaimer">Dados de conta e finanças cadastrados no Nex Personal ficam no banco privado da homologação, que é operado em infraestrutura de terceiros. <strong>Não há criptografia ponta a ponta independente auditada nesta versão.</strong> Administradores e prestadores autorizados podem ter acesso técnico sob controles de segurança. Nenhuma informação é vendida ou compartilhada automaticamente com outras empresas do grupo nesta versão.</p>
  </section>
  <section className="np-panel">
   <h2>O que fica no servidor e o que fica só no navegador?</h2>
   <div className="np-privacy-columns">
    <div><strong>Dados guardados no seu espaço pessoal</strong>
     <ul>{(status?.cloudStoredData||[]).map(x=><li key={x}>{DATA_LABELS[x]||x}</li>)}</ul>
     <small>Necessários para manter seu espaço disponível após entrar novamente.</small>
    </div>
    <div><strong>Ferramentas privadas nesta homologação</strong>
     <ul><li>Orientação de serviços públicos</li><li>Simulação de dívidas e carta ao credor</li><li>Checklist jurídico de trechos colados</li></ul>
     <small>Os textos e valores inseridos nessas três ferramentas são processados no navegador e não são enviados à API. Evite digitar senhas ou dados sensíveis; proteja seu próprio dispositivo.</small>
    </div>
   </div>
  </section>
  <section className="np-panel">
   <h2>Baixe uma cópia do seu espaço</h2>
   <p>Gere um arquivo JSON com seus registros pessoais disponíveis na homologação. Não inclui senhas, tokens, sessões ou informações de outros aplicativos. O arquivo é protegido apenas pelos recursos do dispositivo onde você o salvar.</p>
   <button className="np-primary" type="button" onClick={()=>void exportData()} disabled={busy}>{busy?'Preparando…':'Exportar meus dados pessoais'}</button>
   <p className="np-footnote">A exportação possui limite técnico de 5.000 registros por categoria e informa se foi truncada; não substitui um procedimento formal de portabilidade ou exclusão sob a LGPD.</p>
   {notice&&<p className="np-studio-success" role="status">{notice}</p>}
   {error&&<p className="np-error" role="alert">{error}</p>}
  </section>
  <section className="np-panel">
   <h2>Consentimento não é um cheque em branco</h2>
   <p>Conectar uma carteira de saúde, um sistema jurídico, uma agenda ou uma conta financeira exigirá consentimento por finalidade, com o menor conjunto de dados possível. Assuntos de saúde e menores não serão usados para segmentar ofertas comerciais.</p>
   <p>Os pedidos formais de acesso, correção, oposição ou exclusão precisam de um canal verificado e de um procedimento de autenticação; a exclusão automática de conta ainda não está habilitada nesta homologação.</p>
   <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados" target="_blank" rel="noopener noreferrer">Conheça seus direitos na ANPD ↗</a>
  </section>
 </div>;
}
