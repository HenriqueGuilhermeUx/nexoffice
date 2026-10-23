import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {ApiError,authenticate} from './auth.js';
import {query} from './db.js';

/**
 * Nex Personal specialist agents v1: user-scoped, deterministic, explainable.
 * No external LLM/provider, trading, payment initiation, custody or PJ data.
 * Contract text is processed in memory and never stored in DB, audit or logs.
 */
const ids=['expenses','financial','planning','investments','shopping','simulations','payments','contracts'] as const;
type AgentId=typeof ids[number];
const inputSchema=z.object({
  amountMinor:z.string().regex(/^\d{1,12}$/).refine(v=>BigInt(v)>0n).optional(),
  monthlyMinor:z.string().regex(/^\d{1,12}$/).refine(v=>BigInt(v)>0n).optional(),
  installments:z.number().int().min(1).max(120).optional(),
  months:z.number().int().min(1).max(360).optional(),
  contractText:z.string().trim().max(4000).optional()
}).strict();
const fmt=(value:bigint|string)=>{
 const n=BigInt(value),sign=n<0n?'-':'',abs=n<0n?-n:n;
 return sign+'R$ '+(abs/100n).toLocaleString('pt-BR')+','+String(abs%100n).padStart(2,'0');
};
const sum=(items:Record<string,any>[],field:string)=>items.reduce((n,v)=>n+BigInt(v[field]||'0'),0n);
const catalog=[
 {id:'expenses',name:'Atlas',role:'Analista de gastos',status:'available',description:'Categorias, orçamento e padrões das despesas registradas.',prompt:'Onde estou gastando mais?',icon:'chart'},
 {id:'financial',name:'Norte',role:'Analista financeiro',status:'available',description:'Entradas, saídas, saldo declarado e visão patrimonial parcial.',prompt:'Como estão minhas finanças?',icon:'wallet'},
 {id:'planning',name:'Prisma',role:'Planejador',status:'available',description:'Metas, reservas e compromissos dos próximos meses.',prompt:'Como avançar nas minhas metas?',icon:'target'},
 {id:'investments',name:'Lume',role:'Investimentos',status:'limited',description:'Organiza ativos declarados e liquidez; não indica ativos nem cotações.',prompt:'Como está minha carteira declarada?',icon:'trend'},
 {id:'shopping',name:'Faro',role:'Compras inteligentes',status:'available',description:'Avalia impacto de compras e parcelas com os dados disponíveis.',prompt:'Quanto impactaria essa compra?',icon:'cart'},
 {id:'simulations',name:'Cenário',role:'Simulador financeiro',status:'available',description:'Projeções de poupança e parcelas sem rendimentos presumidos.',prompt:'Simular meu planejamento',icon:'calculator'},
 {id:'payments',name:'Fluxo',role:'Contas e pagamentos',status:'limited',description:'Organiza vencimentos; Pix, boletos e pagamentos reais desativados.',prompt:'Quais contas estão para vencer?',icon:'calendar'},
 {id:'contracts',name:'Clara',role:'Leitura de contratos',status:'limited',description:'Checklist de cláusulas em texto colado, sem conclusão jurídica.',prompt:'Quero revisar cláusulas',icon:'file'}
] as const;

