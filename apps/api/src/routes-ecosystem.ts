import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';

const OFFERS={
  av_studio:{
    key:'av_studio',
    kind:'first_party_service',
    label:'Alternative Ventures Studio',
    eyebrow:'SOLUÇÕES SOB MEDIDA',
    title:'Seu negócio precisa de algo que um SaaS pronto não resolve?',
    description:'Sites, sistemas próprios, aplicativos e integrações construídos sob medida para necessidades que ultrapassam a configuração padrão do NexOffice.',
    status:'available',
    cta:'Quero conversar',
    capabilities:['sites','web_apps','mobile_apps','custom_systems','integrations'],
    externalEffect:false
  },
  nexa:{
    key:'nexa',
    kind:'future_offer',
    label:'Nexa',
    eyebrow:'FINANCEIRO · EM PREPARAÇÃO',
    title:'Conheça a evolução financeira que estamos preparando.',
    description:'A Nexa poderá complementar o ecossistema financeiro no futuro. Neste momento a oferta é apenas informativa: nenhuma conta BaaS, Pix bancário, custódia ou operação financeira é provisionada pelo NexOffice.',
    status:'future',
    cta:'Tenho interesse',
    capabilities:[],
    externalEffect:false,
    constraints:['no_baas','no_account_provisioning','no_custody','no_financial_execution']
  }
} as const;
type OfferKey=keyof typeof OFFERS;

export async function registerEcosystemRoutes(app:FastifyInstance){
  app.get('/v1/ecosystem/offers',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const interests=await query<any>(`select offer_key,status,created_at from ecosystem_interests where workspace_id=$1 order by created_at desc`,[ctx.workspaceId]);
    return Object.values(OFFERS).map(offer=>({...offer,interest:interests.find(x=>x.offer_key===offer.key)||null}));
  });

  app.post('/v1/ecosystem/offers/:key/interest',async req=>{
    const ctx=await workspaceContext(req,'workspace.write'),key=String((req.params as any).key) as OfferKey;
    if(!(key in OFFERS))throw new ApiError(404,'offer_not_found','Oferta não encontrada.');
    const input=z.object({message:z.string().trim().max(2000).optional().nullable(),context:z.record(z.string(),z.unknown()).default({})}).parse(req.body||{});
    const rows=await query<any>(`insert into ecosystem_interests(workspace_id,offer_key,requested_by,message,context) values($1,$2,$3,$4,$5) returning id,workspace_id,offer_key,message,context,status,created_at,updated_at`,[ctx.workspaceId,key,ctx.user.id,input.message||null,JSON.stringify(input.context)]);
    await auditLog(ctx,'ecosystem.offer.interest_created','ecosystem_interest',rows[0].id,null,{offerKey:key,status:'new',externalEffect:false});
    return {interest:rows[0],offer:OFFERS[key],externalEffect:false,note:key==='nexa'?'Interesse registrado apenas como sinal de demanda; nenhuma conta ou operação financeira foi iniciada.':'Interesse registrado para contato comercial do Alternative Ventures Studio.'};
  });
}
