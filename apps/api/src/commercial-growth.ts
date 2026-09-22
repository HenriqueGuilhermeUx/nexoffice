import {query} from './db.js';
import {getBusinessProfile} from './business-intelligence.js';
import {modoMarketingRequest} from './modo-marketing-adapter.js';

const asObject=(value:any):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const text=(value:any)=>String(value??'').trim();
const uniq=(items:string[])=>[...new Set(items.map(x=>x.trim()).filter(Boolean))];

function sectorToNiche(sector:string){
  if(['health','beauty'].includes(sector))return 'saude_estetica';
  if(['professional_services','legal','accounting','services'].includes(sector))return 'servicos_profissionais';
  if(sector==='real_estate')return 'imoveis';
  if(['commerce','retail','restaurant','food'].includes(sector))return 'varejo';
  if(sector==='education')return 'educacao';
  if(sector==='creator')return 'creator';
  return 'outro';
}

export async function buildCommercialContext(workspaceId:string){
  const profile=await getBusinessProfile(workspaceId);
  const [workspace]=await query<any>(`select id,name,vertical from workspaces where id=$1`,[workspaceId]);
  const metadata=asObject(profile?.metadata);
  const commercial={...asObject(metadata.marketing),...asObject(metadata.commercial),...asObject(metadata.brand)};
  const explicit={
    offer:text(commercial.offer),
    location:text(commercial.location||commercial.region),
    audience:text(commercial.audience||commercial.targetAudience),
    differentiators:uniq(Array.isArray(commercial.differentiators)?commercial.differentiators.map(String):text(commercial.differentiators).split(/\n|;/)),
    proofs:uniq(Array.isArray(commercial.proofs)?commercial.proofs.map(String):text(commercial.proofs).split(/\n|;/)),
    restrictions:uniq(Array.isArray(commercial.restrictions)?commercial.restrictions.map(String):text(commercial.restrictions).split(/\n|;/)),
    allowedClaims:uniq(Array.isArray(commercial.allowedClaims)?commercial.allowedClaims.map(String):text(commercial.allowedClaims).split(/\n|;/)),
    websiteUrl:text(commercial.websiteUrl),
    instagramHandle:text(commercial.instagramHandle),
  };
  const known={
    business:text(workspace?.name)||'Sua empresa',sector:text(profile?.sector)||text(workspace?.vertical)||'general',subsector:text(profile?.subsector),revenueModel:text(profile?.revenue_model)||'mixed',primarySalesChannel:text(profile?.primary_sales_channel),sellsProducts:Boolean(profile?.sells_products),sellsServices:Boolean(profile?.sells_services),recurringRevenue:Boolean(profile?.recurring_revenue),...explicit,
  };
  const missing:string[]=[];if(!known.offer)missing.push('offer');if(!known.location)missing.push('location');if(!known.audience)missing.push('audience');
  const customerDescription=[`Setor: ${known.sector}${known.subsector?` / ${known.subsector}`:''}.`,`Modelo de receita: ${known.revenueModel}.`,known.primarySalesChannel?`Canal comercial já observado: ${known.primarySalesChannel}.`:'',known.audience?`Público registrado: ${known.audience}.`:'',known.differentiators.length?`Diferenciais registrados: ${known.differentiators.join('; ')}.`:'',known.proofs.length?`Provas registradas: ${known.proofs.join('; ')}.`:'',known.restrictions.length?`Restrições: ${known.restrictions.join('; ')}.`:'','Não invente preço, desconto, promoção, depoimento, certificação, resultado, garantia ou alegação comercial não registrada.'].filter(Boolean).join(' ');
  return{workspaceId,known,missing,niche:sectorToNiche(known.sector),customerDescription,guardrails:{sourceOfTruth:'nexoffice_business_memory',explicitClaimsOnly:true,neverInvent:['price','discount','promotion','testimonial','certification','result','guarantee','commercial_claim'],humanApprovalRequired:true,externalCampaignActivation:false,paidGenerationAutomatic:false}};
}

