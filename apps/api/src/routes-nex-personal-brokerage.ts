/**
 * Nex Personal brokerage marketplace read model — future partner distribution.
 * There is NO live distribution, ranking, personalization, outbound leads,
 * client-data transfer or trade execution in this stage.
 */
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {authenticate,ApiError} from './auth.js';
import {query} from './db.js';

async function requireActivePersonal(req:FastifyRequest){
 const user=await authenticate(req);
 const rows=await query<{user_id:string}>('select user_id from nex_personal.profiles where user_id=$1',[user.id]);
 if(!rows.length)throw new ApiError(409,'personal_activation_required','Ative seu espaço Nex Personal.');
}

// Product discovery content here is educational, NOT a financial product catalog.
// Do not populate partners or investment products without verified partner data,
// consent, legal review, data licence checks, disclosure and suitability controls.
const education=[
 {id:'fixed_income',label:'Renda fixa',focus:'Emissor, rentabilidade bruta e líquida, prazo, liquidez, tributação e garantias aplicáveis.'},
 {id:'government_bonds',label:'Títulos públicos',focus:'Marcação a mercado, prazo, indexador, tributação e regras de resgate.'},
 {id:'funds',label:'Fundos',focus:'Regulamento, riscos, taxas, tributação, carência e histórico de desempenho sem garantia futura.'},
 {id:'etfs',label:'ETFs',focus:'Índice, taxa total, tracking error, liquidez, câmbio e risco de mercado.'},
 {id:'stocks',label:'Ações',focus:'Risco do emissor, diversificação, liquidez, taxas e horizonte.'},
 {id:'private_pension',label:'Previdência',focus:'Taxas, tributação, portabilidade, beneficiários e condições de resgate.'}
] as const;

export async function registerNexPersonalBrokerageRoutes(app:FastifyInstance){
 app.get('/v1/personal/finsight/brokerage',async req=>{
  await requireActivePersonal(req);
  return {
   provider:'f-insight',module:'brokerage-discovery',
   status:'preparation',distributionEnabled:false,
   recommendationEnabled:false,suitabilityVerified:false,
   partners:[],products:[],leadSubmissionEnabled:false,
   accountOpeningEnabled:false,orderExecutionEnabled:false,
   customerDataShared:false,commissionDisclosureRequired:true,
   categories:education,
   note:'Conteúdo educativo e comparação manual. Nenhuma oferta, cotação, taxa ou parceiro está disponível para contratação neste ambiente.'
  };
 });
}
