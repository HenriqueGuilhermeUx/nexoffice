import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {providerCapabilityEvidence} from './network-provider-capabilities.js';

type FacetKey='fiscal'|'accounting'|'marketing'|'sales'|'legal'|'technology'|'design'|'operations'|'finance'|'automation';

type Facet={key:FacetKey;label:string;terms:string[];capabilityKeys:string[]};

const facets:Facet[]=[
  {key:'fiscal',label:'Fiscal / tributário',terms:['fiscal','tribut','imposto','nota','nfse','nfs-e','taxagent'],capabilityKeys:['fiscal_flow']},
  {key:'accounting',label:'Contabilidade',terms:['contab','contador','contabilidade','bpo','escrituração','escrituracao'],capabilityKeys:['fiscal_flow','document_flow']},
  {key:'marketing',label:'Marketing / aquisição',terms:['marketing','campanha','google ads','meta ads','tráfego','trafego','aquisição','aquisicao','conteúdo','conteudo','lead'],capabilityKeys:['communication_flow']},
  {key:'sales',label:'Vendas / comercial',terms:['vendas','comercial','crm','proposta','pipeline','follow-up','follow up','prospecção','prospeccao'],capabilityKeys:['communication_flow']},
  {key:'legal',label:'Jurídico / compliance',terms:['juríd','jurid','contrato','cláusula','clausula','lgpd','compliance','termo de uso','privacidade'],capabilityKeys:['document_flow']},
  {key:'technology',label:'Tecnologia',terms:['site','website','app','aplicativo','sistema','software','integração','integracao','api','desenvolvimento'],capabilityKeys:['document_flow']},
  {key:'design',label:'Design / marca',terms:['design','marca','branding','identidade visual','ux','ui','logo'],capabilityKeys:[]},
  {key:'operations',label:'Operações',terms:['operaç','operac','processo','rotina','gestão','gestao','backoffice','eficiência','eficiencia'],capabilityKeys:['delegated_context']},
  {key:'finance',label:'Financeiro / cobrança',terms:['financeiro','cobrança','cobranca','recebimento','pix','fluxo de caixa','inadimpl'],capabilityKeys:['collection_flow']},
  {key:'automation',label:'Automação',terms:['automação','automacao','workflow','n8n','bot','agente','integração','integracao'],capabilityKeys:['communication_flow','delegated_context']}
];

const inputSchema=z.object({
  needSummary:z.string().trim().min(3).max(1200).optional(),
  category:z.string().trim().max(120).optional(),
  remoteOnly:z.boolean().default(false),
  limit:z.number().int().min(1).max(12).default(6)
});

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const includesTerm=(text:string,term:string)=>text.includes(normalize(term));
const distinct=<T,>(items:T[])=>[...new Set(items)];

function detectFacets(text:string){
  const normalized=normalize(text);
  return facets.filter(facet=>facet.terms.some(term=>includesTerm(normalized,term)));
}

function providerText(row:any){
  return normalize([
    row.display_name,row.headline,row.bio,
    ...(Array.isArray(row.categories)?row.categories:[]),
    ...(Array.isArray(row.specialties)?row.specialties:[]),
    ...(Array.isArray(row.service_regions)?row.service_regions:[]),
    ...(Array.isArray(row.service_titles)?row.service_titles:[]),
    ...(Array.isArray(row.service_categories)?row.service_categories:[]),
    ...(Array.isArray(row.service_descriptions)?row.service_descriptions:[])
  ].filter(Boolean).join(' '));
}