export async function createCommercialCampaign(workspaceId:string,input:{objective?:string;offer?:string;location?:string;audience?:string;monthlyBudget:number;ticket?:number;provider?:'google_ads'|'meta_ads';generateLanding?:boolean;createCreative?:boolean}){
  const context=await buildCommercialContext(workspaceId),business=context.known.business,offer=text(input.offer)||context.known.offer,location=text(input.location)||context.known.location,audience=text(input.audience)||context.known.audience;
  if(!offer)throw Object.assign(new Error('Informe a oferta desta campanha. O NexOffice não vai inventá-la.'),{statusCode:400,code:'commercial_offer_required'});
  if(!location)throw Object.assign(new Error('Informe a região atendida por esta campanha.'),{statusCode:400,code:'commercial_location_required'});
  const objective=text(input.objective)||'Gerar novos clientes',provider=input.provider||'google_ads',monthlyBudget=Math.max(0,Number(input.monthlyBudget||0)),ticket=Math.max(0,Number(input.ticket||0));
  const customerDescription=[context.customerDescription,audience?`Público desta campanha: ${audience}.`:''].filter(Boolean).join(' ');
  const project=await modoMarketingRequest<any>(workspaceId,'demand/projects','POST',{name:`${business} · ${offer}`,business,offer,objective:'leads',location,monthlyBudget,ticket});
  const plan=await modoMarketingRequest<any>(workspaceId,'ads/plan','POST',{business,offer,objective,location,budget:monthlyBudget,ticket,customerDescription});
  const campaign=await modoMarketingRequest<any>(workspaceId,'campaigns','POST',{projectId:project.id,provider,name:`${business} | ${offer}`,monthlyBudget,plan});
  let landing:any=null;if(input.generateLanding!==false){try{landing=await modoMarketingRequest<any>(workspaceId,`demand/projects/${project.id}/landing`,'POST',{})}catch{landing=null}}
  let creative:any=null;if(input.createCreative!==false){const brief=[`Crie uma peça de aquisição para a campanha "${offer}" de ${business}.`,`Objetivo: ${objective}. Região: ${location}.`,audience?`Público registrado: ${audience}.`:'',context.known.differentiators.length?`Diferenciais permitidos: ${context.known.differentiators.join('; ')}.`:'',context.known.proofs.length?`Provas permitidas: ${context.known.proofs.join('; ')}.`:'',context.known.allowedClaims.length?`Alegações explicitamente autorizadas: ${context.known.allowedClaims.join('; ')}.`:'','Não invente preço, promoção, desconto, certificação, depoimento, garantia, resultado numérico ou alegação não fornecida.'].filter(Boolean).join(' ');creative=await modoMarketingRequest<any>(workspaceId,'content/drafts','POST',{brandName:business,niche:context.niche,websiteUrl:context.known.websiteUrl,instagramHandle:context.known.instagramHandle,contentType:'static_post',objective:'conversao',brief,channel:provider==='google_ads'?'Google Ads':'Meta Ads'});}
  return{context,project,plan,campaign,landing,creative,governance:{workflow:['strategy','creative','quality_gate','approval','media','lead','crm','learning'],requiresExplicitApproval:true,requiresAuthorizedMediaAccount:true,externalCampaignActivation:false,paidGenerationAutomatic:false}};
}

function outputText(draft:any){const o=asObject(draft?.output),pieces=[o.hook,o.title,o.caption,o.cta,o.visualDirection,...(Array.isArray(o.slides)?o.slides.flatMap((x:any)=>[x?.title,x?.body]):[]),...(Array.isArray(o.script)?o.script.flatMap((x:any)=>[x?.scene,x?.visual,x?.voiceover]):[])];return pieces.map(text).filter(Boolean).join('\n')}

