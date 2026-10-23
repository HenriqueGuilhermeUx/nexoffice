import {useCallback,useEffect,useState} from 'react';
import './nex-personal-life-office.css';
import PersonalMarketplaceLab from './PersonalMarketplaceLab';

type Area='money'|'health'|'education'|'family'|'documents'|'work'|'shopping'|'travel'|'vehicle'|'investments'|'marketing'|'offers'|'public_services'|'debt_review'|'legal_support';
type Kind='buy_car'|'trip'|'email'|'family_study'|'health_organize'|'investment_review'|'publish'|'documents'|'buy_phone'|'family_planning';
type Route='money'|'spending'|'planning'|'wealth'|'agents'|'maya'|'privacy';
type Agent='expenses'|'financial'|'planning'|'investments'|'shopping'|'simulations'|'payments'|'contracts'|'public_services'|'debt_review'|'legal_support';
type Preferences={focus_areas:Area[];proactive_mode:'off'|'on_open'};
type Intent={id:string;kind:Kind;status:'planned'|'done';created_at:string};
type Life={preferences:Preferences;intents:Intent[];proactiveDeliveryActive:false;marketingPersonalization:false;partnerDataShared:false;connectedProducts:[]};
type Room={id:Area;title:string;emoji:string;agent:string;tagline:string;source:string;ready:boolean;description:string;route?:Route;tag:string};

