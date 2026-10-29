import {useCallback,useEffect,useMemo,useState} from 'react';
import {api,post} from './api';

type Integration={id:string;provider:string;status:string;capabilities:string[]};
type NativeSource={source:string;kind:string;records:number;connected:boolean};
type Registry={
  workspace:{id:string;name:string};
  native:NativeSource[];
  integrations:Array<{provider:string;status:string;capabilities:string[];connectedAt?:string|null;lastHealthStatus?:string|null;updatedAt?:string|null}>;
  alternativeVentures:Array<{sourceProduct:string;signals:number;lastSignalAt?:string|null;privacy:string}>;
  external:Array<{source:string;records:number;datasets:number;lastObservedAt?:string|null}>;
  connectorContract:{version:string;normalizesTo:string;supports:string[]};
  safety:{workspaceScoped:boolean;secretsReturned:boolean;externalEffects:boolean};
};
type Recommendation={
  key:string;
  label:string;
  priority:'high'|'normal'|'later';
  reason:string;
  unlocks:string[];
  status:'connected'|'available'|'planned';
  providerHint?:string|null;
};
type GoogleStatus={
  provider:string;configured:boolean;status:string;accountEmail?:string|null;capabilities:string[];lastSyncAt?:string|null;lastSync?:any;
  scopes:{gmail:string;calendar:string};safety:{sendEmail:boolean;modifyMailbox:boolean;createCalendarEvent:boolean;modifyCalendarEvent:boolean;readOnly:boolean}
};
type Diagnosis={
  profile:{currentTools:string[];namedTools:string[];primaryGoal?:string|null;biggestBottleneck?:string|null};
  firstDiagnosis:{state:string;title:string;detail:string;nextStep:string};
  context:{knowledgePct:number|null;businessGraph:{nodes:number;edges:number;sources:string[]};nativeSignals:number;alternativeVenturesSources:Array<{sourceProduct:string;signals:number}>};
  connections:{connected:Recommendation[];recommended:Recommendation[];all:Recommendation[]};
  principles:{connectWhatExists:boolean;migrationNotRequired:boolean;evidenceBeforeCausality:boolean;noExternalEffects:boolean;readOnlyDiagnosis:boolean};
};

const knownAv:Record<string,{label:string;description:string}>={
  docwallet:{label:'DocWallet',description:'Contratos, documentos, assinaturas e evidências.'},
  staff:{label:'Staff',description:'Voz, atendimento, agenda e memória operacional.'},
  smartbots:{label:'SmartBots',description:'WhatsApp, atendimento, qualificação e follow-up.'},
  nextgen:{label:'NextGen',description:'Cobrança, Pix, conciliação e infraestrutura financeira.'},
  modo:{label:'MODO',description:'Marketing, campanhas, conteúdo e aquisição.'},
  taxagent:{label:'TaxAgent',description:'Fiscal, NFS-e e infraestrutura tributária.'},
  'f-insight':{label:'F-Insight',description:'Mercados, macro, risco e inteligência financeira.'}
};

const toolLabels:Record<string,string>={
  bank:'Banco / internet banking',email:'E-mail',calendar:'Calendário',erp:'ERP / gestão',accounting:'Sistema contábil',crm:'CRM',
  whatsapp:'WhatsApp',spreadsheets:'Planilhas',google_drive:'Google Drive',microsoft365:'Microsoft 365'
};
const priorityLabel=(value:string)=>value==='high'?'Prioridade alta':value==='normal'?'Recomendado':'Depois';
const stateLabel=(value:string)=>value==='connected'?'Conectado':value==='available'?'Disponível':'Planejado';

