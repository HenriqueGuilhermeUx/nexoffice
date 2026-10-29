import {useCallback,useEffect,useMemo,useState} from 'react';
import {api} from './api';

type Integration={id:string;provider:string;status:string;capabilities:string[]};
type NativeSource={source:string;kind:string;records:number;connected:boolean};
type Registry={
  workspace:{id:string;name:string};
  native:NativeSource[];
  integrations:Array<{provider:string;status:string;capabilities:string[];connectedAt?:string|null;lastHealthStatus?:string|null;updatedAt?:string|null}>;
  alternativeVentures:Array<{sourceProduct:string;signals:number;lastSignalAt?:string|null;privacy:string}>;
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
  const[registry,setRegistry]=useState<Registry|null>(null),[diagnosis,setDiagnosis]=useState<Diagnosis|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');

  const load=useCallback(async()=>{
    if(!workspaceId)return;
    setLoading(true);setError('');
    try{
      const[r,d]=await Promise.all([
        api<Registry>('/v1/business-graph/sources'),
        api<Diagnosis>('/v1/onboarding/business/diagnosis')
      ]);
      setRegistry(r);setDiagnosis(d);
    }catch(e:any){setError(e?.message||'Não foi possível montar o mapa de conexões.')}
    finally{setLoading(false)}
  },[workspaceId]);

  useEffect(()=>{void load()},[load]);

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

  const connectedCount=(registry?.integrations||[]).filter(item=>item.status==='connected').length+(registry?.alternativeVentures||[]).filter(item=>Number(item.signals)>0).length;
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
