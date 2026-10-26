/** Local-only US OIDC BFF contract. Synthetic IdP only; never deployed. */
import { createServer } from 'node:http';
import { createUSOIDCLabFlow, newUSLabBrowserBinding } from './auth-flow.mjs';

const bindingName = 'us_lab_oidc_binding';
const sessionName = 'us_lab_oidc_session';
const noStoreHeaders = Object.freeze({
  'Cache-Control':'no-store, max-age=0',
  'Pragma':'no-cache',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"
});
function send(res,status,body,extra={}) {
  res.writeHead(status,{
    ...noStoreHeaders,'Content-Type':'application/json; charset=utf-8',...extra
  });
  res.end(JSON.stringify(body));
}
const fail=(res,status,error='request_rejected',extra={})=>send(res,status,{error},extra);
function extract(req,name) {
  const values=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  return values.length===1?values[0].slice(name.length+1):'';
}
function bindingCookie(value,maxAge=300) {
  // Lax permits top-level redirect from an IdP. Production must add Secure on HTTPS.
  return bindingName+'='+value+'; HttpOnly; SameSite=Lax; Path=/lab/oidc; Max-Age='+maxAge;
}
function sessionCookie(value,maxAge=1800) {
  return sessionName+'='+value+'; HttpOnly; SameSite=Strict; Path=/lab/oidc; Max-Age='+maxAge;
}
async function readBody(req) {
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Error('bad_content_type');
  let total=0;const buffers=[];
  for await(const chunk of req) {
    total+=chunk.length;
    if(total>1024)throw Error('body_too_large');
    buffers.push(chunk);
  }
  const obj=JSON.parse(Buffer.concat(buffers).toString('utf8'));
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('invalid_body');
  return obj;
}

/** Injected synthetic exchange only; never connects to a real identity service. */
export async function startUSOIDCBFF({
  enabled=false, host='127.0.0.1', port=0, store,
  issuer, authorizationEndpoint, clientId, jwks, exchangeCode,
  nodeEnv=process.env.NODE_ENV
}={}) {
  if(!enabled||process.env.USA_LAB_ENABLED!=='1'||nodeEnv==='production')throw Error('US OIDC BFF disabled');
  if(host!=='127.0.0.1'||!Number.isSafeInteger(port)||port<0||port>65535)throw Error('US OIDC BFF requires loopback only');
  if(!store||typeof store.resolveOIDCSubject!=='function'||
     typeof store.issueOIDCSession!=='function'||typeof store.resolveSession!=='function') {
    throw Error('US OIDC BFF requires isolated lab store');
  }
  // Only reserved synthetic issuers; no commercial IdP.
  if(typeof issuer!=='string'||typeof authorizationEndpoint!=='string'||
     !new URL(issuer).hostname.endsWith('.example')||
     !new URL(authorizationEndpoint).hostname.endsWith('.example')) {
    throw Error('Only synthetic OIDC fixtures are permitted');
  }
  let origin='',flow;
  const server=createServer(async(req,res)=>{
    const hostHeader='127.0.0.1:'+(server.address()?.port);
    if(req.headers.host!==hostHeader||req.socket.remoteAddress!=='127.0.0.1'||
       req.headers['x-forwarded-host']||req.headers['x-forwarded-proto'])return fail(res,403,'loopback_required');
    let url;
    try{url=new URL(req.url??'/',origin);}catch{return fail(res,400);}
    const pathname=url.pathname,method=req.method??'GET';
    if(!pathname.startsWith('/lab/oidc/'))return fail(res,404,'not_found');
    if(!['GET','POST'].includes(method))return fail(res,405,'method_not_allowed');
    if(method==='POST'&&req.headers.origin!==origin)return fail(res,403,'origin_mismatch');
    if(method==='GET'&&pathname!=='/lab/oidc/callback'&&url.search)return fail(res,400,'query_rejected');
    try{
      if(pathname==='/lab/oidc/begin'&&method==='POST'){
        const data=await readBody(req);
        if(Object.keys(data).length!==1||typeof data.orgId!=='string')return fail(res,400);
        const binding=newUSLabBrowserBinding();
        const start=flow.begin({orgId:data.orgId,browserBinding:binding});
        return send(res,200,{authorizationUrl:start.authorizationUrl,fixtureOnly:true},{
          'Set-Cookie':bindingCookie(binding)
        });
      }
      if(pathname==='/lab/oidc/callback'&&method==='GET'){
        if([...url.searchParams.keys()].sort().join(',')!=='code,state')return fail(res,400,'callback_rejected');
        const binding=extract(req,bindingName);
        try{
          const identity=await flow.complete({
            state:url.searchParams.get('state'),code:url.searchParams.get('code'),
            browserBinding:binding
          });
          const session=store.issueOIDCSession({issuer,subject:identity.subject,orgId:identity.orgId});
          if(!session||session.userId!==identity.userId)throw Error('membership_changed');
          res.writeHead(303,{
            ...noStoreHeaders,'Location':'/lab/oidc/result',
            'Set-Cookie':[bindingCookie('',0),sessionCookie(session.token)]
          });
          return res.end();
        }catch{return fail(res,401,'callback_rejected',{'Set-Cookie':bindingCookie('',0)});}
      }
      const actor=store.resolveSession(extract(req,sessionName));
      if(!actor)return fail(res,401,'authentication_required');
      if(pathname==='/lab/oidc/result'&&method==='GET'){
        return send(res,200,{authenticated:true,region:'US',orgId:actor.orgId,userId:actor.userId});
      }
      if(pathname==='/lab/oidc/tasks'&&method==='GET'){
        return send(res,200,{region:'US',tasks:store.listTasks(actor)});
      }
      if(pathname==='/lab/oidc/tasks'&&method==='POST'){
        const body=await readBody(req);
        if(Object.keys(body).length!==1||typeof body.title!=='string'||body.title.length>120||!body.title.trim())return fail(res,400);
        return send(res,201,{region:'US',task:store.createTask(actor,body.title)});
      }
      if(pathname==='/lab/oidc/logout'&&method==='POST'){
        const body=await readBody(req);
        if(Object.keys(body).length!==0)return fail(res,400);
        store.revokeSession(extract(req,sessionName));
        return send(res,200,{authenticated:false},{'Set-Cookie':sessionCookie('',0)});
      }
      return fail(res,404,'not_found');
    }catch{return fail(res,400,'request_rejected');}
  });
  try{
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,host,done);});
    origin='http://'+host+':'+server.address().port;
    flow=createUSOIDCLabFlow({
      issuer,authorizationEndpoint,clientId,jwks,exchangeCode,
      redirectUri:origin+'/lab/oidc/callback',
      resolveMember:input=>store.resolveOIDCSubject(input)
    });
  }catch(error){
    if(server.listening)await new Promise(done=>server.close(done));
    throw error;
  }
  return Object.freeze({origin,close:()=>new Promise((done,reject)=>server.close(error=>error?reject(error):done()))});
}
