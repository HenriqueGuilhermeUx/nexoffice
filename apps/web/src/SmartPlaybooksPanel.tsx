import {useEffect,useState} from 'react';
import {api,post,session} from './api';
import './smart-playbooks.css';

type Recommendation={templateKey:string;title:string;reason:string;priority:string;context:Record<string,string|null|undefined>};
type Step={id:string;position:number;title:string;description?:string|null;actionId:string;status:string;executionMode:string;payload?:Record<string,unknown>};
type Run={id:string;template_key:string;title:string;objective?:string|null;status:string;contact_name?:string|null;catalog_name?:string|null;total_steps:number;completed_steps:number;progress:number;currentStep?:Step|null;current_step_data?:Step|null};
type Payload={recommendations:Recommendation[];activeRuns:Run[];safety:{externalActionsAutomatic:boolean;humanConfirmationRespected:boolean;actionRegistryEnforced:boolean}};
type MayaAttention={runId:string;playbookTitle:string;subject:string;kind:string;stepId:string;stepPosition:number;stepTitle:string;description?:string;actionId:string;executionMode:string;why:string;handoff?:{view?:string;action?:string;payload?:Record<string,unknown>}};
type MayaResponse={understood:boolean;message:string;summary?:{selected:number;newRuns:number;reusedRuns:number;safeStepsExecuted:number;humanAttention:number};humanAttention?:MayaAttention[];suggestedPrompts?:string[]};

const modeLabel:Record<string,string>={
  safe_internal:'Interna segura',
  handoff:'Continuar no módulo',
  human_confirmation:'Confirmação humana',
  dedicated_external_flow:'Fluxo externo dedicado'
};

const mayaPrompts=[
  'Maya, cuida dos clientes em risco',
  'Maya, organiza as vendas paradas',
  'Maya, cuida do que precisa ser reposto',
  'Maya, prepara as renovações próximas',
  'Maya, resolve as prioridades do negócio'
];

function applyContext(actionId:string,p:any){
  if(actionId==='materials.proposal.prepare'){
    if(p?.contactId)sessionStorage.setItem('nexoffice.material.contactId',String(p.contactId));
    if(p?.catalogItemId)sessionStorage.setItem('nexoffice.material.catalogItemId',String(p.catalogItemId));
  }
  if(actionId==='relationship.review'||actionId==='message.send'){
    if(p?.contactId)sessionStorage.setItem('nexoffice.crm.contactId',String(p.contactId));
  }
  if(actionId==='finance.receivables.review'&&p?.contactId)sessionStorage.setItem('nexoffice.finance.contactId',String(p.contactId));
}

function routeFor(step:Step){
  const p=(step.payload||{}) as any;
  applyContext(step.actionId,p);
  if(step.actionId==='materials.proposal.prepare')return{view:'materials'};
  if(step.actionId==='operations.continue'||step.actionId.startsWith('purchasing.')||step.actionId==='inventory.adjust'){
    if(p.operationId)window.dispatchEvent(new CustomEvent('nexoffice:business-operations',{detail:{action:'open',operationId:p.operationId}}));
    return{view:'operations'};
  }
  if(step.actionId==='relationship.review'||step.actionId==='message.send')return{view:'crm'};
  if(step.actionId==='fiscal.issue')return{view:'operations'};
  if(step.actionId==='finance.receivables.review'||step.actionId==='profitability.review'||step.actionId==='recurrence.activate'||step.actionId.startsWith('reconciliation.'))return{view:'finance'};
  return{view:'command'};
}

function openAttention(item:MayaAttention){
  const p=(item.handoff?.payload||{}) as any;
  applyContext(item.actionId,p);
  const view=String(item.handoff?.view||'command');
  window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view}}));
}

