import http from 'node:http';
import {randomUUID} from 'node:crypto';
const port=Number(process.env.FAKE_MODO_PORT||4999),projects=[],campaigns=[],drafts=new Map();
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))};
const read=async req=>{let s='';for await(const c of req)s+=c;try{return s?JSON.parse(s):{}}catch{return{}}};
const server=http.createServer(async(req,res)=>{const u=new URL(req.url||'/',`http://127.0.0.1:${port}`),p=u.pathname.replace('/api/v1/internal/nexoffice/marketing/v1/','');if(req.headers['x-nexoffice-key']!=='test-key')return send(res,401,{error:'unauthorized'});
 if(p==='health')return send(res,200,{status:'ok',contract:'nexoffice-marketing-v1',workflow:['draft','review','ready'],googleAds:{oauthConfigured:false,metricsReadOnly:true},externalCampaignActivation:false,content:{draftCreation:true,publishing:false}});
 if(p==='demand/projects'&&req.method==='GET')return send(res,200,projects);
 if(p==='demand/projects'&&req.method==='POST'){const b=await read(req),x={id:randomUUID(),...b,status:'draft'};projects.unshift(x);return send(res,201,x)}
 let m=p.match(/^demand\/projects\/([^/]+)\/landing$/);if(m&&req.method==='POST')return send(res,200,{id:m[1],status:'landing_ready',landing:{headline:'Oferta registrada',compliance:{status:'review_required'}}});
 m=p.match(/^demand\/projects\/([^/]+)\/leads$/);if(m&&req.method==='GET')return send(res,200,[{id:'11111111-1111-4111-8111-111111111111',name:'Lead Comercial',email:'lead@example.com',phone:'5513999999999',utm:{utm_source:'google',utm_campaign:'commercial-v1'},createdAt:new Date().toISOString()}]);
 m=p.match(/^demand\/projects\/([^/]+)\/funnel$/);if(m&&req.method==='GET')return send(res,200,{projectId:m[1],pageViews:120,ctaClicks:18,leads:1,qualifiedLeads:0,customers:0,ctaRate:15,leadRate:.83});
 if(p==='ads/plan'&&req.method==='POST'){const b=await read(req);return send(res,200,{summary:`Plano para ${b.business}`,channelPlan:[{channel:'google_search'}],audience:'usar contexto fornecido',message:'usar oferta registrada'})}
 if(p==='campaigns'&&req.method==='GET')return send(res,200,campaigns);
 if(p==='campaigns'&&req.method==='POST'){const b=await read(req),x={id:randomUUID(),...b,status:'draft'};campaigns.unshift(x);return send(res,201,x)}
 m=p.match(/^campaigns\/([^/]+)\/review$/);if(m&&req.method==='POST')return send(res,200,{id:m[1],status:'review'});
 m=p.match(/^campaigns\/([^/]+)\/ready$/);if(m&&req.method==='POST')return send(res,409,{error:'MEDIA_ACCOUNT_REQUIRED',message:'Conta autorizada necessária.'});
 if(p==='media/connections'&&req.method==='GET')return send(res,200,[]);
 if(p==='media/connections/google_ads/prepare'&&req.method==='POST')return send(res,201,{authorization:{ready:false,authorizationUrl:null}});
 if(p==='media/google_ads/metrics'&&req.method==='GET')return send(res,200,{provider:'google_ads',spend:0,clicks:0,conversions:0,readOnly:true});
 if(p==='prospecting/campaigns'&&req.method==='GET')return send(res,200,[]);
 if(p==='content/drafts'&&req.method==='GET')return send(res,200,{requests:[...drafts.values()],governance:{publishing:false,externalPublication:false}});
 if(p==='content/drafts'&&req.method==='POST'){const b=await read(req),id=randomUUID(),request={id,...b,status:'ready',creditsCharged:0,revisionCount:0,maxRevisions:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),output:{hook:'Organize seu próximo passo comercial',title:'Cresça com uma operação mais organizada',caption:'Conheça a oferta registrada e fale com a equipe para entender se ela faz sentido para seu negócio.',cta:'Quero saber mais',hashtags:[],visualDirection:'Visual profissional sem alegações adicionais',slides:[],script:[],storyFrames:[],adaptationNotes:[]}};drafts.set(id,request);return send(res,201,{request,governance:{billingMode:'nexoffice_entitlement',modoCreditsCharged:0,publishing:false,externalPublication:false}})}
 m=p.match(/^content\/drafts\/([^/]+)$/);if(m&&req.method==='GET'){const d=drafts.get(m[1]);return d?send(res,200,{request:d,governance:{publishing:false,externalPublication:false}}):send(res,404,{error:'not_found'})}
 m=p.match(/^content\/drafts\/([^/]+)\/approve$/);if(m&&req.method==='POST'){const d=drafts.get(m[1]);if(!d)return send(res,404,{error:'not_found'});d.status='approved';return send(res,200,{request:d,governance:{explicitApproval:true,publishing:false,externalPublication:false}})}
 return send(res,404,{error:'not_found',path:p});});
server.listen(port,'127.0.0.1',()=>console.log(`fake-modo-commercial:${port}`));