async function personalOwner(req:FastifyRequest){
 const user=await authenticate(req);
 const profile=await query<{user_id:string}>('select user_id from nex_personal.profiles where user_id=$1',[user.id]);
 if(!profile.length)throw new ApiError(409,'personal_activation_required','Ative o Nex Personal para continuar.');
 return user.id;
}
export async function registerNexPersonalAgentsRoutes(app:FastifyInstance){
 app.get('/v1/personal/agents',async req=>{
  await personalOwner(req);
  return {agents:catalog,coordinator:'Maya',mode:'deterministic_preview',externalEffect:false};
 });
 app.post('/v1/personal/agents/:id/analyze',async req=>{
  const owner=await personalOwner(req);
  const agentId=z.enum(ids).parse((req.params as {id:string}).id) as AgentId;
  const input=inputSchema.parse(req.body??{});
  // Minimal queries, always bound to the authenticated owner. Not a business workspace.
  const [accounts,monthlyTransactions,budgets,goals,bills,wealth]=await Promise.all([
   query<any>("select available_minor::text available_minor from nex_personal.accounts where owner_user_id=$1 and provider='manual' and status='active' and currency='BRL'",[owner]),
   query<any>("select amount_minor::text amount_minor,coalesce(category,'Outros') category from nex_personal.transactions where owner_user_id=$1 and currency='BRL' and booked_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') and booked_at<date_trunc('month',now() at time zone 'America/Sao_Paulo')+interval '1 month'",[owner]),
   query<any>("select category,limit_minor::text limit_minor from nex_personal.budgets where owner_user_id=$1 and month=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date",[owner]),
   query<any>("select name,target_minor::text target_minor,saved_minor::text saved_minor,due_on,status from nex_personal.goals where owner_user_id=$1 and status='active' order by created_at desc limit 20",[owner]),
   query<any>("select name,amount_minor::text amount_minor,next_due_on,interval_months from nex_personal.bills where owner_user_id=$1 and active=true order by next_due_on limit 80",[owner]),
   query<any>("select name,kind,category,amount_minor::text amount_minor from nex_personal.wealth_items where owner_user_id=$1 and currency='BRL'",[owner])
  ]);
  const balance=sum(accounts,'available_minor');
  const spent=monthlyTransactions.filter(t=>BigInt(t.amount_minor)<0n).reduce((n,t)=>n-BigInt(t.amount_minor),0n);
  const income=sum(monthlyTransactions.filter(t=>BigInt(t.amount_minor)>0n),'amount_minor');
  const assets=sum(wealth.filter(w=>w.kind==='asset'),'amount_minor');
  const debts=sum(wealth.filter(w=>w.kind==='liability'),'amount_minor');
  const byCategory=new Map<string,bigint>();
  for(const tx of monthlyTransactions)if(BigInt(tx.amount_minor)<0n)
   byCategory.set(tx.category,(byCategory.get(tx.category)||0n)-BigInt(tx.amount_minor));
  const ordered=[...byCategory].sort((a,b)=>a[1]===b[1]?a[0].localeCompare(b[0]):a[1]>b[1]?-1:1);
  const upcoming=bills.filter(b=>{
   const due=Date.parse(String(b.next_due_on).slice(0,10)+'T12:00:00-03:00');
   return Number.isFinite(due)&&due<=Date.now()+30*86400000;
  });
  let title='',answer='',facts:string[]=[],sources:string[]=[],limitation='';
  switch(agentId){
   case 'expenses': {
    title='Seu mapa de gastos';
    answer=monthlyTransactions.some(t=>BigInt(t.amount_minor)<0n)
     ?'As despesas registradas neste mês totalizam '+fmt(spent)+'.'
     :'Ainda não há despesas registradas neste mês; importe um extrato ou lance movimentações.';
    facts=ordered.slice(0,5).map(([cat,value])=>cat+': '+fmt(value));
    for(const b of budgets){
     const used=byCategory.get(b.category)||0n,limit=BigInt(b.limit_minor);
     if(used>limit)facts.push('Orçamento excedido em '+b.category+': '+fmt(used-limit)+' acima do limite.');
    }
    sources=['transações declaradas/importadas','orçamentos informados'];break;
   }
   case 'financial': {
    title='Diagnóstico financeiro parcial';
    answer='Nas movimentações conhecidas deste mês: entradas '+fmt(income)+', saídas '+fmt(spent)+' e diferença '+fmt(income-spent)+'.';
    facts=[accounts.length?'Saldos manuais declarados: '+fmt(balance):'Sem contas manuais registradas.',
      'Bens e investimentos declarados: '+fmt(assets),'Dívidas declaradas: '+fmt(debts),
      'Patrimônio parcial estimado (sem eliminar eventuais sobreposições): '+fmt(balance+assets-debts)];
    sources=['contas manuais','movimentações','patrimônio declarado'];break;
   }
   case 'planning': {
    title='Planejamento e metas';
    answer=goals.length?'Você tem '+goals.length+' meta(s) ativa(s).':'Cadastre uma meta para acompanhar quanto falta e os próximos passos.';
    facts=goals.slice(0,4).map(g=>{
      const rem=BigInt(g.target_minor)-BigInt(g.saved_minor);
      return g.name+': faltam '+fmt(rem>0n?rem:0n)+' de '+fmt(g.target_minor)+'.';
    });
    facts.push('Lembretes a vencer ou vencidos nos próximos 30 dias: '+fmt(sum(upcoming,'amount_minor'))+'.');
    sources=['metas informadas','lembretes'];break;
   }
   case 'investments': {
    title='Visão dos investimentos declarados';
    const holdings=wealth.filter(w=>w.kind==='asset'&&/invest|acao|ação|fundo|titulo|título|cripto|previd|renda|cdb|tesouro/i.test(w.category+' '+w.name));
    answer=holdings.length?'Ativos possivelmente financeiros declarados: '+fmt(sum(holdings,'amount_minor'))+'. Não há cotação nem posições bancárias verificadas.':
      'Nenhum investimento identificável foi declarado. Adicione os seus ativos no Patrimônio para organizar sua visão.';
    facts=holdings.slice(0,5).map(w=>w.name+': '+fmt(w.amount_minor)+' (declarado)');
    facts.push('Antes de avaliar aplicações, registre objetivo, prazo, necessidade de liquidez e risco — não tenho essas informações.');
    sources=['patrimônio declarado'];limitation='Não é recomendação de investimento. Sem taxas, cotações, ordens ou corretoras conectadas.';break;
   }
   case 'shopping': {
    title='Análise de compra';
    if(!input.amountMinor){answer='Informe o preço da compra para avaliar seu impacto no saldo declarado.';}
    else{
      const price=BigInt(input.amountMinor),installments=input.installments||1;
      answer='Compra simulada de '+fmt(price)+(installments>1?' em '+installments+' parcelas':' à vista')+'.';
      facts=[accounts.length?'Saldo manual informado antes: '+fmt(balance):'Sem saldos declarados para comparação.',
        accounts.length?'Saldo hipotético após pagamento integral: '+fmt(balance-price):'Não é possível aferir impacto no saldo.',
        installments>1?'Parcela média aproximada: '+fmt(price/BigInt(installments))+' (arredondamento de centavos pode ocorrer).':'Despesa simulada à vista: '+fmt(price),
        'Despesas já registradas neste mês: '+fmt(spent)+'.'];
    }
    sources=['contas manuais','transações','valor hipotético informado'];limitation='Não verifica limite de cartão, crédito, renda futura ou preço de mercado. Não compra nada.';break;
   }
   case 'simulations': {
    title='Simulador de cenários';
    const months=input.months||12,monthly=input.monthlyMinor?BigInt(input.monthlyMinor):0n;
    if(monthly>0n){
      answer='Guardando '+fmt(monthly)+' por mês durante '+months+' mês(es), o total nominal novo seria '+fmt(monthly*BigInt(months))+'.';
      facts=['Sem supor juros, rendimentos, inflação ou tributação.',
       'Somando apenas ao saldo manual hoje declarado: '+fmt(balance+monthly*BigInt(months))+'.'];
    }else if(input.amountMinor){
      const value=BigInt(input.amountMinor),installments=input.installments||1;
      answer='Um custo de '+fmt(value)+' dividido em '+installments+' parcela(s) teria parcela média de '+fmt(value/BigInt(installments))+'.';
      facts=['Não inclui juros ou tarifas de financiamento.','Parcela média arredondada; o último pagamento pode incluir centavos residuais.'];
    }else answer='Informe uma reserva mensal ou um valor e número de parcelas para calcular um cenário nominal sem taxas inventadas.';
    sources=['valores hipotéticos fornecidos','saldo manual se existente'];break;
   }
   case 'payments': {
    title='Agenda de contas e pagamentos';
    answer=upcoming.length?'Há '+upcoming.length+' compromisso(s) informados com vencimento até 30 dias (inclui vencidos): '+fmt(sum(upcoming,'amount_minor'))+'.':
      'Você ainda não possui lembretes para os próximos 30 dias.';
    facts=upcoming.slice(0,6).map(b=>b.name+': '+fmt(b.amount_minor)+' · '+String(b.next_due_on).slice(0,10));
    facts.push('Nenhum Pix, boleto ou pagamento é iniciado pela homologação.');
    sources=['lembretes cadastrados'];limitation='A Efí e pagamentos reais ainda não estão habilitados. Marcar lembrete não paga a conta.';break;
   }
   case 'contracts': {
    title='Checklist de leitura contratual';
    const contract=(input.contractText||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(!contract){
      answer='Cole um trecho de contrato para verificar se há menções a tópicos importantes. Não vou enviar o texto a provedores externos nem armazená-lo.';
      facts=['Verificar: partes e objeto, valores, prazos, reajustes, rescisão, multas, responsabilidades, privacidade e solução de conflitos.'];
    }else{
      const checks:[string,RegExp][]=[
       ['Prazo ou vigência',/prazo|vigencia|duracao|validade/],
       ['Valores ou pagamento',/preco|valor|pagamento|remuneracao|parcela/],
       ['Reajuste',/reajuste|correcao monetaria|indice/],
       ['Rescisão',/rescisao|cancelamento|extincao contratual/],
       ['Multas ou penalidades',/multa|penalidade|sancao/],
       ['Privacidade ou LGPD',/lgpd|dados pessoais|privacidade/],
       ['Responsabilidades',/responsabilidade|obrigacao/]
      ];
      const missing=checks.filter(([,regex])=>!regex.test(contract)).map(([label])=>label);
      answer='Fiz uma conferência por palavras-chave no trecho colado. '+(missing.length?'Não identifiquei referência clara a '+missing.length+' tópico(s).':'Encontrei menções aos tópicos principais pesquisados.');
      facts=missing.length?missing.map(item=>'Conferir manualmente: '+item):['Os tópicos foram mencionados; presença de palavras não comprova adequação das cláusulas.'];
    }
    sources=['trecho fornecido nesta requisição (não armazenado)'];limitation='Leitura textual preliminar, não avaliação jurídica ou assinatura. Confirme o contrato integral com profissional habilitado.';break;
   }
  }
  return {
   agentId,agentName:catalog.find(a=>a.id===agentId)?.name,title,answer,facts,sources,limitation,
   verifiedBanking:false,modelCalled:false,externalEffect:false,canInitiatePayment:false,
   provenance:'Registros inseridos/importados pelo usuário ou cenários hipotéticos; não verificados pelos bancos.'
  };
 });
}