export async function qualityGateCommercialCreative(workspaceId:string,draftId:string){
  const context=await buildCommercialContext(workspaceId),response=await modoMarketingRequest<any>(workspaceId,`content/drafts/${draftId}`),draft=response?.request||response,body=outputText(draft),explicitCorpus=[context.known.offer,...context.known.differentiators,...context.known.proofs,...context.known.allowedClaims].join(' ').toLowerCase();
  const checks:Array<{code:string;passed:boolean;message:string}>=[];checks.push({code:'ready',passed:draft?.status==='ready'||draft?.status==='approved',message:draft?.status==='ready'||draft?.status==='approved'?'Criativo pronto para revisão.':'A geração ainda não terminou.'});checks.push({code:'content_present',passed:body.length>=30,message:body.length>=30?'Conteúdo estruturado presente.':'Conteúdo insuficiente para revisão.'});
  const risky=[{code:'price',regex:/R\$\s*\d|\b\d+[.,]?\d*\s*reais\b/i,label:'preço'},{code:'numeric_result',regex:/\b\d+(?:[.,]\d+)?\s*%/i,label:'resultado percentual'},{code:'guarantee',regex:/\bgaranti(?:a|do|da|mos)\b/i,label:'garantia'},{code:'certification',regex:/\bcertificad[oa]s?\b/i,label:'certificação'},{code:'promotion',regex:/\bpromoç(?:ão|ões)|\bdesconto\b|\boferta por tempo limitado\b/i,label:'promoção/desconto'},{code:'testimonial',regex:/\bdepoimento\b|\bclientes satisfeitos\b/i,label:'depoimento/prova social'},{code:'superlative',regex:/\bn[úu]mero\s*1\b|\bmelhor do mercado\b|\bl[ií]der do mercado\b/i,label:'superlativo comercial'}];
  for(const rule of risky){const matched=body.match(rule.regex)?.[0]||'',allowed=!matched||explicitCorpus.includes(matched.toLowerCase());checks.push({code:`claim_${rule.code}`,passed:allowed,message:allowed?`${rule.label}: sem alegação não suportada.`:`Revisar ${rule.label}: "${matched}" não está registrado na memória comercial.`})}
  const blockers=checks.filter(x=>!x.passed);return{draftId,status:draft?.status||null,passed:blockers.length===0,checks,blockers,governance:{humanApprovalRequired:true,approvalBlockedUntilPass:true,externalPublication:false,externalCampaignActivation:false},reviewedAgainst:{business:context.known.business,explicitClaims:[context.known.offer,...context.known.differentiators,...context.known.proofs,...context.known.allowedClaims].filter(Boolean)}};
}

export async function approveCommercialCreative(workspaceId:string,draftId:string){const gate=await qualityGateCommercialCreative(workspaceId,draftId);if(!gate.passed)throw Object.assign(new Error('O criativo não passou no Quality Gate. Revise os bloqueios antes de aprovar.'),{statusCode:409,code:'commercial_quality_gate_failed',payload:gate});const approved=await modoMarketingRequest<any>(workspaceId,`content/drafts/${draftId}/approve`,'POST',{});return{...approved,qualityGate:gate,governance:{humanApprovalRequired:true,externalPublication:false,externalCampaignActivation:false}}}

export async function syncProjectLeadsToCrm(workspaceId:string,projectId:string){
  const leads=await modoMarketingRequest<any[]>(workspaceId,`demand/projects/${projectId}/leads`);let created=0,updated=0,dealsCreated=0;const synced:any[]=[];
  for(const lead of Array.isArray(leads)?leads:[]){
    const leadId=text(lead?.id);if(!leadId)continue;
    let [contact]=await query<any>(`select * from crm_contacts where workspace_id=$1 and custom_fields->>'modoLeadId'=$2 limit 1`,[workspaceId,leadId]);
    const source=`growth:${projectId}`,custom={modoLeadId:leadId,marketingProjectId:projectId,utm:asObject(lead?.utm),capturedAt:lead?.createdAt||null};
    if(contact){[contact]=await query<any>(`update crm_contacts set name=coalesce(nullif($3,''),name),email=coalesce(nullif($4,''),email),phone=coalesce(nullif($5,''),phone),source=$6,custom_fields=coalesce(custom_fields,'{}'::jsonb)||$7::jsonb,updated_at=now() where id=$2 and workspace_id=$1 returning *`,[workspaceId,contact.id,text(lead?.name),text(lead?.email),text(lead?.phone),source,JSON.stringify(custom)]);updated++}
    else{[contact]=await query<any>(`insert into crm_contacts(workspace_id,kind,name,email,phone,source,tags,custom_fields) values($1,'person',$2,$3,$4,$5,$6,$7::jsonb) returning *`,[workspaceId,text(lead?.name)||'Lead de campanha',text(lead?.email)||null,text(lead?.phone)||null,source,['growth','campaign'],JSON.stringify(custom)]);created++}
    const dealMetadata={marketingProjectId:projectId,marketingLeadId:leadId,utm:asObject(lead?.utm)};
    const [existingDeal]=await query<any>(`select id from crm_deals where workspace_id=$1 and (metadata->>'marketingLeadId'=$2 or (source=$3 and contact_id=$4)) order by updated_at desc limit 1`,[workspaceId,leadId,source,contact.id]);
    let dealId=existingDeal?.id||null;
    if(!dealId){const [deal]=await query<any>(`insert into crm_deals(workspace_id,contact_id,title,stage,value_minor,currency,source,next_action,metadata) values($1,$2,$3,'lead',0,'BRL',$4,'Qualificar lead da campanha',$5::jsonb) returning id`,[workspaceId,contact.id,`Lead de campanha · ${text(lead?.name)||'Novo contato'}`,source,JSON.stringify(dealMetadata)]);dealId=deal.id;dealsCreated++}
    else await query<any>(`update crm_deals set metadata=coalesce(metadata,'{}'::jsonb)||$3::jsonb,source=coalesce(nullif(source,''),$4),updated_at=now() where id=$1 and workspace_id=$2`,[dealId,workspaceId,JSON.stringify(dealMetadata),source]);
    synced.push({marketingLeadId:leadId,contactId:contact.id,dealId});
  }
  return{projectId,total:Array.isArray(leads)?leads.length:0,created,updated,dealsCreated,synced};
}

