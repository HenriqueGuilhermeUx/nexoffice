import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post} from './api';
import './commercial-growth-center.css';

type CommercialContext={known:any;missing:string[];niche:string;guardrails:any};
type Status={configured:boolean;projects:any[];campaigns:any[];connections:any[];externalCampaignActivation:boolean;insights?:any};

function friendlyError(error:any,fallback:string){
  const code=String(error?.code||'');
  if(code==='modo_not_configured'||code==='marketing_not_configured')return 'A área de Crescimento está sendo conectada neste ambiente. Seus dados estão preservados e nenhuma campanha ou gasto será iniciado enquanto a conexão não estiver pronta.';
  if(code.includes('google')||code.includes('oauth'))return 'A conexão com a conta de mídia ainda precisa ser concluída antes desta ação.';
  return error?.message||fallback;
}

export default function CommercialGrowthCenter({workspaceId}:{workspaceId:string}){
  const [context,setContext]=useState<CommercialContext|null>(null);
  const [status,setStatus]=useState<Status|null>(null);
  const [selectedProject,setSelectedProject]=useState('');
  const [launch,setLaunch]=useState<any>(null);
  const [quality,setQuality]=useState<any>(null);
  const [leads,setLeads]=useState<any[]>([]);
  const [learning,setLearning]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showCampaign,setShowCampaign]=useState(false);

  useEffect(()=>{if(workspaceId)void load()},[workspaceId]);
  const projects=useMemo(()=>status?.projects||[],[status]);
  const project=projects.find((x:any)=>x.id===selectedProject)||launch?.project||projects[0]||null;
  const googleConnection=(status?.connections||[]).find((x:any)=>x.provider==='google_ads');
  const unavailable=Boolean(error&&(!context||!status));

  async function load(){setBusy(true);setError('');try{const [ctx,st]=await Promise.all([api<CommercialContext>('/v1/marketing/commercial/context'),api<Status>('/v1/marketing/status')]);setContext(ctx);setStatus(st);if(!selectedProject&&st.projects?.[0]?.id)setSelectedProject(st.projects[0].id)}catch(e:any){setError(friendlyError(e,'Não foi possível carregar a área de Crescimento.'))}finally{setBusy(false)}}

  async function createCampaign(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');setQuality(null);const form=new FormData(e.currentTarget);try{const result=await post<any>('/v1/marketing/commercial/campaigns',{objective:String(form.get('objective')||'Gerar novos clientes'),offer:String(form.get('offer')||''),location:String(form.get('location')||''),audience:String(form.get('audience')||''),monthlyBudget:Number(form.get('monthlyBudget')||0),ticket:Number(form.get('ticket')||0),provider:String(form.get('provider')||'google_ads'),generateLanding:true,createCreative:true});setLaunch(result);setSelectedProject(result.project.id);setShowCampaign(false);await load();const draftId=result.creative?.request?.id;if(draftId)void pollQuality(draftId)}catch(e:any){setError(friendlyError(e,'Não foi possível preparar a campanha.'))}finally{setBusy(false)}}

  async function pollQuality(id:string){for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,1000));try{const gate=await api<any>(`/v1/marketing/commercial/creatives/${id}/quality`);setQuality(gate);if(gate.status==='ready'||gate.status==='approved'||gate.blockers?.some((x:any)=>x.code!=='ready'))return}catch{return}}}
  async function approveCreative(){const id=launch?.creative?.request?.id;if(!id)return;setBusy(true);setError('');try{const result=await post<any>(`/v1/marketing/commercial/creatives/${id}/approve`,{approved:true});setQuality(result.qualityGate)}catch(e:any){setError(friendlyError(e,'O criativo ainda não pode ser aprovado.'))}finally{setBusy(false)}}
  async function reviewCampaign(){const id=launch?.campaign?.id;if(!id)return;setBusy(true);try{await post(`/v1/marketing/campaigns/${id}/review`,{});await load()}catch(e:any){setError(friendlyError(e,'Não foi possível revisar a campanha.'))}finally{setBusy(false)}}
  async function readyCampaign(){const id=launch?.campaign?.id;if(!id)return;setBusy(true);try{await post(`/v1/marketing/campaigns/${id}/ready`,{approved:true});await load()}catch(e:any){setError(friendlyError(e,'A campanha ainda não pode ficar pronta para mídia.'))}finally{setBusy(false)}}
  async function connectGoogle(){setBusy(true);setError('');try{const result=await post<any>('/v1/marketing/media/google_ads/prepare',{});const url=result?.authorization?.authorizationUrl;if(url)window.open(url,'_blank','noopener,noreferrer');else setError('A conexão com Google Ads ainda não está disponível para esta empresa.')}catch(e:any){setError(friendlyError(e,'Não foi possível iniciar a conexão com Google Ads.'))}finally{setBusy(false)}}
  async function openProject(id:string){setSelectedProject(id);setBusy(true);setError('');try{const [ls,lr]=await Promise.all([api<any[]>(`/v1/marketing/projects/${id}/leads`),api<any>(`/v1/marketing/commercial/projects/${id}/learning`)]);setLeads(Array.isArray(ls)?ls:[]);setLearning(lr)}catch(e:any){setError(friendlyError(e,'Não foi possível abrir os resultados.'))}finally{setBusy(false)}}
  async function syncCrm(){if(!project?.id)return;setBusy(true);setError('');try{await post(`/v1/marketing/commercial/projects/${project.id}/sync-crm`,{});await openProject(project.id)}catch(e:any){setError(friendlyError(e,'Não foi possível sincronizar os leads com Clientes.'))}finally{setBusy(false)}}

  return <section className="commercialGrowth">
    <header className="cgHero">
      <div><p className="eyebrow">CRESCIMENTO E AQUISIÇÃO</p><h2>Da estratégia ao cliente</h2><p>O NexOffice usa o que já conhece da empresa, prepara a campanha e acompanha até lead, oportunidade e cliente — sempre com sua aprovação antes de qualquer mídia ou gasto.</p></div>
      <button className="primary" disabled={unavailable} onClick={()=>setShowCampaign(true)}>+ Criar campanha</button>
    </header>

    <div className="cgFlow">{['Estratégia','Criativo','Revisão','Aprovação','Mídia','Leads','Clientes','Aprendizado'].map((x,i)=><span key={x}><b>{i+1}</b>{x}</span>)}</div>
    {busy&&<div className="cgBusy"/>}{error&&<div className="marketingError"><b>{unavailable?'Crescimento ainda não está disponível neste ambiente.':'Ação não concluída.'}</b><span>{error}</span>{unavailable&&<small>Veja o status completo em Integrações → Prontidão do NexOffice.</small>}</div>}

    {!unavailable&&<><div className="cgGrid">
      <article className="cgCard memory"><small>CONTEXTO DA EMPRESA</small><h3>{context?.known?.business||'Sua empresa'}</h3><p>{context?.known?.sector||'—'}{context?.known?.subsector?` · ${context.known.subsector}`:''} · {context?.known?.revenueModel||'—'}</p><div className="cgFacts"><span>Oferta <b>{context?.known?.offer||'a confirmar'}</b></span><span>Região <b>{context?.known?.location||'a confirmar'}</b></span><span>Público <b>{context?.known?.audience||'a confirmar'}</b></span></div><small>Preço, promoção, certificações e resultados nunca são inventados pelo sistema.</small></article>
      <article className="cgCard media"><small>CONTA DE MÍDIA</small><h3>{googleConnection?'Google Ads conectado':'Google Ads pronto para conectar'}</h3><p>{googleConnection?.accountName||googleConnection?.externalAccountId||'Conecte a conta oficial para acompanhar métricas e, quando autorizado, preparar mídia.'}</p><button onClick={connectGoogle}>{googleConnection?'Revisar conexão':'Conectar Google Ads'}</button><em>Nenhuma mídia ou gasto é ativado automaticamente.</em></article>
    </div>

    {launch&&<div className="cgLaunch">
      <header><div><small>CAMPANHA RECÉM-CRIADA</small><h3>{launch.campaign?.name||launch.project?.name}</h3></div><span className="cgStatus">{launch.campaign?.status||'draft'}</span></header>
      <div className="cgLaunchCols">
        <div><b>Estratégia</b><p>{launch.plan?.summary||launch.plan?.rationale||'Plano preparado com o contexto conhecido da empresa.'}</p><small>Orçamento informado: {Number(launch.project?.monthlyBudget||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}/mês</small></div>
        <div><b>Criativo</b>{quality?<><p className={quality.passed?'cgPass':'cgBlock'}>{quality.passed?'✓ Revisão concluída':`⚠ ${quality.blockers?.length||0} ponto(s) a revisar`}</p>{quality.blockers?.map((x:any)=><small key={x.code}>{x.message}</small>)}{quality.passed&&quality.status!=='approved'&&<button className="primary" onClick={approveCreative}>Aprovar criativo</button>}</>:<p>Preparando e revisando o conteúdo…</p>}</div>
        <div><b>Próximo passo</b><p>A campanha só avança depois da sua revisão, aprovação e conexão da conta de mídia.</p><div className="cgButtons"><button onClick={reviewCampaign}>Revisar campanha</button><button className="primary" onClick={readyCampaign}>Aprovar para mídia</button></div></div>
      </div>
    </div>}

    <div className="cgResults">
      <div className="cgProjects"><header><div><small>FUNIS COMERCIAIS</small><b>{projects.length} projeto(s)</b></div></header>{projects.length?projects.map((p:any)=><button key={p.id} className={project?.id===p.id?'active':''} onClick={()=>openProject(p.id)}><b>{p.name}</b><span>{p.offer}</span><small>{p.location} · {p.status}</small></button>):<div className="cgEmpty">Sua primeira campanha aparecerá aqui.</div>}</div>
      <div className="cgOutcome">{project?<><header><div><small>NEGÓCIO GERADO</small><h3>{project.name}</h3></div><button onClick={()=>openProject(project.id)}>Atualizar</button></header>{learning?<><div className="cgMetrics"><span><b>{learning.funnel?.pageViews||0}</b>visitas</span><span><b>{learning.funnel?.leads||0}</b>leads</span><span><b>{learning.crm?.progressed||0}</b>avançaram</span><span><b>{learning.crm?.customers||0}</b>clientes</span></div><div className="cgLearning"><small>PRÓXIMA RECOMENDAÇÃO</small><b>{learning.nextRecommendation}</b><p>{learning.attribution?.note}</p></div></>:<p>Abra o projeto para carregar funil, Clientes e aprendizado.</p>}<div className="cgLeadHead"><b>Leads capturados ({leads.length})</b><button className="primary" onClick={syncCrm}>Enviar para Clientes</button></div>{leads.slice(0,6).map((l:any)=><div className="cgLead" key={l.id}><b>{l.name||'Lead'}</b><span>{l.email||l.phone||'Contato capturado'}</span></div>)}</>:<div className="cgEmpty"><b>Da campanha ao cliente.</b><p>Selecione ou crie um projeto para acompanhar resultados.</p></div>}</div>
    </div>

    <div className="cgGovernance"><b>Você mantém o controle</b><span>Campanhas, publicação, mídia e gastos dependem de aprovação. O NexOffice prepara, acompanha e aprende; nenhuma verba é aumentada ou ativada sozinha.</span></div></>}

    {showCampaign&&<div className="marketingModalBack" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setShowCampaign(false)}}><form className="marketingCreateModal cgModal" onSubmit={createCampaign}><button type="button" className="marketingClose" onClick={()=>setShowCampaign(false)}>×</button><p className="eyebrow">CRIAR CAMPANHA</p><h2>Qual resultado você quer gerar?</h2><p>O NexOffice já trouxe o que conhece. Confirme apenas o que muda nesta campanha.</p><div className="marketingFormGrid"><label className="wide"><span>Objetivo</span><input name="objective" defaultValue="Gerar novos clientes" required/></label><label className="wide"><span>Oferta</span><input name="offer" defaultValue={context?.known?.offer||''} placeholder="Ex.: Consultoria tributária para PMEs" required/></label><label><span>Região</span><input name="location" defaultValue={context?.known?.location||''} placeholder="Ex.: Santos e Baixada Santista" required/></label><label><span>Canal</span><select name="provider" defaultValue="google_ads"><option value="google_ads">Google Ads</option><option value="meta_ads">Meta Ads</option></select></label><label className="wide"><span>Público desejado</span><textarea name="audience" rows={3} defaultValue={context?.known?.audience||''} placeholder="Opcional se ainda não estiver definido"/></label><label><span>Orçamento mensal para planejamento</span><input name="monthlyBudget" type="number" min="0" step="50" required/></label><label><span>Ticket médio (se conhecido)</span><input name="ticket" type="number" min="0" step="50"/></label></div><div className="marketingModalFoot"><small>Criar a campanha não ativa mídia nem gasto.</small><button className="primary" disabled={busy}>{busy?'Preparando estratégia…':'Criar estratégia + campanha'}</button></div></form></div>}
  </section>;
}
