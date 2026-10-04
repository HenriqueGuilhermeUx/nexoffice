import {useEffect,useMemo,useState} from 'react';
import {api,post,session} from './api';
import './materials-center.css';

type MaterialKind='presentation'|'proposal'|'report'|'onepage'|'image';
type ThemeKey='executive'|'bold'|'light';
type Slide={kicker?:string;title:string;subtitle?:string;bullets?:string[];cta?:string};
type Draft={title:string;subtitle?:string;slides:Slide[];generatedBy?:string};
type OnboardingPayload={workspace?:{id:string;name:string};profile?:any;onboarding?:any};
type Dashboard={crm?:{open_deals?:number;open_pipeline_minor?:number};finance?:{receivable_minor?:number;overdue_count?:number};appointments?:{today_appointments?:number};tasks?:{due_tasks?:number}};

const kindMeta:Record<MaterialKind,{label:string;description:string;slides:number;prompt:string}> = {
  presentation:{label:'Apresentação',description:'Deck para reunião, venda, parceria ou demonstração.',slides:7,prompt:'uma apresentação comercial'},
  proposal:{label:'Proposta',description:'Proposta clara com contexto, solução, escopo, valor e próximos passos.',slides:6,prompt:'uma proposta comercial'},
  report:{label:'Relatório',description:'Mostre trabalho, evolução, resultados e próximos passos.',slides:6,prompt:'um relatório executivo'},
  onepage:{label:'Resumo visual',description:'Uma página para WhatsApp, reunião ou envio rápido.',slides:1,prompt:'um one-page comercial'},
  image:{label:'Imagem',description:'Peça visual simples para explicar uma oferta, ideia ou resultado.',slides:1,prompt:'uma peça visual comercial'}
};

const palettes:Record<ThemeKey,{bg:string;card:string;text:string;muted:string;accent:string;soft:string}> = {
  executive:{bg:'#07111f',card:'#10223a',text:'#f8fbff',muted:'#a9b8ca',accent:'#55e6c1',soft:'#17314f'},
  bold:{bg:'#180f2b',card:'#271544',text:'#fff8ff',muted:'#c7b7de',accent:'#a987ff',soft:'#3b2261'},
  light:{bg:'#f3f7fb',card:'#ffffff',text:'#112338',muted:'#5c6d80',accent:'#1769ff',soft:'#dfeaf7'}
};

function clean(value:any){return String(value??'').replace(/\s+/g,' ').trim()}
function slug(value:string){return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'material-nexoffice'}
function money(minor:any=0){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(minor||0)/100)}
function safeArray(value:any){return Array.isArray(value)?value.map(clean).filter(Boolean).slice(0,8):[]}
function htmlEscape(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}

function businessSummary(payload:OnboardingPayload|null){
  const p=payload?.profile||{};const m=p.metadata||{};const i=m.identity||{};const o=m.offer||{};const c=m.commercial||{};const f=m.finance||{};const fiscal=m.fiscal||{};const ops=m.operations||{};const d=m.digital||{};const contact=m.contact||{};
  const pieces=[
    `Negócio: ${clean(i.businessName||i.tradeName||payload?.workspace?.name)}`,
    p.sector?`Setor: ${clean(p.sector)}`:'',
    p.subsector?`Atividade: ${clean(p.subsector)}`:'',
    clean(o.description||i.description)?`Descrição: ${clean(o.description||i.description)}`:'',
    safeArray(o.productsOrServices).length?`Produtos/serviços: ${safeArray(o.productsOrServices).join(', ')}`:'',
    clean(c.targetAudience)?`Público: ${clean(c.targetAudience)}`:'',
    clean(c.primarySalesChannel||p.primary_sales_channel)?`Canal comercial: ${clean(c.primarySalesChannel||p.primary_sales_channel)}`:'',
    clean(f.revenueRange)?`Faixa de faturamento: ${clean(f.revenueRange)}`:'',
    clean(f.ticketRange)?`Ticket: ${clean(f.ticketRange)}`:'',
    safeArray(f.paymentMethods).length?`Recebimento: ${safeArray(f.paymentMethods).join(', ')}`:'',
    clean(fiscal.invoiceUsage)?`Fiscal: ${clean(fiscal.invoiceUsage)}`:'',
    clean(ops.mainPain)?`Principal gargalo: ${clean(ops.mainPain)}`:'',
    clean(ops.goal90d)?`Objetivo 90 dias: ${clean(ops.goal90d)}`:'',
    clean(d.website)?`Site: ${clean(d.website)}`:'',
    clean(d.instagram)?`Instagram: ${clean(d.instagram)}`:'',
    clean(contact.whatsapp)?`WhatsApp: ${clean(contact.whatsapp)}`:''
  ].filter(Boolean);
  return pieces.join('\n');
}

