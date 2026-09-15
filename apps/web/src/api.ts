export type SessionUser={id:string;name:string;email:string};
export type Workspace={id:string;name:string;slug:string;vertical:string;plan:string;status:string;role:string;permissions:string[]};

const API=(import.meta as any).env?.VITE_API_URL||'http://localhost:4000';
const TOKEN_KEY='nexoffice.token';
const WORKSPACE_KEY='nexoffice.workspace';

export const session={
  token:()=>localStorage.getItem(TOKEN_KEY)||'',
  workspace:()=>localStorage.getItem(WORKSPACE_KEY)||'',
  set:(token:string,workspaceId?:string)=>{localStorage.setItem(TOKEN_KEY,token);if(workspaceId)localStorage.setItem(WORKSPACE_KEY,workspaceId)},
  setWorkspace:(id:string)=>localStorage.setItem(WORKSPACE_KEY,id),
  clear:()=>{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(WORKSPACE_KEY)}
};

export async function api<T=any>(path:string,init:RequestInit={}):Promise<T>{
  const headers=new Headers(init.headers||{});headers.set('content-type','application/json');
  const token=session.token();if(token)headers.set('authorization',`Bearer ${token}`);
  const workspace=session.workspace();if(workspace)headers.set('x-workspace-id',workspace);
  const r=await fetch(`${API}${path}`,{...init,headers});
  const body=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(body?.message||body?.error||`HTTP ${r.status}`) as Error&{status?:number;code?:string};e.status=r.status;e.code=body?.error;throw e}
  return body as T;
}

export const post=<T=any>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const patch=<T=any>(path:string,body:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(body)});
export const put=<T=any>(path:string,body:unknown)=>api<T>(path,{method:'PUT',body:JSON.stringify(body)});