export async function registerNetworkProviderMatchingRoutes(app:FastifyInstance){
  app.post('/v1/network/provider-matches',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const input=inputSchema.parse(req.body||{});

    const [workspace,signals]=await Promise.all([
      query<any>(`select name,vertical from workspaces where id=$1`,[ctx.workspaceId]).then(rows=>rows[0]||{}),
      query<any>(`select
        (select count(*)::int from business_operations where workspace_id=$1 and (status='attention' or fiscal_status in ('rejected','cancelled'))) fiscal_attention,
        (select count(*)::int from crm_deals where workspace_id=$1 and stage='proposal' and updated_at<now()-interval '3 days') stale_proposals,
        (select count(*)::int from tasks where workspace_id=$1 and status in ('todo','doing') and lower(coalesce(title,'')||' '||coalesce(description,'')) ~ '(site|website|aplicativo|app|sistema|integração|integracao|automação|automacao)') technology_need,
        (select count(*)::int from tasks where workspace_id=$1 and status in ('todo','doing') and lower(coalesce(title,'')||' '||coalesce(description,'')) ~ '(jurídic|juridic|lgpd|cláusula|clausula|compliance|termo de uso)') legal_need`,[ctx.workspaceId]).then(rows=>rows[0]||{})
    ]);

    const signalHints:string[]=[];
    if(Number(signals.fiscal_attention||0)>=2)signalHints.push('fiscal contabilidade');
    if(Number(signals.stale_proposals||0)>=2)signalHints.push('vendas comercial crm follow-up');
    if(Number(signals.technology_need||0)>0)signalHints.push('tecnologia sistema integração automação');
    if(Number(signals.legal_need||0)>0)signalHints.push('jurídico compliance');

    const queryText=[input.needSummary,input.category,workspace.vertical,...signalHints].filter(Boolean).join(' ');
    const detected=detectFacets(queryText);
    const requestedTerms=distinct(detected.flatMap(f=>f.terms.map(normalize)));

    const candidates=await query<any>(`select p.workspace_id,p.display_name,p.headline,p.bio,p.categories,p.specialties,p.service_regions,p.remote_available,
      coalesce(array_agg(distinct s.title) filter(where s.id is not null),'{}') service_titles,
      coalesce(array_agg(distinct s.category) filter(where s.id is not null),'{}') service_categories,
      coalesce(array_agg(distinct s.description) filter(where s.id is not null),'{}') service_descriptions
      from provider_profiles p
      join workspaces w on w.id=p.workspace_id and w.status='active'
      join provider_services s on s.provider_workspace_id=p.workspace_id and s.active=true
      where p.status='published' and p.workspace_id<>$1 and ($2::boolean=false or p.remote_available=true)
      group by p.workspace_id,p.display_name,p.headline,p.bio,p.categories,p.specialties,p.service_regions,p.remote_available
      order by lower(p.display_name),p.workspace_id`,[ctx.workspaceId,input.remoteOnly]);

    const capabilityMap=await providerCapabilityEvidence(candidates.map((row:any)=>String(row.workspace_id)));

    const matches=candidates.map((row:any)=>{
      const text=providerText(row);
      const profileFacets=detected.filter(facet=>facet.terms.some(term=>includesTerm(text,term)));
      const lexicalTerms=requestedTerms.filter(term=>text.includes(term));
      const capability=capabilityMap.get(String(row.workspace_id));
      const capabilityKeys=new Set((capability?.capabilities||[]).map(item=>item.key));
      const capabilityReasons=distinct(profileFacets.flatMap(facet=>facet.capabilityKeys).filter(key=>capabilityKeys.has(key)));
      const reasons=[
        ...profileFacets.map(facet=>`Perfil/serviço relacionado a ${facet.label}`),
        ...capabilityReasons.map(key=>`Uso observado no NexOffice: ${(capability?.capabilities||[]).find(item=>item.key===key)?.label||key}`)
      ];
      return {
        workspaceId:String(row.workspace_id),displayName:String(row.display_name),headline:row.headline||null,
        categories:Array.isArray(row.categories)?row.categories:[],specialties:Array.isArray(row.specialties)?row.specialties:[],
        remoteAvailable:Boolean(row.remote_available),
        matchedFacets:profileFacets.map(facet=>facet.key),
        matchedTermCount:distinct(lexicalTerms).length,
        reasons:distinct(reasons),
        capabilityEvidence:(capability?.capabilities||[]).filter(item=>capabilityReasons.includes(item.key)),
        eligible:Boolean(capability?.eligibility.networkReady)
      };
    }).filter(item=>item.eligible&&(detected.length===0||item.matchedFacets.length>0));

    // Deliberately non-ranked: alphabetical ordering prevents an implicit quality hierarchy.
    const selected=matches.sort((a,b)=>a.displayName.localeCompare(b.displayName,'pt-BR')||a.workspaceId.localeCompare(b.workspaceId)).slice(0,input.limit);

    return {
      generatedAt:new Date().toISOString(),
      context:{workspaceVertical:workspace.vertical||null,explicitNeedProvided:Boolean(input.needSummary||input.category),detectedFacets:detected.map(f=>({key:f.key,label:f.label})),businessSignals:{fiscalAttention:Number(signals.fiscal_attention||0),staleProposals:Number(signals.stale_proposals||0),technologyNeed:Number(signals.technology_need||0),legalNeed:Number(signals.legal_need||0)}},
      matches:selected,
      methodology:{deterministic:true,ranking:false,score:false,bestProvider:false,alphabeticalDisplayOrder:true,humanDecisionRequired:true,observedCapabilitiesAreEvidenceOnly:true},
      privacy:{clientIdentityExposed:false,amountsExposed:false,pixSecretExposed:false,rawDocumentsExposed:false,fiscalPayloadExposed:false,privateOutcomeMetricsExposed:false},
      externalEffect:false
    };
  });
}
