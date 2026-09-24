import {useEffect,useState,type FormEvent} from 'react';
import {api,post,put} from './api';
import './compliance-center.css';

type Triage={hasEmployees:'yes'|'no'|'unknown';companyType:'mei'|'me_epp'|'other'|'unknown';hasSstSupport:'yes'|'no'|'unknown';nr1ReviewStatus:'managed'|'reviewed'|'not_reviewed'|'unknown'};
type Overview={
  available:boolean;
  workspace:{id:string;name:string;sector:string};
  triage:Triage;
  relevance:{state:string;title:string;detail:string;nextAction:string};
  nr1check:{configured:boolean;launchUrl:string|null};
  mindcompliance:{connected:boolean;summary:any};
  privacy:{mode:string;sourceOwnsCanonicalData:boolean;forbidden:string[]};
  legalGuidance:{automaticLegalConclusion:boolean;note:string};
};

const labels:Record<string,string>={
  not_relevant_now:'Disponível sem prioridade',worth_checking:'Vale conferir',review_recommended:'Revisão recomendada',already_managed:'Em acompanhamento',
  not_started:'Não iniciado',in_progress:'Em andamento',completed:'Concluído',not_applicable:'Não aplicável',active:'Ativo',attention:'Atenção',up_to_date:'Em dia'
};

export default function ComplianceCenter(){
  const [data,setData]=useState<Overview|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const load=async()=>{setError('');try{setData(await api<Overview>('/v1/compliance/overview'))}catch(e:any){setError(e?.message||'Não foi possível carregar Compliance.')}};
  useEffect(()=>{void load()},[]);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget).entries());setBusy(true);setError('');try{setData(await put<Overview>('/v1/compliance/triage',{hasEmployees:f.hasEmployees,companyType:f.companyType,hasSstSupport:f.hasSstSupport,nr1ReviewStatus:f.nr1ReviewStatus}))}catch(e:any){setError(e?.message||'Não foi possível salvar a checagem.')}finally{setBusy(false)}}
  async function openNr1(){setBusy(true);setError('');try{const result=await post<any>('/v1/compliance/nr1check/handoff',{});if(result?.url)window.location.href=result.url;else throw new Error('NR1Check ainda não está disponível neste ambiente.')}catch(e:any){setError(e?.message||'Não foi possível abrir o NR1Check.')}finally{setBusy(false)}}
  if(!data&&!error)return <div className="compliance-loading">Preparando Compliance…</div>;
  const summary=data?.mindcompliance?.summary;
  return <div className="compliance-center">
    <div className="compliance-hero">
      <div><p className="eyebrow">COMPLIANCE & PROTEÇÃO DA EMPRESA</p><h2>Cuide do que precisa estar em ordem sem virar especialista nisso.</h2><p>O NexOffice usa o que já conhece da sua empresa, mostra apenas o que merece atenção e deixa NR1Check/MindCompliance trabalharem por trás.</p></div>
      {data&&<span className={`compliance-pill state-${data.relevance.state}`}>{labels[data.relevance.state]||data.relevance.state}</span>}
    </div>
    {error&&<div className="errorBanner">{error}</div>}
    {data&&<>
      <div className="compliance-grid">
        <section className="panel compliance-relevance"><p className="eyebrow">AGORA</p><h3>{data.relevance.title}</h3><p>{data.relevance.detail}</p>
          {data.relevance.nextAction==='check_nr1'&&<button className="primary" disabled={busy||!data.nr1check.configured} onClick={openNr1}>{data.nr1check.configured?'Fazer checagem NR-1':'NR1Check aguardando configuração'}</button>}
          {data.relevance.nextAction==='open_management'&&summary?.deepLink&&<button className="primary" onClick={()=>window.location.href=summary.deepLink}>Abrir gestão de compliance</button>}
          <small>Essa orientação organiza prioridade. Não é parecer jurídico automático.</small>
        </section>
        <section className="panel"><p className="eyebrow">GESTÃO CONTÍNUA</p><h3>{summary?'Seu compliance no dia a dia':'MindCompliance disponível para sua empresa'}</h3>{summary?<div className="compliance-stats"><div><b>{summary.openActions||0}</b><span>ações abertas</span></div><div><b>{summary.overdueActions||0}</b><span>vencidas</span></div><div><b>{summary.completionPct==null?'—':`${Math.round(summary.completionPct)}%`}</b><span>conclusão</span></div></div>:<p>Quando conectado, o NexOffice mostra só pendências, prazos e progresso. Evidências, denúncias, respostas individuais e documentos sensíveis continuam no produto especializado.</p>}
          {summary?.nextDueAt&&<p className="compliance-next">Próximo prazo: <b>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium'}).format(new Date(summary.nextDueAt))}</b></p>}
        </section>
      </div>
      <section className="panel compliance-triage"><div className="sectionHead"><div><p className="eyebrow">CHECAGEM RÁPIDA</p><h3>Ajude o NexOffice a saber quando isso é relevante</h3></div></div>
        <form onSubmit={save} className="compliance-form">
          <label><span>Sua empresa possui empregados?</span><select name="hasEmployees" defaultValue={data.triage.hasEmployees}><option value="unknown">Ainda não informei</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
          <label><span>Enquadramento</span><select name="companyType" defaultValue={data.triage.companyType}><option value="unknown">Não sei / outro</option><option value="mei">MEI</option><option value="me_epp">ME / EPP</option><option value="other">Outro</option></select></label>
          <label><span>Já possui apoio de SST / gestão de riscos?</span><select name="hasSstSupport" defaultValue={data.triage.hasSstSupport}><option value="unknown">Não sei</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
          <label><span>Situação da NR-1 / PGR</span><select name="nr1ReviewStatus" defaultValue={data.triage.nr1ReviewStatus}><option value="unknown">Não sei</option><option value="not_reviewed">Ainda não revisamos</option><option value="reviewed">Já verificamos</option><option value="managed">Já administramos isso continuamente</option></select></label>
          <button className="primary" disabled={busy}>{busy?'Salvando…':'Atualizar orientação'}</button>
        </form>
      </section>
      <div className="compliance-privacy"><b>Privacidade por arquitetura.</b> NexOffice recebe somente status operacional agregado. Dados pessoais de empregados, CPF, saúde, respostas psicossociais, denúncias, evidências confidenciais e documentos brutos não entram aqui.</div>
    </>}
  </div>;
}