export async function commercialLearning(workspaceId:string,projectId:string){
  const [funnel,leads]=await Promise.all([modoMarketingRequest<any>(workspaceId,`demand/projects/${projectId}/funnel`),modoMarketingRequest<any[]>(workspaceId,`demand/projects/${projectId}/leads`)]);let googleAds:any=null;try{googleAds=await modoMarketingRequest<any>(workspaceId,'media/google_ads/metrics?days=30')}catch{}
  const source=`growth:${projectId}`;
  const crm=await query<any>(`select count(*)::int opportunities,count(*) filter(where stage in ('qualified','meeting','proposal','won'))::int progressed,count(*) filter(where stage='won')::int customers,coalesce(sum(value_minor) filter(where stage='won'),0)::bigint won_value_minor from crm_deals where workspace_id=$1 and (metadata->>'marketingProjectId'=$2 or source=$3)`,[workspaceId,projectId,source]),c=crm[0]||{};let nextRecommendation='Continue coletando resultados antes de alterar a campanha.';
  if(Number(funnel?.pageViews||0)===0)nextRecommendation='Ainda não há tráfego suficiente para avaliar mensagem ou oferta. Valide primeiro a conexão e a veiculação autorizada.';else if(Number(funnel?.ctaClicks||0)===0)nextRecommendation='Há visitas, mas nenhum clique no CTA. Revise mensagem, proposta de valor e chamada para ação antes de ampliar investimento.';else if(Number(funnel?.leads||0)===0)nextRecommendation='Há intenção no CTA, mas nenhum lead capturado. Revise formulário, oferta e fricção da conversão.';else if(Number(c.progressed||0)===0)nextRecommendation='A campanha gerou leads, mas eles ainda não avançaram no CRM. Priorize qualificação e compare público/origem antes de mudar mídia.';else if(Number(c.customers||0)===0)nextRecommendation='Há oportunidades avançando, mas ainda sem cliente ganho atribuído. Revise follow-up e proposta comercial antes de concluir sobre a mídia.';else nextRecommendation='Já existem clientes ganhos atribuídos. Preserve a campanha-base e teste uma única variação de mensagem, público ou criativo por vez para aprender com segurança.';
  return{projectId,funnel,capturedLeads:Array.isArray(leads)?leads.length:0,crm:{opportunities:Number(c.opportunities||0),progressed:Number(c.progressed||0),customers:Number(c.customers||0),wonValueMinor:Number(c.won_value_minor||0)},googleAds,nextRecommendation,attribution:{source:'project_and_utm_linkage',causalityClaimed:false,note:'Atribuição registra associação entre campanha, lead, oportunidade e cliente. Não prova causalidade isoladamente.'},learning:{creativeLevelAvailable:false,note:'Aprendizado por criativo só será mostrado quando a origem trouxer identificador de criativo de forma confiável.'}};
}