function extractJson(text:string):Draft|null{
  try{
    const raw=text.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
    if(start<0||end<=start)return null;
    const parsed=JSON.parse(raw.slice(start,end+1));
    const slides=(Array.isArray(parsed?.slides)?parsed.slides:[]).map((s:any)=>({
      kicker:clean(s?.kicker).slice(0,80)||undefined,
      title:clean(s?.title).slice(0,140)||'',
      subtitle:clean(s?.subtitle).slice(0,300)||undefined,
      bullets:safeArray(s?.bullets).map(x=>x.slice(0,220)),
      cta:clean(s?.cta).slice(0,220)||undefined
    })).filter((s:Slide)=>s.title);
    if(!slides.length)return null;
    return {title:clean(parsed?.title).slice(0,160)||slides[0].title,subtitle:clean(parsed?.subtitle).slice(0,260)||undefined,slides,generatedBy:'Equipe de IA'};
  }catch{return null}
}

function fallbackDraft(kind:MaterialKind,args:{businessName:string;title:string;audience:string;objective:string;context:string;value:string;cta:string},dashboard:Dashboard|null):Draft{
  const name=args.businessName||'Seu negócio',target=args.audience||'seu cliente',offer=args.title||'Uma solução preparada para o seu cliente';
  if(kind==='proposal')return{title:offer,subtitle:`Proposta para ${target}`,generatedBy:'Template NexOffice',slides:[
    {kicker:'PROPOSTA',title:offer,subtitle:`${name} · preparada para ${target}`},
    {kicker:'CONTEXTO',title:'O que precisa ser resolvido',bullets:[args.objective||'Organizar uma solução objetiva para a necessidade apresentada.',args.context||'Escopo alinhado ao contexto informado para esta oportunidade.']},
    {kicker:'SOLUÇÃO',title:'Como vamos ajudar',bullets:['Entendimento do cenário e definição do caminho','Execução com entregáveis claros','Acompanhamento e próximos passos combinados']},
    {kicker:'ESCOPO',title:'O que está incluído',bullets:['Planejamento inicial','Execução do trabalho acordado','Entrega e revisão com o cliente']},
    {kicker:'INVESTIMENTO',title:args.value||'Investimento a confirmar',subtitle:'Valores e condições podem ser ajustados antes do envio final.'},
    {kicker:'PRÓXIMO PASSO',title:args.cta||'Vamos avançar?',subtitle:'Confirme o escopo e seguimos para formalização.'}
  ]};
  if(kind==='report')return{title:offer,subtitle:`Relatório para ${target}`,generatedBy:'Template NexOffice',slides:[
    {kicker:'RELATÓRIO',title:offer,subtitle:`${name} · visão executiva`},
    {kicker:'RESUMO',title:'O que aconteceu no período',bullets:[args.context||'Atividades e entregas organizadas no período.','Foco no que gera valor percebido para o cliente.']},
    {kicker:'COMERCIAL',title:'Movimento do relacionamento',bullets:[`${dashboard?.crm?.open_deals||0} oportunidade(s) aberta(s)`,`Pipeline atual: ${money(dashboard?.crm?.open_pipeline_minor)}`]},
    {kicker:'FINANCEIRO',title:'Situação operacional',bullets:[`A receber: ${money(dashboard?.finance?.receivable_minor)}`,`${dashboard?.finance?.overdue_count||0} item(ns) vencido(s)`]},
    {kicker:'PRÓXIMO CICLO',title:'Prioridades',bullets:[args.objective||'Continuar a execução do plano acordado.','Acompanhar pendências e novas oportunidades.']},
    {kicker:'ENCERRAMENTO',title:args.cta||'Seguimos para o próximo ciclo.',subtitle:'Resumo preparado pelo NexOffice com base no contexto disponível.'}
  ]};
  if(kind==='onepage'||kind==='image')return{title:offer,generatedBy:'Template NexOffice',slides:[{kicker:kind==='image'?'DESTAQUE':'RESUMO VISUAL',title:offer,subtitle:args.objective||`${name} para ${target}`,bullets:[args.context||'Uma mensagem clara, objetiva e pronta para apresentar.',args.value||'Valor e condições sob consulta'].filter(Boolean),cta:args.cta||'Fale com a gente para saber mais.'}]};
  return{title:offer,subtitle:`${name} · apresentação para ${target}`,generatedBy:'Template NexOffice',slides:[
    {kicker:'APRESENTAÇÃO',title:offer,subtitle:`${name} · para ${target}`},
    {kicker:'CONTEXTO',title:'Por que estamos falando sobre isso',bullets:[args.objective||'Apresentar uma solução clara e relevante.',args.context||'Contexto construído a partir das informações disponíveis.']},
    {kicker:'OPORTUNIDADE',title:'O que pode melhorar',bullets:['Mais clareza para decidir','Execução organizada','Acompanhamento dos próximos passos']},
    {kicker:'SOLUÇÃO',title:'O que propomos',bullets:['Uma abordagem prática para o objetivo','Entregáveis definidos','Revisão antes de qualquer ação externa']},
    {kicker:'COMO FUNCIONA',title:'Da ideia à entrega',bullets:['Alinhamento','Preparação','Execução','Apresentação do resultado']},
    {kicker:'INVESTIMENTO',title:args.value||'Condições sob medida',subtitle:'A proposta pode ser ajustada conforme escopo e prazo.'},
    {kicker:'PRÓXIMO PASSO',title:args.cta||'Vamos conversar?',subtitle:'Definimos o escopo final e seguimos para execução.'}
  ]};
}