const ROOMS:ReadonlyArray<Room>=[
 {id:'money',title:'Meu dinheiro',emoji:'💳',agent:'Nina',tagline:'Organiza seu dinheiro e suas contas.',source:'Organização financeira pessoal',ready:true,description:'Organize saldos declarados, extratos, gastos e compromissos.',route:'money',tag:'Acessível'},
 {id:'investments',title:'Investimentos',emoji:'📈',agent:'Léo',tagline:'Revisa investimentos, taxas e riscos.',source:'Acompanhamento de patrimônio',ready:true,description:'Faça um diagnóstico inicial do patrimônio informado, sem cotações ou ordens.',route:'agents',tag:'Análise inicial'},
 {id:'shopping',title:'Compras e crédito',emoji:'🛍️',agent:'Bia',tagline:'Compara compras, preços e parcelas.',source:'Comparação e simulação',ready:true,description:'Simule preços e parcelas. Comparação real de ofertas ainda depende de parceiros.',route:'agents',tag:'Simulador'},
 {id:'health',title:'Minha saúde',emoji:'🩺',agent:'Luna',tagline:'Ajuda a organizar seus cuidados de saúde.',source:'Central de cuidado e bem-estar',ready:false,description:'Visão futura de organização, consultas, documentos e cuidado, com proteção reforçada e autorização própria.',tag:'Integração planejada'},
 {id:'education',title:'Educação',emoji:'📚',agent:'Duda',tagline:'Apoia estudos, tarefas e aprendizado.',source:'Estudos e aprendizagem',ready:false,description:'Estudos e aprendizagem para adultos e apoio familiar, sem perfilar crianças.',tag:'Integração planejada'},
 {id:'documents',title:'Documentos',emoji:'🗂️',agent:'Mel',tagline:'Cuida de documentos e contratos.',source:'Central de documentos',ready:true,description:'Hoje: checklist textual com Mel. Criação e assinatura digital dependerão de integração segura.',route:'agents',tag:'Checklist disponível'},
 {id:'work',title:'Meu dia',emoji:'🗓️',agent:'Zoe',tagline:'Organiza agenda, tarefas e lembretes.',source:'Agenda e assistente pessoal',ready:false,description:'Organização de agenda, lembretes, reuniões e tarefas, com controles próprios.',tag:'Integração planejada'},
 {id:'travel',title:'Viagens e lazer',emoji:'🧳',agent:'Kai',tagline:'Ajuda a planejar viagens e passeios.',source:'Viagens e hospedagens',ready:false,description:'Planejamento de viagens, hotéis e aluguel, com comparação transparente antes da compra.',tag:'Jornada disponível'},
 {id:'vehicle',title:'Mobilidade',emoji:'🚘',agent:'Max',tagline:'Facilita compras e cuidados com o carro.',source:'Vida sobre rodas',ready:false,description:'Jornada de compra e venda de carro, documentação, financiamento e anúncio.',tag:'Jornada disponível'},
 {id:'family',title:'Casa e família',emoji:'🏠',agent:'Luca',tagline:'Ajuda na rotina da casa e da família.',source:'Rotina em família',ready:false,description:'Calendário doméstico e estudos, sem coleta automática de dados de menores.',tag:'Jornada disponível'},
 {id:'marketing',title:'Criação e mídia',emoji:'🎨',agent:'Gabi',tagline:'Ajuda a criar posts e anúncios.',source:'Criação de conteúdo',ready:false,description:'Preparar publicações, anúncios e peças para aprovação do cliente. Publicação integrada ainda pendente.',tag:'Integração planejada'},
 {id:'offers',title:'Oportunidades',emoji:'🎁',agent:'Noah',tagline:'Reúne oportunidades para você comparar.',source:'Ofertas e oportunidades',ready:false,description:'Futuro catálogo multiparceiro. Ofertas patrocinadas identificadas, comissões claras, sem uso de dados sensíveis.',tag:'Marketplace futuro'},
 {id:'public_services',title:'Serviços públicos',emoji:'🏛️',agent:'Theo',tagline:'Orienta IPTU, CIN, alvarás e Detran.',source:'Ajuda com órgãos públicos',ready:true,route:'agents',description:'Como obter segunda via de IPTU, identidade, licenças e serviços do Detran, com links oficiais.',tag:'Guia local disponível'},
 {id:'debt_review',title:'Resolver dívidas',emoji:'🤝',agent:'Joca',tagline:'Ajuda a revisar dívidas e negociar.',source:'Organizador de negociações',ready:true,route:'agents',description:'Compare custo total de acordos, organize propostas e prepare mensagens ao credor.',tag:'Simulação privada'},
 {id:'legal_support',title:'Entender direitos',emoji:'⚖️',agent:'Bella',tagline:'Explica contratos, direitos e dúvidas legais.',source:'Guia jurídico inicial',ready:true,route:'agents',description:'Tire dúvidas iniciais sobre contratos, condomínio, cobranças e trabalho.',tag:'Checklist privado'}
];
const JOURNEYS:ReadonlyArray<{kind:Kind;title:string;summary:string;room:Area;steps:string[];route?:Route}>=[
 {kind:'buy_car',title:'Comprar ou trocar de carro',room:'vehicle',summary:'Da escolha à venda do usado, documentação e financiamento.',steps:['Definir faixa de preço e custo total','Comparar propostas e CET de financiamento','Revisar documentação e contrato','Preparar anúncio do carro anterior'],route:'agents'},
 {kind:'buy_phone',title:'Comprar um celular',room:'shopping',summary:'Escolha informada, parcelas e orçamento.',steps:['Definir necessidades e teto de gasto','Comparar preços e condições verificadas','Simular parcelas e impacto no orçamento'],route:'agents'},
 {kind:'trip',title:'Organizar um fim de semana',room:'travel',summary:'Viagem, hotel, transporte e orçamento.',steps:['Escolher destino e datas','Comparar hospedagens e cancelamento','Separar orçamento e pagamentos'],route:'planning'},
 {kind:'email',title:'Resolver algo por e-mail',room:'work',summary:'Planejar uma resposta e registrar o próximo passo.',steps:['Definir destinatário e objetivo','Preparar a mensagem e revisar','Enviar apenas com sua autorização'],route:'maya'},
 {kind:'investment_review',title:'Revisar meus investimentos',room:'investments',summary:'Custos, concentração e proteção dos recursos.',steps:['Organizar posição, emissor e tipo do produto','Verificar elegibilidade e concentração para FGC','Comparar custos, liquidez, risco e rentabilidade líquida','Preparar pedido de renegociação ao banco'],route:'wealth'},
 {kind:'documents',title:'Criar ou revisar um contrato',room:'documents',summary:'Do checklist até assinatura, quando conectada.',steps:['Organizar objeto, partes e prazos','Revisar cláusulas relevantes','Gerar minuta e enviar para assinatura com autorização'],route:'agents'},
 {kind:'family_study',title:'Apoiar estudos da família',room:'education',summary:'Organização educacional com respeito à privacidade.',steps:['Escolher uma matéria ou objetivo de estudo','Criar roteiro e exercícios','Revisar evolução sem publicidade dirigida a menores']},
 {kind:'health_organize',title:'Organizar cuidados de saúde',room:'health',summary:'Lembretes e informações de saúde em ambiente separado.',steps:['Definir quais serviços deseja acessar','Autorizar separadamente a sua carteira de saúde quando disponível','Consultar informações sem compartilhar dados com anúncios']},
 {kind:'publish',title:'Criar uma publicação',room:'marketing',summary:'Ideia, texto e divulgação com aprovação.',steps:['Definir público e objetivo da publicação','Criar rascunho e visual','Publicar somente após revisar e autorizar']},
 {kind:'family_planning',title:'Organizar o mês em casa',room:'family',summary:'Compromissos familiares e contas recorrentes.',steps:['Listar prioridades do mês','Criar lembretes e orçamento','Revisar antes de assumir novos compromissos'],route:'planning'}
];
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');
async function request<T>(path:string,token:string,method='GET',payload?:unknown):Promise<T>{
 const r=await fetch(API+path,{method,headers:{authorization:'Bearer '+token,...(payload!==undefined?{'content-type':'application/json'}:{})},
  ...(payload!==undefined?{body:JSON.stringify(payload)}:{})}).catch(()=>{throw new Error('Sem comunicação com a API. Atualize a homologação e tente novamente.');});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(body.message||'Não foi possível concluir a solicitação.');
 return body as T;
}
const formatDate=(date:string)=>new Date(date).toLocaleDateString('pt-BR');
export default function NexPersonalLifeOffice({token,onOpenSection,onOpenAgent}:{
 token:string;onOpenSection:(section:Route)=>void;onOpenAgent:(agent:Agent)=>void
}){
 const [data,setData]=useState<Life|null>(null);
 const [area,setArea]=useState<Area>('money');
 const [journey,setJourney]=useState<Kind>('buy_car');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selecting,setSelecting]=useState(false);
 const [draftFocus,setDraftFocus]=useState<Area[]>([]);
 const [proactive,setProactive]=useState<'off'|'on_open'>('off');
 const refresh=useCallback(async()=>{
  const next=await request<Life>('/v1/personal/life',token);
  setData(next);setDraftFocus(next.preferences.focus_areas);setProactive(next.preferences.proactive_mode);
 },[token]);
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Falha no carregamento.'));},[refresh]);
 const selected=ROOMS.find(r=>r.id===area)!;
 const selectedJourney=JOURNEYS.find(j=>j.kind===journey)!;
 const active=(data?.intents||[]).filter(j=>j.status==='planned');
 const focus=data?.preferences.focus_areas||[];
 const visibleRooms=[...ROOMS].sort((a,b)=>{
  const ai=focus.indexOf(a.id),bi=focus.indexOf(b.id);
  return (ai<0?999:ai)-(bi<0?999:bi);
 });
 const shouldHighlight=data?.preferences.proactive_mode==='on_open';
 const suggested=shouldHighlight?active[0]:undefined;
 const nextJourney=suggested?JOURNEYS.find(j=>j.kind===suggested.kind):null;

 async function savePreferences(){
  setBusy(true);setError('');setNotice('');
  try{
   await request('/v1/personal/life/preferences',token,'PUT',{focusAreas:draftFocus,proactiveMode:proactive});
   await refresh();setSelecting(false);setNotice('Preferências atualizadas. Nenhuma comunicação externa ou anúncio foi ativado.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}
  finally{setBusy(false);}
 }
 async function startJourney(){
  setBusy(true);setError('');setNotice('');
  try{
   await request('/v1/personal/life/intents',token,'POST',{kind:journey});
   await refresh();setNotice('Jornada adicionada às suas prioridades. Nenhuma compra, assinatura ou pagamento foi iniciado.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar.');}
  finally{setBusy(false);}
 }
 async function complete(id:string){
  setBusy(true);setError('');
  try{await request('/v1/personal/life/intents/'+id+'/complete',token,'POST',{});await refresh();setNotice('Jornada concluída.');}
  catch(e){setError(e instanceof Error?e.message:'Falha ao concluir.');}
  finally{setBusy(false);}
 }
 return <div className="np-life">
  <div className="np-life-hero">
   <div>
    <div className="np-kicker">NEX PERSONAL · SISTEMA OPERACIONAL DA VIDA</div>
    <h2>Entre. Escolha um ambiente. Resolva sua vida.</h2>
    <p>Seu escritório pessoal em 2D. A Maya direciona cada necessidade a um especialista, sem misturar seus dados entre empresas.</p>
   </div>
   <div className="np-life-maya"><span className="np-life-maya-icon">M</span><div><strong>Maya</strong><small>Coordenadora · no seu controle</small></div></div>
  </div>
  {shouldHighlight&&<section className="np-life-nudge" role="status">
    <div><span className="np-kicker">MAYA · LEMBRETE NA ABERTURA</span>
      <strong>{nextJourney?'Retomar: '+nextJourney.title:'Uma prioridade de cada vez'}</strong>
      <p>{nextJourney?'Você guardou esta jornada. Confira o roteiro e decida o próximo passo.':'Você pode selecionar um ambiente ou iniciar uma jornada; suas áreas favoritas aparecerão primeiro no escritório.'}</p>
    </div>
    {nextJourney&&<button type="button" className="np-studio-secondary" onClick={()=>{setJourney(nextJourney.kind);setArea(nextJourney.room);}}>Ver meu roteiro</button>}
  </section>}
  <section className="np-life-map-wrap" aria-label="Escritório 2D com ambientes de atendimento">
   <div className="np-life-map-head"><strong>SEU ESCRITÓRIO DE VIDA</strong><small>Clique nos ambientes para ver o que já funciona e o que está em integração.</small></div>
   <div className="np-life-floor">
    {visibleRooms.map((room,index)=><button key={room.id} type="button"
       className={'np-life-room '+(area===room.id?'np-life-room-current ':'')+(room.ready?'np-life-room-ready':'np-life-room-planned')}
       onClick={()=>{setArea(room.id);const first=JOURNEYS.find(j=>j.room===room.id);if(first)setJourney(first.kind);}}
       aria-pressed={area===room.id} aria-label={'Conhecer '+room.agent+', '+room.title+'. '+room.tagline}>
       <span className="np-life-room-number">{String(index+1).padStart(2,'0')}</span>
       <span className="np-life-room-emoji" aria-hidden="true">{room.emoji}</span>
       <strong className="np-life-room-agent">{room.agent}</strong>
       <span className="np-life-room-category">{room.title}</span>
       <small className="np-life-room-tagline">{room.tagline}</small>
       <span className="np-life-door" aria-hidden="true"/>
    </button>)}
   </div>
   <div className="np-life-corridor"><span>RECEPÇÃO</span><span>◆ MAYA · SUA VIDA, UM SÓ LUGAR</span><span>ESCOLHA LIVRE</span></div>
  </section>
  <section className="np-panel np-life-detail">
   <div className="np-life-room-detail-head"><div className="np-life-large-icon">{selected.emoji}</div>
    <div><span className="np-kicker">{selected.title.toUpperCase()}</span><h2>{selected.agent}</h2>
      <p className="np-life-agent-line">{selected.tagline}</p><p>{selected.description}</p></div>
   </div>
   <div className="np-life-detail-foot">
    <span className="np-life-availability">{selected.tag}</span>
    {selected.route?<button className="np-primary" type="button" onClick={()=>selected.route==='agents'?onOpenAgent(selected.id==='investments'?'investments':selected.id==='shopping'?'shopping':selected.id==='public_services'?'public_services':selected.id==='debt_review'?'debt_review':selected.id==='legal_support'?'legal_support':'contracts'):onOpenSection(selected.route!)}>Abrir ferramenta disponível →</button>:
     <span className="np-life-notlive">Experiência integrada em preparação · nenhuma conexão de dados ativa</span>}
   </div>
  </section>
  {(area==='offers'||area==='shopping')&&<PersonalMarketplaceLab/>}
  <div className="np-life-columns">
   <section className="np-panel">
    <div className="np-life-header-row"><div><span className="np-kicker">JORNADAS COMPLETAS</span><h2>O que você quer resolver?</h2></div><small>Roteiros organizados, não operações reais</small></div>
    <div className="np-life-journeys">
     {JOURNEYS.map(item=><button key={item.kind} type="button" className={'np-life-journey '+(journey===item.kind?'np-life-journey-active':'')}
      onClick={()=>{setJourney(item.kind);setArea(item.room);}}>
      <strong>{item.title}</strong><small>{item.summary}</small></button>)}
    </div>
    <div className="np-life-steps">
      <h3>{selectedJourney.title}</h3><ol>{selectedJourney.steps.map(s=><li key={s}>{s}</li>)}</ol>
      <div className="np-life-steps-actions"><button className="np-primary" type="button" disabled={busy} onClick={()=>void startJourney()}>Guardar nos meus planos</button>
      {selectedJourney.route&&<button className="np-studio-secondary" type="button" onClick={()=>selectedJourney.route==='agents'?onOpenAgent(selectedJourney.kind==='documents'?'contracts':selectedJourney.kind==='investment_review'?'investments':'shopping'):onOpenSection(selectedJourney.route!)}>Usar recurso disponível</button>}</div>
    </div>
   </section>
   <section className="np-panel">
    <div className="np-life-header-row"><div><span className="np-kicker">RELACIONAMENTO PERSONALIZADO</span><h2>Suas prioridades</h2></div>
     <button type="button" className="np-studio-secondary" onClick={()=>setSelecting(!selecting)}>{selecting?'Fechar':'Personalizar'}</button></div>
    <p className="np-life-small">Você escolhe os assuntos que importam. Nenhuma informação de saúde, menores ou outros produtos é lida automaticamente.</p>
    {selecting&&<div className="np-life-preferences">
     <strong>Em que áreas quer ajuda?</strong><div className="np-life-chips">
      {ROOMS.map(room=><label key={room.id}><input type="checkbox" checked={draftFocus.includes(room.id)} onChange={e=>{
       setDraftFocus(a=>e.target.checked?[...a,room.id].slice(0,6):a.filter(x=>x!==room.id));
      }}/>{room.title}</label>)}
     </div>
     <label className="np-life-proactive"><input type="checkbox" checked={proactive==='on_open'} onChange={e=>setProactive(e.target.checked?'on_open':'off')}/>
      Mostrar lembretes e sugestões quando eu abrir o Nex Personal (sem notificações externas)</label>
     <button type="button" className="np-primary" disabled={busy} onClick={()=>void savePreferences()}>Salvar minhas escolhas</button>
    </div>}
    {!selecting&&<div className="np-life-selected-areas">{(data?.preferences.focus_areas||[]).length?
     data?.preferences.focus_areas.map(k=><span key={k}>{ROOMS.find(r=>r.id===k)?.title}</span>):<p>Nenhuma área priorizada ainda. Personalize seu espaço.</p>}</div>}
    <div className="np-life-tasks"><div className="np-life-header-row"><h3>Jornadas em andamento</h3><small>{active.length} aberta(s)</small></div>
     {active.length===0?<p className="np-life-empty">Escolha uma jornada para começar. A Maya acompanhará suas prioridades aqui.</p>:
      active.map(item=><div className="np-life-task" key={item.id}><div><strong>{JOURNEYS.find(j=>j.kind===item.kind)?.title}</strong><small>Iniciada em {formatDate(item.created_at)}</small></div>
       <button type="button" className="np-studio-secondary" disabled={busy} onClick={()=>void complete(item.id)}>Concluir</button></div>)}
    </div>
    <div className="np-life-policy"><strong>Privacidade como padrão</strong><p>Marketing personalizado desligado. Dados entre aplicativos não são compartilhados. Agentics com ações externas exige consentimentos e aprovações específicos.</p>
     <button className="np-text-button" type="button" onClick={()=>onOpenSection('privacy')}>Consultar privacidade →</button></div>
   </section>
  </div>
  {error&&<p className="np-error" role="alert">{error}</p>}
  {notice&&<p className="np-studio-success" role="status">{notice}</p>}
  {!data&&!error&&<p className="np-life-small">Preparando suas preferências pessoais…</p>}
 </div>;
}
