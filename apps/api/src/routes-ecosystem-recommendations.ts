import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';

type Priority='critical'|'high'|'normal';
type Recommendation={id:string;score:number;priority:Priority;kind:'native'|'network'|'first_party';category:string;capability:string;title:string;why:string;detail:string;signalCount:number;action:{type:'view'|'network';target:string;label:string;query?:string};providerMatches?:Array<{workspaceId:string;displayName:string;headline:string|null;specialties:string[]}>};

const rank=(priority:Priority)=>priority==='critical'?300:priority==='high'?200:100;
const rec=(input:Omit<Recommendation,'score'> & {bonus?:number}):Recommendation=>({score:rank(input.priority)+(input.bonus||0),...input});

export async function registerEcosystemRecommendationRoutes(app:FastifyInstance){
  app.get('/v1/ecosystem/recommendations',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const [workspace,deals,contacts,ops,tasks,integrations,activeProviderRequests]=await Promise.all([
      query<any>(`select name,vertical from workspaces where id=$1`,[ctx.workspaceId]).then(rows=>rows[0]||{}),
      query<any>(`select
        count(*) filter(where stage in ('lead','qualified','meeting','proposal'))::int open_deals,
        count(*) filter(where stage='proposal' and updated_at<now()-interval '3 days')::int stale_proposals,
        count(*) filter(where stage in ('lead','qualified','meeting','proposal') and coalesce(trim(next_action),'')='')::int no_next_action,
        count(*) filter(where stage='won' and updated_at>=now()-interval '30 days')::int won_30,
        count(*) filter(where stage='won' and not exists(select 1 from business_operations o where o.workspace_id=crm_deals.workspace_id and o.deal_id=crm_deals.id))::int won_without_operation
        from crm_deals where workspace_id=$1`,[ctx.workspaceId]).then(rows=>rows[0]||{}),
      query<any>(`select count(*)::int total from crm_contacts where workspace_id=$1`,[ctx.workspaceId]).then(rows=>rows[0]||{}),
      query<any>(`select
        count(*) filter(where status not in ('paid','closed','cancelled') and document_ref_id is null)::int missing_contract,
        count(*) filter(where status not in ('paid','closed','cancelled') and document_ref_id is not null and invoice_action_id is null)::int contract_without_invoice,
        count(*) filter(where status='attention' or fiscal_status in ('rejected','cancelled'))::int fiscal_attention,
        count(*) filter(where fiscal_status='authorized' and ledger_entry_id is null and status not in ('paid','closed','cancelled'))::int authorized_without_collection,
        count(*) filter(where ledger_entry_id is not null and communication_action_id is null and status not in ('paid','closed','cancelled'))::int collection_without_communication,
        count(*) filter(where status='paid')::int paid_operations
        from business_operations where workspace_id=$1`,[ctx.workspaceId]).then(rows=>rows[0]||{}),
      query<any>(`select
        count(*) filter(where status in ('todo','doing') and lower(coalesce(title,'')||' '||coalesce(description,'')) ~ '(site|website|aplicativo|(^|[^a-z])app([^a-z]|$)|sistema (próprio|proprio|custom)|integração|integracao|automação|automacao)')::int custom_build_need,
        count(*) filter(where status in ('todo','doing') and lower(coalesce(title,'')||' '||coalesce(description,'')) ~ '(jurídic|juridic|cláusula|clausula|lgpd|termo de uso|política de privacidade|politica de privacidade|risco legal)')::int legal_need
        from tasks where workspace_id=$1`,[ctx.workspaceId]).then(rows=>rows[0]||{}),
      query<any>(`select provider,status from integrations where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int total from provider_requests where requester_workspace_id=$1 and status in ('requested','accepted','in_progress')`,[ctx.workspaceId]).then(rows=>rows[0]||{})
    ]);

    const providerStatus=new Map(integrations.map((item:any)=>[String(item.provider),String(item.status)]));
    const recommendations:Recommendation[]=[];
    const add=(item:Omit<Recommendation,'score'> & {bonus?:number})=>recommendations.push(rec(item));

    const collectionWithoutCommunication=Number(ops.collection_without_communication||0);
    if(collectionWithoutCommunication>0)add({id:'collect-open-receivables',priority:'critical',bonus:Math.min(collectionWithoutCommunication,20),kind:'native',category:'collections',capability:'owner_pix+smartbots',title:`${collectionWithoutCommunication} cobrança(s) pronta(s) para avançar`,why:'Há recebíveis ligados a Operações Comerciais ainda sem comunicação preparada.',detail:'Abra o Financeiro, confira a mensagem Pix do próprio negócio e, quando fizer sentido, prepare um lembrete SmartBots sem expor a chave Pix.',signalCount:collectionWithoutCommunication,action:{type:'view',target:'finance',label:'Abrir cobranças'}});

    const authorizedWithoutCollection=Number(ops.authorized_without_collection||0);
    if(authorizedWithoutCollection>0)add({id:'invoice-to-collection',priority:'high',bonus:Math.min(authorizedWithoutCollection,20),kind:'native',category:'collections',capability:'owner_pix',title:`${authorizedWithoutCollection} nota(s) autorizada(s) sem recebível`,why:'O TaxAgent já confirmou autorização fiscal, mas a cobrança ainda não foi criada no NexOffice.',detail:'Gere o recebível somente quando você decidir. O pagamento continuará direto no Pix cadastrado pelo negócio.',signalCount:authorizedWithoutCollection,action:{type:'view',target:'finance',label:'Gerar recebível'}});

    const fiscalAttention=Number(ops.fiscal_attention||0);
    if(fiscalAttention>0)add({id:'fiscal-attention',priority:'high',bonus:Math.min(fiscalAttention*2,25),kind:'native',category:'fiscal',capability:'taxagent',title:`${fiscalAttention} operação(ões) precisa(m) de revisão fiscal`,why:'Há emissão rejeitada/cancelada ou Operação Comercial marcada para atenção.',detail:'Revise os dados fiscais e o retorno do TaxAgent antes de prosseguir para cobrança.',signalCount:fiscalAttention,action:{type:'view',target:'finance',label:'Revisar operação fiscal'}});

    if(fiscalAttention>=2){
      const matches=await query<any>(`select p.workspace_id,p.display_name,p.headline,p.specialties from provider_profiles p where p.status='published' and p.workspace_id<>$1 and (lower(array_to_string(p.categories,' ')) ~ '(contab|fiscal|tribut)' or lower(array_to_string(p.specialties,' ')) ~ '(contab|fiscal|tribut)' or exists(select 1 from provider_services s where s.provider_workspace_id=p.workspace_id and s.active=true and lower(s.category||' '||s.title||' '||s.description) ~ '(contab|fiscal|tribut)')) order by p.published_at desc nulls last limit 3`,[ctx.workspaceId]);
      add({id:'fiscal-specialist',priority:'normal',bonus:Math.min(fiscalAttention,10),kind:'network',category:'specialist',capability:'network.accounting',title:'Talvez valha envolver um contador/BPO fiscal',why:`${fiscalAttention} sinais fiscais recorrentes indicam que apoio humano pode complementar o TaxAgent.`,detail:'A Rede mostra apenas perfis publicados. Nenhum dado fiscal, financeiro ou de clientes é compartilhado até você conceder acesso explicitamente.',signalCount:fiscalAttention,action:{type:'network',target:'discover',query:'fiscal',label:'Ver especialistas'},providerMatches:matches.map((p:any)=>({workspaceId:p.workspace_id,displayName:p.display_name,headline:p.headline||null,specialties:Array.isArray(p.specialties)?p.specialties:[]}))});
    }

    const contractWithoutInvoice=Number(ops.contract_without_invoice||0);
    if(contractWithoutInvoice>0)add({id:'contract-to-invoice',priority:'high',bonus:Math.min(contractWithoutInvoice,20),kind:'native',category:'fiscal',capability:'taxagent',title:`${contractWithoutInvoice} contrato(s) pronto(s) para etapa fiscal`,why:'Existem Operações Comerciais com contrato DocWallet vinculado e sem emissão fiscal preparada.',detail:'Revise a operação e prepare a nota no TaxAgent. A emissão continua approval-first.',signalCount:contractWithoutInvoice,action:{type:'view',target:'finance',label:'Preparar nota'}});

    const missingContract=Number(ops.missing_contract||0),wonWithoutOperation=Number(deals.won_without_operation||0);
    if(missingContract>0||wonWithoutOperation>0)add({id:'formalize-business',priority:'high',bonus:Math.min(missingContract+wonWithoutOperation,20),kind:'native',category:'formalization',capability:'docwallet',title:'Formalize negócios antes da execução',why:wonWithoutOperation?`${wonWithoutOperation} negócio(s) ganho(s) ainda não entrou(aram) na cadeia comercial completa.`:`${missingContract} Operação(ões) Comercial(is) ainda não possui(em) contrato vinculado.`,detail:'Use um modelo DocWallet para criar o contrato e, se quiser, já ligá-lo à Operação Comercial.',signalCount:missingContract+wonWithoutOperation,action:{type:'view',target:'documents',label:'Criar contrato'}});

    const staleProposals=Number(deals.stale_proposals||0),noNextAction=Number(deals.no_next_action||0);
    if(staleProposals>0||noNextAction>0)add({id:'recover-pipeline',priority:'high',bonus:Math.min(staleProposals*2+noNextAction,25),kind:'native',category:'sales',capability:'crm+smartbots',title:'Há receita no pipeline sem próxima movimentação',why:`${staleProposals} proposta(s) parada(s) há mais de 3 dias e ${noNextAction} oportunidade(s) sem próxima ação.`,detail:'Use CRM para definir o próximo passo e SmartBots para preparar follow-up quando apropriado. O envio continua sob aprovação.',signalCount:staleProposals+noNextAction,action:{type:'view',target:'crm',label:'Abrir pipeline'}});

    const openDeals=Number(deals.open_deals||0),contactCount=Number(contacts.total||0),won30=Number(deals.won_30||0);
    if(openDeals===0&&won30===0)add({id:'generate-demand',priority:contactCount===0?'high':'normal',bonus:contactCount===0?10:0,kind:'native',category:'growth',capability:'modo',title:'O pipeline precisa de nova demanda',why:contactCount===0?'A base ainda não tem contatos nem oportunidades ativas.':'Não há oportunidades abertas nem vendas registradas nos últimos 30 dias.',detail:providerStatus.get('modo')==='connected'?'Abra Marketing para estruturar conteúdo, prospecção ou campanha com a MODO.':'A MODO pode estruturar aquisição e prospecção quando a integração estiver configurada.',signalCount:1,action:{type:'view',target:'marketing',label:'Abrir MODO'}});

    const customBuildNeed=Number(tasks.custom_build_need||0);
    if(customBuildNeed>0)add({id:'custom-build',priority:'normal',bonus:Math.min(customBuildNeed,10),kind:'first_party',category:'custom_build',capability:'av_studio',title:'Há necessidade de tecnologia sob medida',why:`${customBuildNeed} tarefa(s) ativa(s) menciona(m) site, app, sistema, integração ou automação.`,detail:'Quando isso ultrapassar o que o NexOffice configurável resolve, a Alternative Ventures Studio pode assumir o projeto usando a mesma cadeia de contrato, fiscal, cobrança e outcome.',signalCount:customBuildNeed,action:{type:'network',target:'discover',query:'av_studio',label:'Ver AV Studio'}});

    const legalNeed=Number(tasks.legal_need||0);
    if(legalNeed>0)add({id:'legal-context',priority:'normal',bonus:Math.min(legalNeed,10),kind:'native',category:'legal',capability:'nexjud_mini',title:'Há uma dúvida jurídica operacional no radar',why:`${legalNeed} tarefa(s) ativa(s) contém(êm) sinal jurídico ou de compliance contratual.`,detail:'Use o NexJud Mini para orientação leve/contextual. Questões de alto impacto ou caso específico devem escalar para o NexJud completo ou profissional habilitado.',signalCount:legalNeed,action:{type:'view',target:'integrations',label:'Abrir assistência jurídica'}});

    recommendations.sort((a,b)=>b.score-a.score||b.signalCount-a.signalCount||a.title.localeCompare(b.title));
    const selected=recommendations.slice(0,6).map(({score,...item})=>item);
    return {generatedAt:new Date().toISOString(),workspace:{name:workspace.name||ctx.workspaceName,vertical:workspace.vertical||null},signals:{openDeals,staleProposals,noNextAction,won30,missingContract,contractWithoutInvoice,fiscalAttention,authorizedWithoutCollection,collectionWithoutCommunication,customBuildNeed,legalNeed,activeProviderRequests:Number(activeProviderRequests.total||0)},recommendations:selected,governance:{deterministicRules:true,externalEffects:false,humanDecisionRequired:true,nexaOperationalFinance:false,privateWorkspaceDataStaysPrivate:true}};
  });
}