export default function MaterialsCenter(){
  const[kind,setKind]=useState<MaterialKind>('presentation');const[theme,setTheme]=useState<ThemeKey>('executive');const[profile,setProfile]=useState<OnboardingPayload|null>(null);const[dashboard,setDashboard]=useState<Dashboard|null>(null);
  const[title,setTitle]=useState('');const[audience,setAudience]=useState('');const[objective,setObjective]=useState('');const[context,setContext]=useState('');const[value,setValue]=useState('');const[cta,setCta]=useState('');
  const[draft,setDraft]=useState<Draft|null>(null);const[current,setCurrent]=useState(0);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
  const businessName=clean(profile?.profile?.metadata?.identity?.businessName||profile?.profile?.metadata?.identity?.tradeName||profile?.workspace?.name||'Seu negócio');
  const palette=palettes[theme];
  useEffect(()=>{
    try{
      const quick=JSON.parse(sessionStorage.getItem('nexoffice.quickAction')||'null');
      if(quick?.id==='proposal-material')setKind('proposal');
      else if(quick?.id==='visual-material')setKind('image');
      else if(quick?.id==='presentation')setKind('presentation');
      if(['proposal-material','visual-material','presentation'].includes(String(quick?.id||'')))sessionStorage.removeItem('nexoffice.quickAction');
    }catch{}
    void Promise.all([api<OnboardingPayload>('/v1/onboarding/business').catch(()=>null),api<Dashboard>('/v1/dashboard').catch(()=>null)]).then(([p,d])=>{if(p)setProfile(p);if(d)setDashboard(d)});
  },[]);
  const ready=useMemo(()=>Boolean(title.trim()||objective.trim()||context.trim()),[title,objective,context]);

  async function generate(){
    setBusy(true);setError('');setNotice('');
    const meta=kindMeta[kind],baseArgs={businessName,title:title.trim(),audience:audience.trim(),objective:objective.trim(),context:context.trim(),value:value.trim(),cta:cta.trim()};
    try{
      const business=businessSummary(profile);
      const prompt=`Você é Maya, responsável por transformar o contexto do Negócio em materiais profissionais para o cliente apresentar a clientes, parceiros ou equipe.
Crie ${meta.prompt} em português brasileiro, com ${meta.slides} ${meta.slides===1?'página':'slides'}.
Use somente fatos fornecidos abaixo. NÃO invente faturamento, clientes, cases, métricas, resultados ou promessas. Se um dado não existir, use formulação qualitativa.
O material precisa ser claro, comercial, apresentável e fácil de editar depois.
Negócio:
${business||businessName}
Pedido:
- Título/oferta: ${baseArgs.title||'defina a partir do objetivo'}
- Público/destinatário: ${baseArgs.audience||'cliente ou parceiro'}
- Objetivo: ${baseArgs.objective||'apresentar valor com clareza'}
- Contexto adicional: ${baseArgs.context||'nenhum'}
- Investimento/condição: ${baseArgs.value||'não informado'}
- CTA: ${baseArgs.cta||'defina um próximo passo neutro'}

Responda SOMENTE JSON válido, sem markdown, neste formato:
{"title":"...","subtitle":"...","slides":[{"kicker":"...","title":"...","subtitle":"...","bullets":["..."],"cta":"..."}]}
Regras: títulos curtos; no máximo 4 bullets por slide; bullets curtos; não usar campos vazios desnecessários; o último slide deve indicar próximo passo.`;
      const response=await post<any>('/v1/assistant/staff',{message:prompt,agentRole:'growth'});
      const parsed=extractJson(String(response?.message?.content||''));
      const next=parsed||fallbackDraft(kind,baseArgs,dashboard);
      setDraft({...next,slides:next.slides.slice(0,Math.max(meta.slides,1))});setCurrent(0);
      setNotice(parsed?'Conteúdo preparado com o DNA do Negócio. Revise antes de enviar.':'A IA não devolveu estrutura válida; preparei um rascunho seguro para você continuar.');
      saveLocal({...next,slides:next.slides.slice(0,Math.max(meta.slides,1))},kind,theme);
    }catch(e:any){
      const next=fallbackDraft(kind,baseArgs,dashboard);setDraft(next);setCurrent(0);saveLocal(next,kind,theme);
      setNotice('Preparei um rascunho local para você não ficar parado. A equipe de IA pode ser usada novamente quando estiver disponível.');
      if(e?.message)setError('A geração avançada não respondeu desta vez; o rascunho local continua utilizável.');
    }finally{setBusy(false)}
  }

  function saveLocal(next:Draft,k:MaterialKind,t:ThemeKey){
    try{const key=`nexoffice.materials.${session.workspace()||'local'}`;const list=JSON.parse(localStorage.getItem(key)||'[]');const item={id:Date.now(),kind:k,theme:t,draft:next};localStorage.setItem(key,JSON.stringify([item,...(Array.isArray(list)?list:[])].slice(0,12)))}catch{}
  }

  async function exportPptx(){
    if(!draft)return;setBusy(true);setError('');
    try{
      const mod=await import('pptxgenjs');const PptxGenJS:any=(mod as any).default||mod;const pptx:any=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author=businessName;pptx.company=businessName;pptx.subject=draft.title;pptx.title=draft.title;pptx.lang='pt-BR';
      draft.slides.forEach((s,idx)=>{
        const slide:any=pptx.addSlide();slide.background={color:palette.bg.replace('#','')};
        slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.16,h:7.5,fill:{color:palette.accent.replace('#','')},line:{color:palette.accent.replace('#','')}});
        slide.addText((s.kicker||kindMeta[kind].label).toUpperCase(),{x:0.72,y:0.55,w:4.8,h:0.28,fontFace:'Aptos',fontSize:10,bold:true,charSpacing:1.5,color:palette.accent.replace('#',''),margin:0});
        slide.addText(s.title,{x:0.72,y:1.05,w:11.7,h:1.25,fontFace:'Aptos Display',fontSize:28,bold:true,color:palette.text.replace('#',''),breakLine:false,margin:0.02,valign:'mid',fit:'shrink'});
        if(s.subtitle)slide.addText(s.subtitle,{x:0.75,y:2.32,w:10.9,h:0.75,fontFace:'Aptos',fontSize:15,color:palette.muted.replace('#',''),margin:0.02,fit:'shrink'});
        const bullets=s.bullets||[];if(bullets.length)slide.addText(bullets.map(b=>({text:b,options:{bullet:{indent:18},hanging:4,breakLine:true}})),{x:0.95,y:s.subtitle?3.18:2.55,w:10.8,h:2.8,fontFace:'Aptos',fontSize:18,color:palette.text.replace('#',''),breakLine:true,margin:0.03,paraSpaceAfterPt:14,valign:'top',fit:'shrink'});
        if(s.cta){
          slide.addShape(pptx.ShapeType.roundRect,{x:0.75,y:6.18,w:7.8,h:0.58,rectRadius:0.08,fill:{color:palette.soft.replace('#','')},line:{color:palette.accent.replace('#',''),transparency:55}});
          slide.addText(s.cta,{x:1.02,y:6.33,w:7.25,h:0.2,fontFace:'Aptos',fontSize:12,bold:true,color:palette.text.replace('#',''),margin:0});
        }
        slide.addText(businessName,{x:10.0,y:7.06,w:2.45,h:0.18,fontFace:'Aptos',fontSize:8,color:palette.muted.replace('#',''),align:'right',margin:0});slide.addText(String(idx+1).padStart(2,'0'),{x:12.48,y:7.04,w:0.35,h:0.18,fontFace:'Aptos',fontSize:8,color:palette.accent.replace('#',''),align:'right',margin:0});
      });
      await pptx.writeFile({fileName:`${slug(draft.title)}.pptx`,compression:true});setNotice('PowerPoint editável gerado.');
    }catch(e:any){setError(e?.message||'Não foi possível gerar o PowerPoint.')}finally{setBusy(false)}
  }

  function exportPng(){
    if(!draft)return;const s=draft.slides[current]||draft.slides[0];const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle=palette.bg;ctx.fillRect(0,0,1600,900);ctx.fillStyle=palette.accent;ctx.fillRect(0,0,20,900);
    ctx.fillStyle=palette.accent;ctx.font='700 24px Arial';ctx.fillText((s.kicker||kindMeta[kind].label).toUpperCase(),90,105);
    ctx.fillStyle=palette.text;ctx.font='700 62px Arial';let y=195;y=drawWrapped(ctx,s.title,90,y,1360,72,3);
    if(s.subtitle){ctx.fillStyle=palette.muted;ctx.font='32px Arial';y=drawWrapped(ctx,s.subtitle,90,y+20,1320,42,3)}
    if(s.bullets?.length){ctx.fillStyle=palette.text;ctx.font='32px Arial';y+=40;for(const b of s.bullets.slice(0,5)){ctx.fillStyle=palette.accent;ctx.fillText('•',95,y);ctx.fillStyle=palette.text;y=drawWrapped(ctx,b,135,y,1270,42,2)+18}}
    if(s.cta){ctx.fillStyle=palette.soft;ctx.fillRect(90,760,1030,74);ctx.fillStyle=palette.text;ctx.font='700 24px Arial';drawWrapped(ctx,s.cta,120,808,960,30,2)}
    ctx.fillStyle=palette.muted;ctx.font='20px Arial';ctx.textAlign='right';ctx.fillText(businessName,1510,845);ctx.textAlign='left';
    const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`${slug(draft.title)}-${String(current+1).padStart(2,'0')}.png`;a.click();setNotice('Imagem PNG gerada.');
  }

  function printPdf(){
    if(!draft)return;const w=window.open('','_blank');if(!w){setError('O navegador bloqueou a janela de exportação. Libere pop-ups e tente novamente.');return}
    const cards=draft.slides.map((s,idx)=>`<section class="slide"><small>${htmlEscape((s.kicker||kindMeta[kind].label).toUpperCase())}</small><h1>${htmlEscape(s.title)}</h1>${s.subtitle?`<h2>${htmlEscape(s.subtitle)}</h2>`:''}${s.bullets?.length?`<ul>${s.bullets.map(b=>`<li>${htmlEscape(b)}</li>`).join('')}</ul>`:''}${s.cta?`<div class="cta">${htmlEscape(s.cta)}</div>`:''}<footer>${htmlEscape(businessName)} <span>${idx+1}</span></footer></section>`).join('');
    w.document.write(`<!doctype html><html><head><title>${htmlEscape(draft.title)}</title><style>@page{size:13.333in 7.5in;margin:0}*{box-sizing:border-box}body{margin:0;background:#111;font-family:Arial,sans-serif}.slide{page-break-after:always;width:13.333in;height:7.5in;padding:.65in .8in;background:${palette.bg};color:${palette.text};position:relative;border-left:10px solid ${palette.accent}}small{color:${palette.accent};font-weight:700;letter-spacing:2px}h1{font-size:34pt;line-height:1.05;margin:.35in 0 .18in;max-width:11in}h2{font-size:17pt;color:${palette.muted};font-weight:400;max-width:10.5in}ul{font-size:20pt;line-height:1.35;max-width:10.5in;margin-top:.45in}li{margin:.12in 0}.cta{position:absolute;left:.8in;bottom:.65in;max-width:8.4in;padding:.16in .24in;background:${palette.soft};font-weight:700}footer{position:absolute;bottom:.2in;right:.35in;color:${palette.muted};font-size:9pt}footer span{color:${palette.accent};margin-left:.2in}@media print{body{background:none}}</style></head><body>${cards}<script>setTimeout(()=>window.print(),350)<\/script></body></html>`);w.document.close();
  }

  const slide=draft?.slides[current];
  return <section className="materialsCenter">
    <header className="materialsHero"><div><small>MATERIAIS · NEXOFFICE</small><h2>Transforme seu Negócio em algo que dá vontade de apresentar.</h2><p>Crie apresentações, propostas, relatórios, resumos e imagens usando o contexto que o NexOffice já conhece. Revise antes de enviar; nada é publicado automaticamente.</p></div><div className="materialsHeroActions"><button onClick={()=>window.open('https://pdffacil.netlify.app','_blank','noopener,noreferrer')}>Ferramentas PDF ↗</button>{draft&&<button className="primary" onClick={exportPptx} disabled={busy}>Baixar PowerPoint</button>}</div></header>
    {error&&<div className="materialsError">{error}</div>}{notice&&<div className="materialsNotice">{notice}</div>}
    <div className="materialsLayout"><aside className="materialsComposer">
      <div className="materialsSection"><label>O que você quer criar?</label><div className="materialsKinds">{(Object.keys(kindMeta) as MaterialKind[]).map(k=><button key={k} className={kind===k?'active':''} onClick={()=>{setKind(k);setDraft(null)}}><b>{kindMeta[k].label}</b><small>{kindMeta[k].description}</small></button>)}</div></div>
      <div className="materialsSection"><label>Estilo</label><div className="themeRow">{(Object.keys(palettes) as ThemeKey[]).map(t=><button key={t} className={theme===t?'active':''} onClick={()=>setTheme(t)}>{t==='executive'?'Executivo':t==='bold'?'Impacto':'Claro'}</button>)}</div></div>
      <div className="materialsFields"><label><span>Título, oferta ou assunto</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Gestão de tráfego para Clínica X"/></label><label><span>Para quem?</span><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Ex.: diretoria da Clínica X"/></label><label><span>O que você quer conseguir?</span><textarea value={objective} onChange={e=>setObjective(e.target.value)} placeholder="Ex.: apresentar a proposta e mostrar por que faz sentido agora"/></label><label><span>Informações que não podem faltar</span><textarea value={context} onChange={e=>setContext(e.target.value)} placeholder="Cole briefing, entregas, resultados, detalhes do cliente ou contexto da reunião"/></label><div className="materialsTwo"><label><span>Valor / condição</span><input value={value} onChange={e=>setValue(e.target.value)} placeholder="Ex.: R$ 2.500/mês"/></label><label><span>Próximo passo</span><input value={cta} onChange={e=>setCta(e.target.value)} placeholder="Ex.: aprovar proposta até sexta"/></label></div></div>
      <div className="materialsContext"><span>DNA DO NEGÓCIO</span><b>{businessName}</b><small>{profile?.profile?.sector?clean(profile.profile.sector):'Perfil sendo enriquecido pelo NexOffice'}</small></div>
      <button className="materialsGenerate" onClick={generate} disabled={busy||!ready}>{busy?'Preparando…':draft?'Gerar nova versão':'Criar material'}</button>
      <p className="materialsGuardrail">A IA usa o contexto do seu Negócio, mas não deve inventar métricas, cases ou resultados. Revise sempre antes de compartilhar.</p>
    </aside>
    <main className="materialsPreview">{draft&&slide?<><div className="materialsPreviewHead"><div><small>{draft.generatedBy||'NexOffice'}</small><b>{draft.title}</b></div><div><button onClick={()=>setCurrent(Math.max(0,current-1))} disabled={current===0}>←</button><span>{current+1}/{draft.slides.length}</span><button onClick={()=>setCurrent(Math.min(draft.slides.length-1,current+1))} disabled={current===draft.slides.length-1}>→</button></div></div>
      <article className="materialSlide" style={{background:palette.bg,color:palette.text,borderLeftColor:palette.accent}}><small style={{color:palette.accent}}>{(slide.kicker||kindMeta[kind].label).toUpperCase()}</small><h3>{slide.title}</h3>{slide.subtitle&&<p className="slideSubtitle" style={{color:palette.muted}}>{slide.subtitle}</p>}{slide.bullets?.length?<ul>{slide.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul>:null}{slide.cta&&<div className="slideCta" style={{background:palette.soft}}>{slide.cta}</div>}<footer style={{color:palette.muted}}><span>{businessName}</span><em style={{color:palette.accent}}>{String(current+1).padStart(2,'0')}</em></footer></article>
      <div className="materialsExport"><button onClick={exportPptx} disabled={busy}>PowerPoint editável</button><button onClick={printPdf}>Salvar como PDF</button><button onClick={exportPng}>Baixar slide em PNG</button><button onClick={()=>window.open('https://pdffacil.netlify.app','_blank','noopener,noreferrer')}>Ajustar no PDF Fácil ↗</button></div>
      <div className="materialsThumbnails">{draft.slides.map((s,i)=><button key={i} className={i===current?'active':''} onClick={()=>setCurrent(i)}><span>{String(i+1).padStart(2,'0')}</span><b>{s.title}</b></button>)}</div>
    </>:<div className="materialsEmpty"><div>▦</div><h3>Conte o que você precisa apresentar.</h3><p>O NexOffice usa o Perfil do Negócio como ponto de partida e monta um material que você pode revisar, exportar para PowerPoint, PDF ou PNG.</p><div><span>Apresentação</span><span>Proposta</span><span>Relatório</span><span>Resumo visual</span><span>Imagem</span></div></div>}</main></div>
  </section>
}

function drawWrapped(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number,maxLines:number){
  const words=clean(text).split(' ');let line='',lines=0;
  for(let i=0;i<words.length;i++){const test=line?line+' '+words[i]:words[i];if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);y+=lineHeight;lines++;line=words[i];if(lines>=maxLines)return y}else line=test}
  if(line&&lines<maxLines){ctx.fillText(line,x,y);y+=lineHeight}return y;
}