export default function NexConnectCenter({workspaceId,current}:{workspaceId:string;current:Integration[]}){
  const[registry,setRegistry]=useState<Registry|null>(null),[diagnosis,setDiagnosis]=useState<Diagnosis|null>(null),[google,setGoogle]=useState<GoogleStatus|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const[filePreview,setFilePreview]=useState<any>(null),[fileContent,setFileContent]=useState(''),[datasetName,setDatasetName]=useState(''),[importBusy,setImportBusy]=useState(false),[importMessage,setImportMessage]=useState('');
  const[googleBusy,setGoogleBusy]=useState(false),[googleMessage,setGoogleMessage]=useState('');

  const load=useCallback(async()=>{
    if(!workspaceId)return;
    setLoading(true);setError('');
    try{
      const[r,d,g]=await Promise.all([
        api<Registry>('/v1/business-graph/sources'),
        api<Diagnosis>('/v1/onboarding/business/diagnosis'),
        api<GoogleStatus>('/v1/connect/google/status').catch(()=>null)
      ]);
      setRegistry(r);setDiagnosis(d);setGoogle(g);
    }catch(e:any){setError(e?.message||'Não foi possível montar o mapa de conexões.')}
    finally{setLoading(false)}
  },[workspaceId]);

  useEffect(()=>{void load()},[load]);

  async function startGoogleConnect(){
    setGoogleBusy(true);setGoogleMessage('');
    try{
      const result=await post<any>('/v1/connect/google/start',{});
      if(!result?.authorizationUrl)throw new Error('URL de autorização Google não retornada.');
      location.href=String(result.authorizationUrl);
    }catch(e:any){setGoogleMessage(e?.message||'Não foi possível iniciar a conexão Google.');setGoogleBusy(false)}
  }
  async function syncGoogle(){
    setGoogleBusy(true);setGoogleMessage('');
    try{
      const result=await post<any>('/v1/connect/google/sync',{});
      setGoogleMessage(`Sincronização concluída: ${result.gmail?.inserted||0} email(s) e ${result.calendar?.inserted||0} evento(s) novos no contexto.`);
      await load();
    }catch(e:any){setGoogleMessage(e?.message||'Não foi possível sincronizar o Google Workspace.')}
    finally{setGoogleBusy(false)}
  }
  async function disconnectGoogle(){
    if(!window.confirm('Desconectar Google Workspace e remover os tokens armazenados? Os eventos já observados permanecem no histórico do Business Graph.'))return;
    setGoogleBusy(true);setGoogleMessage('');
    try{await post<any>('/v1/connect/google/disconnect',{});setGoogleMessage('Google Workspace desconectado e tokens removidos.');await load()}
    catch(e:any){setGoogleMessage(e?.message||'Não foi possível desconectar o Google Workspace.')}
    finally{setGoogleBusy(false)}
  }

  async function previewSpreadsheet(file:File){
    setImportMessage('');setFilePreview(null);setFileContent('');
    if(file.size>1_000_000){setImportMessage('Arquivo acima de 1 MB. Reduza o CSV para esta primeira versão.');return}
    const content=await file.text();
    setFileContent(content);setDatasetName(file.name.replace(/.[^.]+$/,'').slice(0,120));
    try{const preview=await post<any>('/v1/connect/spreadsheet/preview',{filename:file.name,content});setFilePreview({...preview,filename:file.name})}
    catch(e:any){setImportMessage(e?.message||'Não consegui ler a planilha.')}
  }
  async function importSpreadsheet(){
    if(!filePreview||!fileContent||!datasetName.trim())return;
    setImportBusy(true);setImportMessage('');
    try{
      const result=await post<any>('/v1/connect/spreadsheet/import',{filename:filePreview.filename,content:fileContent,datasetName:datasetName.trim(),humanConfirmed:true});
      setImportMessage(`${result.imported} linha(s) adicionadas ao contexto. ${result.duplicates||0} duplicada(s) ignoradas.`);
      setFilePreview(null);setFileContent('');setDatasetName('');
      await load();
    }catch(e:any){setImportMessage(e?.message||'Não consegui importar a planilha.')}
    finally{setImportBusy(false)}
  }

  const avSources=useMemo(()=>{
    const bySignal=new Map((registry?.alternativeVentures||[]).map(item=>[String(item.sourceProduct).toLowerCase(),item]));
    const byIntegration=new Map([...(registry?.integrations||[]),...current].map(item=>[String(item.provider).toLowerCase(),item]));
    return Object.entries(knownAv).map(([key,meta])=>{
      const signal=bySignal.get(key);
      const integration=byIntegration.get(key);
      const status=integration?.status==='connected'||Number(signal?.signals||0)>0?'connected':integration?.status||'available';
      return{key,...meta,status,signals:Number(signal?.signals||0),lastSignalAt:signal?.lastSignalAt||null};
    });
  },[registry,current]);

  const declaredTools=[
    ...(diagnosis?.profile.currentTools||[]).map(key=>toolLabels[key]||key),
    ...(diagnosis?.profile.namedTools||[])
  ].filter((value,index,all)=>all.indexOf(value)===index);

  const connectedCount=(registry?.integrations||[]).filter(item=>item.status==='connected').length+(registry?.alternativeVentures||[]).filter(item=>Number(item.signals)>0).length+(registry?.external||[]).length;
  const recommended=(diagnosis?.connections.recommended||[]).slice(0,6);

  if(loading&&!registry)return <section className="connectCenter"><div className="connectLoading">Nex está mapeando as fontes que alimentam sua inteligência…</div></section>;
  if(error&&!registry)return <section className="connectCenter"><div className="connectError"><span>{error}</span><button onClick={()=>void load()}>Tentar novamente</button></div></section>;
  if(!registry||!diagnosis)return null;

  return <section className="connectCenter">
    <div className="connectHero">
      <div>
        <p className="eyebrow">NEX CONNECT CENTER</p>
        <h2>Conecte o que sua empresa já usa. A Nex dá sentido ao conjunto.</h2>
        <p>Você não precisa migrar tudo para a NexOffice. Cada fonte conectada amplia o Business Graph e ajuda a Maya a relacionar vendas, caixa, clientes, documentos e operação.</p>
      </div>
      <button onClick={()=>void load()} disabled={loading}>{loading?'Atualizando…':'Atualizar mapa'}</button>
    </div>

    <div className="connectSummary">
      <div><span>Contexto atual</span><b>{diagnosis.context.businessGraph.nodes} entidades</b><small>{diagnosis.context.businessGraph.edges} relações</small></div>
      <div><span>Conhecimento</span><b>{diagnosis.context.knowledgePct==null?'Aprendendo':`${Math.round(diagnosis.context.knowledgePct)}%`}</b><small>cresce com uso e conexões</small></div>
      <div><span>Fontes nativas</span><b>{registry.native.length}</b><small>{registry.native.reduce((sum,item)=>sum+Number(item.records||0),0)} registros observáveis</small></div>
      <div><span>Conexões/sinais</span><b>{connectedCount}</b><small>externos ou Alternative Ventures</small></div>
    </div>

    <div className="connectDiagnosis">
      <div><small>PRIMEIRA LEITURA</small><h3>{diagnosis.firstDiagnosis.title}</h3><p>{diagnosis.firstDiagnosis.detail}</p></div>
      <strong>{diagnosis.firstDiagnosis.nextStep}</strong>
    </div>

    <div className="connectSection">
      <div className="connectSectionHead"><div><p className="eyebrow">JÁ ALIMENTA A NEX</p><h3>Fontes nativas do seu negócio</h3></div><span>Dados continuam isolados no workspace</span></div>
      <div className="connectNativeGrid">{registry.native.map(item=><article key={item.source}>
        <div className="connectSourceIcon">◆</div><div><b>{item.source.replace('nexoffice.','')}</b><p>{item.kind}</p></div><strong>{item.records}</strong>
      </article>)}</div>
    </div>

    <div className="connectSection">
      <div className="connectSectionHead"><div><p className="eyebrow">ALTERNATIVE VENTURES</p><h3>Capabilities especializadas no mesmo contexto</h3></div><span>Sinais agregados quando aplicável</span></div>
      <div className="connectAvGrid">{avSources.map(item=><article key={item.key} className={item.status==='connected'?'connected':''}>
        <div className="connectCardTop"><div className="connectSourceIcon">◇</div><span>{item.status==='connected'?'Conectado':'Disponível'}</span></div>
        <h4>{item.label}</h4><p>{item.description}</p>
        <small>{item.signals>0?`${item.signals} sinal(is) agregados no contexto`:'Nenhum sinal agregado neste workspace ainda'}</small>
      </article>)}</div>
    </div>

    {declaredTools.length>0&&<div className="connectSection">
      <div className="connectSectionHead"><div><p className="eyebrow">O CLIENTE JÁ USA</p><h3>Não vamos pedir para começar de novo</h3></div><span>Informado no Business Discovery</span></div>
      <div className="connectToolCloud">{declaredTools.map(tool=><span key={tool}>{tool}</span>)}</div>
    </div>}

    <div className="connectSection connectGoogle">
      <div className="connectSectionHead"><div><p className="eyebrow">E-MAIL + CALENDÁRIO</p><h3>Google Workspace</h3><p>Conexão somente leitura. Gmail entra apenas com metadados e cabeçalhos — sem corpo e sem anexos. Calendário entra somente para leitura; a Nex não cria nem altera eventos.</p></div><span>{google?.status==='connected'?'Conectado':google?.configured?'Pronto para conectar':'Aguardando configuração'}</span></div>
      <div className="connectGoogleGrid">
        <article><div className="connectSourceIcon">✉</div><div><b>Gmail</b><p>Assunto, remetente, destinatários, data, thread e labels.</p><small>Escopo: gmail.metadata · sem envio · sem corpo</small></div></article>
        <article><div className="connectSourceIcon">◷</div><div><b>Google Calendar</b><p>Compromissos, organizador, participantes, horários e recorrência.</p><small>Escopo: calendar.readonly · sem criação/alteração</small></div></article>
      </div>
      <div className="connectGoogleState">
        <div><span>Conta</span><b>{google?.accountEmail||'—'}</b></div>
        <div><span>Última sincronização</span><b>{google?.lastSyncAt?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(google.lastSyncAt)):'Ainda não sincronizado'}</b></div>
        <div><span>Modo</span><b>Somente leitura</b></div>
      </div>
      <div className="connectGoogleActions">
        {google?.status!=='connected'?<button className="primary" disabled={!google?.configured||googleBusy} onClick={()=>void startGoogleConnect()}>{googleBusy?'Abrindo…':google?.configured?'Conectar Google Workspace':'Configure as credenciais no servidor'}</button>:<>
          <button className="primary" disabled={googleBusy} onClick={()=>void syncGoogle()}>{googleBusy?'Sincronizando…':'Sincronizar agora'}</button>
          <button disabled={googleBusy} onClick={()=>void disconnectGoogle()}>Desconectar</button>
        </>}
      </div>
      {googleMessage&&<div className="connectImportMessage">{googleMessage}</div>}
      <div className="connectTrust"><span>✓ OAuth assinado</span><span>✓ Tokens criptografados</span><span>✓ Gmail sem corpo/anexos</span><span>✓ Agenda sem escrita</span></div>
    </div>

    <div className="connectSection connectSpreadsheet">
      <div className="connectSectionHead"><div><p className="eyebrow">PRIMEIRO CONECTOR EXTERNO REAL</p><h3>Planilhas / CSV</h3><p>Traga controles que já existem fora da NexOffices. Primeiro fazemos preview; só depois da sua confirmação os registros entram no Business Graph.</p></div><span>{(registry.external||[]).find(item=>item.source==='external.spreadsheet')?.records||0} registro(s) conectados</span></div>
      <div className="connectSpreadsheetBody">
        <label className="connectUpload"><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e=>{const file=e.target.files?.[0];if(file)void previewSpreadsheet(file);e.currentTarget.value=''}}/><span>Selecionar CSV/TXT</span><small>Máx. 1 MB · até 1.000 linhas · arquivo bruto não é armazenado</small></label>
        {filePreview&&<div className="connectPreview">
          <div className="connectPreviewTop"><div><small>PREVIEW</small><b>{filePreview.filename}</b><span>{filePreview.rows} linha(s) · {filePreview.headers.length} coluna(s)</span></div><label><span>Nome do conjunto</span><input value={datasetName} onChange={e=>setDatasetName(e.target.value)} maxLength={120}/></label></div>
          <div className="connectDetected">{filePreview.inferred.slice(0,8).map((item:any)=><span key={item.normalized}><b>{item.header}</b><small>{item.semantic} · {Math.round(Number(item.confidence||0)*100)}%</small></span>)}</div>
          {filePreview.sample?.length>0&&<div className="connectSample"><div className="connectSampleRow head">{filePreview.headers.slice(0,5).map((header:string)=><b key={header}>{header}</b>)}</div>{filePreview.sample.slice(0,3).map((row:any,index:number)=><div className="connectSampleRow" key={index}>{filePreview.headers.slice(0,5).map((header:string)=><span key={header}>{String(row[header]??'').slice(0,80)||'—'}</span>)}</div>)}</div>}
          <div className="connectPreviewActions"><button onClick={()=>{setFilePreview(null);setFileContent('');setDatasetName('')}}>Cancelar</button><button className="primary" onClick={()=>void importSpreadsheet()} disabled={importBusy||!datasetName.trim()}>{importBusy?'Importando…':'Confirmar e adicionar ao contexto'}</button></div>
        </div>}
        {importMessage&&<div className="connectImportMessage">{importMessage}</div>}
        {(registry.external||[]).length>0&&<div className="connectExternalSources">{registry.external.map(item=><article key={item.source}><div className="connectSourceIcon">⇄</div><div><b>{item.source.replace('external.','')}</b><small>{item.datasets} dataset(s) · {item.records} registro(s)</small></div><span>Conectado</span></article>)}</div>}
      </div>
    </div>

    <div className="connectSection connectRecommendations">
      <div className="connectSectionHead"><div><p className="eyebrow">PRÓXIMAS CONEXÕES</p><h3>Onde mais contexto gera mais inteligência agora</h3></div><span>{recommended.length} recomendação(ões)</span></div>
      <div className="connectRecommendationGrid">{recommended.map(item=><article key={item.key} className={item.priority}>
        <div className="connectCardTop"><b>{priorityLabel(item.priority)}</b><span>{stateLabel(item.status)}</span></div>
        <h4>{item.label}</h4>{item.providerHint&&<em>{item.providerHint}</em>}<p>{item.reason}</p>
        <div className="connectUnlocks"><span>Destrava</span>{item.unlocks.slice(0,5).map(value=><small key={value}>✓ {value}</small>)}</div>
        <button disabled>{item.status==='available'?'Configuração guiada em breve':'Conector em preparação'}</button>
      </article>)}</div>
    </div>

    <div className="connectArchitecture">
      <div><small>CONTRATO</small><b>{registry.connectorContract.version}</b></div>
      <div><small>NORMALIZA PARA</small><b>{registry.connectorContract.normalizesTo}</b></div>
      <div><small>FONTES SUPORTADAS</small><b>{registry.connectorContract.supports.length}</b></div>
      <div><small>SEGURANÇA</small><b>Sem segredos · sem efeitos externos</b></div>
    </div>

    <div className="connectTrust">
      <span>✓ Sem migração obrigatória</span><span>✓ Workspace isolado</span><span>✓ Diagnóstico read-only</span><span>✓ Evidência antes de causalidade</span>
    </div>
  </section>;
}
