import http from 'node:http';

const port=Number(process.env.FAKE_TAXAGENT_PORT||4010);const expected=String(process.env.TAXAGENT_NEXOFFICE_KEY||'taxagent-partner-ci-key');
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))};
const read=async req=>{let raw='';for await(const chunk of req)raw+=chunk;try{return raw?JSON.parse(raw):{}}catch{return {}}};
const company={id:'comp_nexoffice_ci',name:'NexOffice Fiscal Smoke',city_code:'3550308',tax_regime:'regular'};
const journey=status=>({company,environment:'test',fiscal_status:status,onboarding_status:status==='HOMOLOGATION_READY'?'READY_FOR_HOMOLOGATION':'BLOCKED',route:{resolved_route:'national-direct',resolved_provider:'nfse-national'},stages:[{id:'company_profile',label:'Empresa e enquadramento fiscal',status:'COMPLETE',detail:'Requisitos satisfeitos.'},{id:'a1_certificate',label:'Certificado A1',status:status==='ACTION_REQUIRED'?'ACTION_REQUIRED':'COMPLETE',detail:status==='ACTION_REQUIRED'?'A1 necessário':'Requisitos satisfeitos.'},{id:'provider_preflight',label:'Preflight do provedor',status:status==='HOMOLOGATION_READY'?'PREFLIGHT_OK':'NOT_RUN'}],blockers:status==='ACTION_REQUIRED'?['active_a1']:[],next_action:status==='ACTION_REQUIRED'?{action:'Enviar certificado A1'}:{action:'Empresa pronta para teste autorizado.'},safeguards:{bootstrap_token_required_by_customer:false,fiscal_transmission_attempted:false,fiscal_emission_attempted:false}});
let advanced=false;
const server=http.createServer(async(req,res)=>{
  if(req.headers['x-taxagent-nexoffice-key']!==expected)return json(res,401,{error:'invalid_partner_key'});
  const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);const path=url.pathname;
  if(req.method==='POST'&&path==='/v1/partners/nexoffice/provision'){const body=await read(req);return json(res,201,{company:{...company,tax_id_masked:'12********0190',organization_id:'org_ci'},environment:url.searchParams.get('environment')||'test',fiscal_status:'ACTION_REQUIRED',route:{resolved_route:'national-direct',resolved_provider:'nfse-national'},blockers:['active_a1'],checklist:[],next_actions:[{requirement:'active_a1',action:'Enviar certificado A1'}],safeguards:{fiscal_emission_attempted:false},received_tax_id:Boolean(body.tax_id)})}
  if(req.method==='GET'&&/\/v1\/partners\/nexoffice\/companies\/[^/]+\/fiscal$/.test(path))return json(res,200,journey(advanced?'HOMOLOGATION_READY':'ACTION_REQUIRED'));
  if(req.method==='POST'&&/\/fiscal\/profile$/.test(path)){await read(req);return json(res,200,journey(advanced?'HOMOLOGATION_READY':'ACTION_REQUIRED'))}
  if(req.method==='POST'&&/\/certificate$/.test(path)){const body=await read(req);if(!body.pfx_base64||!body.password)return json(res,400,{error:'certificate_required'});return json(res,201,{id:'cert_ci',status:'active',secret_material_returned:false})}
  if(req.method==='POST'&&/\/provider-credentials$/.test(path)){const body=await read(req);return json(res,201,{provider:body.provider,status:'stored',secrets_returned:false})}
  if(req.method==='POST'&&/\/fiscal\/advance$/.test(path)){advanced=true;return json(res,200,journey('HOMOLOGATION_READY'))}
  if(req.method==='POST'&&path==='/v1/partners/nexoffice/invoices'){const body=await read(req);return json(res,202,{id:'inv_ci',status:'queued',company_id:body.company_id,idempotency_key:req.headers['idempotency-key']||null})}
  if(req.method==='GET'&&/\/invoices\/[^/]+$/.test(path))return json(res,200,{id:path.split('/').pop(),status:'authorized',company_id:company.id});
  if(req.method==='POST'&&/\/invoices\/[^/]+\/cancel$/.test(path))return json(res,202,{id:path.split('/').slice(-2,-1)[0],status:'cancellation_requested'});
  return json(res,404,{error:'not_found',path});
});
server.listen(port,'127.0.0.1',()=>console.log(`fake_taxagent_partner_listening:${port}`));
