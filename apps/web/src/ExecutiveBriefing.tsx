import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {api,post,session} from './api';
import './executive-briefing.css';

type Decision={id:string;title:string;detail:string;benefit:string;target:string;status:string;planItemId:string;taskId?:string|null;dueAt?:string|null;priority:number};
type Brief={
  generatedAt:string;version:string;headline:string;subheadline:string;
  health:{score:number|null;delta:number|null;status:string;summary?:string|null};
  decisions:Decision[];
  attention?:{kind:string;title:string;detail:string;target:string}|null;
  opportunity?:{kind:string;title:string;detail:string;target:string}|null;
  weeklyProgress:{done:number;total:number;pct:number;summary?:string|null};
  digitalTeam:{name:string;agentRole:string;title:string;prompt:string};
  recentResults:Array<{title:string;status:string;summary?:string|null}>;
  note:string;
};
type Me={user:{name:string}};

function daypart(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}

export default function ExecutiveBriefing(){
  const [host,setHost]=useState<HTMLElement|null>(null);const [active,setActive]=useState(false);const [data,setData]=useState<Brief|null>(null);const [name,setName]=useState('');const [loading,setLoading]=useState(false);const [busyId,setBusyId]=useState('');const [answer,setAnswer]=useState('');const [teamBusy,setTeamBusy]=useState(false);const [error,setError]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  useEffect(()=>{const timer=setInterval(()=>{const next=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===next?prev:next);const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(selected?.textContent?.includes('Central de Comando')));const content=document.querySelector<HTMLElement>('.content');if(content){let mount=document.getElementById('executive-briefing-mount');if(!mount){mount=document.createElement('div');mount.id='executive-briefing-mount';content.insertBefore(mount,content.firstChild)}setHost(mount)}},400);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!active||!session.token()||!session.workspace()){setData(null);return}void load();const timer=setInterval(()=>void load(),60000);return()=>clearInterval(timer)},[active,sessionKey]);
  async function load(){setLoading(true);setError('');try{const [brief,me]=await Promise.all([api<Brief>('/v1/intelligence/executive-brief'),api<Me>('/v1/auth/me')]);setData(brief);setName(me.user?.name||'')}catch(e:any){setError(e?.message||'Não foi possível montar seu briefing executivo.')}finally{setLoading(false)}}
  async function track(decision:Decision){if(decision.taskId)return;setBusyId(decision.id);try{await post(`/v1/intelligence/plan/7-days/items/${decision.planItemId}/task`,{});await load()}catch(e:any){setError(e?.message||'Não foi possível acompanhar esta decisão.')}finally{setBusyId('')}}
  async function askTeam(){if(!data||teamBusy)return;setTeamBusy(true);setAnswer('');try{const r=await post<any>('/v1/assistant/chat',{message:data.digitalTeam.prompt,conversationId:null,agentRole:data.digitalTeam.agentRole});setAnswer(r?.message?.content||'A Equipe Digital preparou a leitura, mas não retornou texto.') }catch(e:any){setAnswer(e?.message||'Equipe Digital indisponível agora.')}finally{setTeamBusy(false)}}
  const firstName=useMemo(()=>name.trim().split(/\s+/)[0]||'', [name]);
  if(!host||!active)return null;
  if(!data&&loading)return createPortal(<section className="executiveBrief loading">Montando seu briefing de 30 segundos…</section>,host);
  if(!data)return error?createPortal(<section className="executiveBrief error">{error}</section>,host):null;
  return createPortal(<section className="executiveBrief">
    <header className="executiveHero"><div><small>COMANDO DO DIA · 30 SEGUNDOS</small><h1>{daypart()}{firstName?`, ${firstName}`:''}.</h1><h2>{data.headline}</h2><p>{data.subheadline}</p></div><div className="executiveHealth"><small>SAÚDE DO NEGÓCIO</small><b>{data.health.score??'…'}</b><span>{data.health.delta===null?'Base em formação':`${Number(data.health.delta)>0?'+':''}${data.health.delta} desde a referência`}</span><button onClick={()=>void load()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></div></header>
    {error&&<div className="executiveError">{error}</div>}
    <div className="executiveDecisions"><div className="executiveSectionTitle"><div><small>SUAS DECISÕES</small><h3>O que merece você agora</h3></div><span>{data.decisions.length}/3</span></div>{data.decisions.length?<div className="decisionGrid">{data.decisions.map((d,i)=><article key={d.id} className="decisionCard"><span className="decisionIndex">{i+1}</span><div><b>{d.title}</b><p>{d.detail}</p><small>{d.benefit}</small></div><button disabled={Boolean(d.taskId)||busyId===d.id} onClick={()=>void track(d)}>{d.taskId?'Já acompanhando':busyId===d.id?'Criando…':'Acompanhar'}</button></article>)}</div>:<div className="executiveEmpty">Sem nova decisão crítica agora. O plano semanal continua sendo acompanhado.</div>}</div>
    <div className="executiveSignals"><article className="attention"><small>PONTO DE ATENÇÃO</small><b>{data.attention?.title||'Sem alerta relevante novo'}</b><p>{data.attention?.detail||'Continue acompanhando a rotina; o NexOffice não encontrou uma pressão operacional clara neste momento.'}</p></article><article className="opportunity"><small>OPORTUNIDADE</small><b>{data.opportunity?.title||'Consolide a operação atual'}</b><p>{data.opportunity?.detail||'O melhor ganho agora é continuar registrando a operação para aumentar a qualidade da leitura.'}</p></article><article className="team"><small>EQUIPE DIGITAL · {data.digitalTeam.name.toUpperCase()}</small><b>{data.digitalTeam.title}</b><p>{data.digitalTeam.prompt}</p><button onClick={()=>void askTeam()} disabled={teamBusy}>{teamBusy?'Analisando…':`Perguntar para ${data.digitalTeam.name}`}</button>{answer&&<div className="teamAnswer">{answer}</div>}</article></div>
    <footer className="executiveProgress"><div><b>{data.weeklyProgress.pct}%</b><span>do Plano de 7 dias concluído</span></div><div className="progressTrack"><span style={{width:`${Math.min(100,Math.max(0,data.weeklyProgress.pct))}%`}}/></div><p>{data.weeklyProgress.summary||'O NexOffice acompanha as prioridades desta semana.'}</p></footer>
  </section>,host);
}
