/** Disabled-by-default loopback-only US identity and tenancy lab. Not a public API. */
import { createServer } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { USLabStore } from './store.mjs';

function reply(res,status,data,extra={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(JSON.stringify(data));
}
function sessionCookie(req){
  const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('us_lab_session='));
  return value?value.slice('us_lab_session='.length):'';
}
async function jsonBody(req){
  const chunks=[];let size=0;
  for await (const chunk of req){
    size+=chunk.length;
    if(size>16_384)throw Error('Request too large');
    chunks.push(chunk);
  }
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!data||Array.isArray(data)||typeof data!=='object')throw Error('JSON object required');
  return data;
}
const only=(body,keys)=>Object.keys(body).every(key=>keys.includes(key));

export async function startUSLab({enabled=false,dbFile,host='127.0.0.1',port=0,nodeEnv=process.env.NODE_ENV}={}){
  if(!enabled||process.env.USA_LAB_ENABLED!=='1')throw Error('US identity lab is disabled by default');
  if(nodeEnv==='production')throw Error('US identity lab cannot run in production mode');
  if(host!=='127.0.0.1')throw Error('US identity lab may listen only on IPv4 loopback');
  if(!isAbsolute(dbFile||'')||!resolve(dbFile).startsWith(resolve(tmpdir())+'/'))throw Error('US lab database must be separate local file under OS temporary directory');
  const store=new USLabStore(dbFile), failures=new Map();
  let origin='';
  const server=createServer(async(req,res)=>{
    const pathname=new URL(req.url||'/',origin).pathname,method=req.method||'GET';
    const changing=!['GET','HEAD'].includes(method);
    if(req.headers.host!==`127.0.0.1:${server.address()?.port}`)return reply(res,403,{error:'loopback_host_required'});
    if(req.headers['x-forwarded-host']||req.headers['x-forwarded-proto'])return reply(res,403,{error:'proxy_forbidden'});
    if(changing&&req.headers.origin!==origin)return reply(res,403,{error:'origin_mismatch'});
    if(changing&&req.headers['content-type']?.split(';')[0]!=='application/json')return reply(res,415,{error:'json_required'});
    try{
      if(pathname==='/healthz'&&method==='GET')return reply(res,200,{status:'ok',region:'US',mode:'isolated_test_only'});
      if(!pathname.startsWith('/lab/'))return reply(res,404,{error:'not_found'});
      if(pathname==='/lab/login'&&method==='POST'){
        const body=await jsonBody(req);
        if(!only(body,['orgId','email','password','region'])||(body.region!==undefined&&body.region!=='US'))return reply(res,400,{error:'invalid_region_or_shape'});
        const key=`${req.socket.remoteAddress}:${typeof body.email==='string'?body.email.toLowerCase():''}`;
        const limit=failures.get(key)??{count:0,reset:Date.now()+60_000};
        if(limit.reset<=Date.now()){limit.count=0;limit.reset=Date.now()+60_000;}
        if(limit.count>=5)return reply(res,429,{error:'rate_limited'});
        const session=store.authenticate(body.orgId,body.email,body.password);
        if(!session){limit.count++;failures.set(key,limit);return reply(res,401,{error:'invalid_credentials'});}
        failures.delete(key);
        return reply(res,200,{authenticated:true,region:'US'},{'Set-Cookie':`us_lab_session=${session.token}; HttpOnly; SameSite=Strict; Path=/lab; Max-Age=1800`});
      }
      const token=sessionCookie(req),identity=store.resolveSession(token);
      if(!identity)return reply(res,401,{error:'authentication_required'});
      if(pathname==='/lab/me'&&method==='GET')return reply(res,200,{userId:identity.userId,orgId:identity.orgId,email:identity.email,region:'US'});
      if(pathname==='/lab/logout'&&method==='POST'){
        store.revokeSession(token);
        return reply(res,200,{authenticated:false},{'Set-Cookie':'us_lab_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/lab'});
      }
      if(pathname==='/lab/tasks'&&method==='GET'){
        if(new URL(req.url,origin).searchParams.size)return reply(res,400,{error:'query_filters_forbidden'});
        return reply(res,200,{region:'US',tasks:store.listTasks(identity)});
      }
      if(pathname==='/lab/tasks'&&method==='POST'){
        const body=await jsonBody(req);
        if(!only(body,['title'])||typeof body.title!=='string'||!body.title.trim()||body.title.length>120)return reply(res,400,{error:'invalid_task'});
        return reply(res,201,{region:'US',task:store.createTask(identity,body.title)});
      }
      const match=/^\/lab\/tasks\/([0-9a-f-]+)\/complete$/.exec(pathname);
      if(match&&method==='POST'){
        const body=await jsonBody(req);
        if(Object.keys(body).length)return reply(res,400,{error:'invalid_task'});
        return store.completeTask(identity,match[1])?reply(res,200,{region:'US',status:'completed'}):reply(res,404,{error:'not_found'});
      }
      return reply(res,404,{error:'not_found'});
    }catch(err){
      if(err instanceof SyntaxError||/^(Request too large|JSON object required|Invalid task title)$/.test(err.message))return reply(res,400,{error:'invalid_json_or_task'});
      return reply(res,500,{error:'sandbox_internal_error'});
    }
  });
  try{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,ok);});}
  catch(error){store.close();throw error;}
  origin=`http://${host}:${server.address().port}`;
  return {origin,store,close:async()=>{await new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));store.close();}};
}
