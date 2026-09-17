type ProviderResult<T=any>={ok:boolean;payload?:T;error?:string;httpStatus?:number};

function config(){
  const base=String(process.env.DOCWALLET_BASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.DOCWALLET_SERVICE_KEY||process.env.DOCWALLET_API_KEY||'');
  return {base,key,configured:Boolean(base&&key)};
}

async function read<T=any>(workspaceId:string,path:string):Promise<ProviderResult<T>>{
  const {base,key,configured}=config();
  if(!configured)return {ok:false,error:'docwallet_not_configured'};
  try{
    const response=await fetch(`${base}/${path.replace(/^\//,'')}`,{
      method:'GET',
      headers:{accept:'application/json','X-NexOffice-Key':key,'X-NexOffice-Workspace-ID':workspaceId},
      signal:AbortSignal.timeout(12000)
    });
    const text=await response.text();
    const payload=(()=>{try{return JSON.parse(text)}catch{return {text:text.slice(0,1200)}}})();
    if(!response.ok)return {ok:false,httpStatus:response.status,error:(payload as any)?.error||(payload as any)?.message||`HTTP ${response.status}`,payload};
    return {ok:true,httpStatus:response.status,payload};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:String(error)}}
}

export function docWalletIntelligenceConfigured(){return config().configured}

export async function readDocWalletIntelligence(workspaceId:string,externalRef:string){
  return read(workspaceId,`/api/internal/nexoffice/documents/${encodeURIComponent(externalRef)}/intelligence`);
}

export async function readDocWalletAlerts(workspaceId:string,externalRef:string){
  return read(workspaceId,`/api/internal/nexoffice/documents/${encodeURIComponent(externalRef)}/alerts`);
}

export async function readDocWalletUpcomingExpirations(workspaceId:string,days=60){
  const safeDays=Math.max(1,Math.min(365,Math.round(Number(days)||60)));
  return read(workspaceId,`/api/internal/nexoffice/contracts/upcoming-expirations?days=${safeDays}`);
}