export default function SmartPlaybooksPanel(){
  const[data,setData]=useState<Payload|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const[mayaInput,setMayaInput]=useState(''),[mayaResult,setMayaResult]=useState<MayaResponse|null>(null);
  const[sessionKey,setSessionKey]=useState(()=>session.workspace());
  useEffect(()=>{const timer=setInterval(()=>{const next=session.workspace();setSessionKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(sessionKey)void load()},[sessionKey]);

  async function load(){setError('');try{setData(await api<Payload>('/v1/playbooks/intelligence'))}catch(e:any){setError(e?.message||'Não foi possível carregar os playbooks.')}}

  async function askMaya(message?:string){
    const command=(message||mayaInput).trim();
    if(!command)return;
    setBusy('maya');setError('');setNotice('');setMayaResult(null);
    try{
      const r=await post<MayaResponse>('/v1/playbooks/maya',{message:command,maxRuns:4,mode:'execute_safe'});
      setMayaResult(r);
      setMayaInput('');
      if(r.understood)setNotice(r.message);
      await load();
    }catch(e:any){setError(e?.message||'A Maya não conseguiu organizar os playbooks agora.')}
    finally{setBusy('')}
  }

  async function start(rec:Recommendation){
    setBusy('start:'+rec.templateKey);setError('');setNotice('');
    try{
      const r=await post<any>('/v1/playbooks/start',{templateKey:rec.templateKey,context:rec.context||{}});
      setNotice(r.reused?'Este playbook já estava em andamento.':'Playbook iniciado com a primeira etapa pronta.');
      await load();
    }catch(e:any){setError(e?.message||'Não foi possível iniciar o playbook.')}
    finally{setBusy('')}
  }

  async function execute(run:Run,step:Step){
    setBusy(step.id);setError('');setNotice('');
    try{
      const r=await post<any>('/v1/playbooks/runs/'+run.id+'/steps/'+step.id+'/execute',{});
      if(r.handoff||r.humanGate){
        const target=routeFor(step);
        setNotice(r.humanGate?'A etapa chegou à trava humana. Abra o fluxo, revise e depois marque como concluída.':'O contexto está pronto. Continue no módulo indicado e depois conclua a etapa.');
        if(target.view!=='command')setTimeout(()=>window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:target})),100);
      }else setNotice('Etapa concluída. O NexOffice já liberou o próximo passo.');
      await load();
    }catch(e:any){setError(e?.message||'Não foi possível executar a etapa.')}
    finally{setBusy('')}
  }

  async function complete(run:Run,step:Step,outcome:'completed'|'skipped'='completed'){
    setBusy('complete:'+step.id);setError('');setNotice('');
    try{
      await post('/v1/playbooks/runs/'+run.id+'/steps/'+step.id+'/complete',{outcome});
      setNotice(outcome==='completed'?'Etapa confirmada. Próximo passo liberado.':'Etapa pulada com rastreabilidade.');
      await load();
    }catch(e:any){setError(e?.message||'Não foi possível concluir a etapa.')}
    finally{setBusy('')}
  }

  if(!data)return null;
  const runs=data.activeRuns||[];
  const recommendations=data.recommendations||[];

  return <section className="smartPlaybooks">
    <header className="smartPlaybooksHead">
      <div><small>PLAYBOOKS INTELIGENTES</small><h3>O NexOffice não só aponta o problema. Ele monta o caminho.</h3><p>Sequências guiadas pelo contexto real do negócio, usando as mesmas permissões e travas do Action Engine.</p></div>
      <button onClick={()=>void load()}>↻</button>
    </header>

    <div className="mayaOrchestrator">
      <div className="mayaIdentity"><div className="mayaAvatar">M</div><div><span>MAYA · ORQUESTRADORA</span><b>Diga o objetivo. Eu organizo o trabalho seguro e trago só o que precisa de você.</b></div></div>
      <form onSubmit={e=>{e.preventDefault();void askMaya()}} className="mayaCommand">
        <input value={mayaInput} onChange={e=>setMayaInput(e.target.value)} placeholder="Ex.: Maya, resolve os clientes em risco" disabled={busy==='maya'}/>
        <button className="primary" disabled={busy==='maya'||!mayaInput.trim()}>{busy==='maya'?'Organizando…':'Organizar agora'}</button>
      </form>
      <div className="mayaPrompts">{mayaPrompts.map(prompt=><button key={prompt} disabled={busy==='maya'} onClick={()=>void askMaya(prompt)}>{prompt.replace('Maya, ','')}</button>)}</div>
      {mayaResult&&<div className="mayaResult">
        <div className="mayaResultSummary"><b>{mayaResult.message}</b>{mayaResult.summary&&<span>{mayaResult.summary.safeStepsExecuted} etapa(s) interna(s) executada(s) · {mayaResult.summary.humanAttention} ponto(s) para você</span>}</div>
        {!!mayaResult.humanAttention?.length&&<div className="mayaAttentionList">{mayaResult.humanAttention.map(item=><article key={item.runId+item.stepId}>
          <span>{item.kind==='external_approval'?'APROVAÇÃO EXTERNA':item.kind==='human_confirmation'?'CONFIRMAÇÃO HUMANA':'CONTINUAR NO CONTEXTO'}</span>
          <b>{item.subject} · {item.stepTitle}</b>
          <p>{item.why}</p>
          <button onClick={()=>openAttention(item)}>Abrir agora</button>
        </article>)}</div>}
        {!mayaResult.understood&&<div className="mayaPrompts">{(mayaResult.suggestedPrompts||mayaPrompts).map(prompt=><button key={prompt} onClick={()=>void askMaya(prompt)}>{prompt}</button>)}</div>}
      </div>}
    </div>

    {error&&<div className="smartPlaybooksError">{error}</div>}
    {notice&&<div className="smartPlaybooksNotice">{notice}</div>}

    {recommendations.length>0&&<div className="playbookRecommendations">
      <div className="playbookSectionTitle"><span>RECOMENDADOS AGORA</span><b>O sinal já virou um plano.</b></div>
      <div className="playbookRecommendationGrid">{recommendations.map(rec=><article key={rec.templateKey+JSON.stringify(rec.context)} className={rec.priority==='high'?'high':''}>
        <span>{rec.priority==='high'?'PRIORIDADE':'OPORTUNIDADE'}</span>
        <h4>{rec.title}</h4>
        <p>{rec.reason}</p>
        <button className="primary" disabled={busy==='start:'+rec.templateKey} onClick={()=>void start(rec)}>{busy==='start:'+rec.templateKey?'Iniciando…':'Iniciar playbook'}</button>
      </article>)}</div>
    </div>}

    <div className="playbookActive">
      <div className="playbookSectionTitle"><span>EM ANDAMENTO</span><b>{runs.length?runs.length+' playbook(s) ativo(s)':'Nenhum playbook ativo'}</b></div>
      {runs.length?runs.map(run=>{
        const step=(run.currentStep||run.current_step_data||null) as Step|null;
        return <article key={run.id} className="playbookRun">
          <div className="playbookRunTop"><div><span>{run.contact_name||run.catalog_name||'Negócio'}</span><h4>{run.title}</h4><p>{run.objective}</p></div><strong>{run.progress}%</strong></div>
          <div className="playbookProgress"><span style={{width:Math.max(2,run.progress)+'%'}}/></div>
          <div className="playbookRunMeta"><span>{run.completed_steps}/{run.total_steps} etapas concluídas</span><span>{run.status==='waiting_human'?'Aguardando você':'Em andamento'}</span></div>
          {step&&<div className="playbookCurrentStep">
            <div><span>ETAPA {step.position} · {modeLabel[step.executionMode]||step.executionMode}</span><b>{step.title}</b><p>{step.description}</p></div>
            <div className="playbookStepActions">
              {step.status==='waiting_human'?<>
                <button onClick={()=>{const target=routeFor(step);if(target.view!=='command')window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:target}))}}>Abrir fluxo</button>
                <button className="primary" disabled={busy==='complete:'+step.id} onClick={()=>void complete(run,step)}>{busy==='complete:'+step.id?'Confirmando…':'Marcar concluída'}</button>
                <button disabled={busy==='complete:'+step.id} onClick={()=>void complete(run,step,'skipped')}>Pular</button>
              </>:<button className="primary" disabled={busy===step.id} onClick={()=>void execute(run,step)}>{busy===step.id?'Executando…':step.executionMode==='safe_internal'?'Executar etapa':'Fazer agora'}</button>}
            </div>
          </div>}
        </article>;
      }):<div className="playbookEmpty">Quando o NexOffice detectar um caso claro, o playbook recomendado aparece aqui. Você também pode pedir diretamente para a Maya organizar o que precisa de atenção.</div>}
    </div>

    <footer>A Maya executa apenas etapas internas classificadas como seguras. Ações externas, fiscais, financeiras ou de comunicação não atravessam a trava humana.</footer>
  </section>;
}
