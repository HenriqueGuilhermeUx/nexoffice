/**
 * Isolated Nex Personal preview PostgreSQL connection policy.
 *
 * Production preview must verify both the server certificate and hostname;
 * neither the database URL sslmode=require alias nor DATABASE_SSL=true
 * is allowed to weaken this. All non-preview services retain their existing
 * connection options: this file makes no cross-product changes.
 *
 * CI may use disposable, local PostgreSQL without TLS ONLY when BOTH CI=true
 * and NEX_PERSONAL_PREVIEW_CI=true. Never allow that exception in Render.
 */
export type PersonalDbEnvironment=Partial<Pick<NodeJS.ProcessEnv,
 'NEX_PERSONAL_PREVIEW'|'NEX_PERSONAL_PREVIEW_CI'|'CI'|'DATABASE_SSL'>>;
export type PersonalDbConnection={connectionString:string;ssl?:{rejectUnauthorized:false}};

export function personalPgConnection(
 input:string|undefined,
 env:PersonalDbEnvironment
):PersonalDbConnection{
 if(!input)throw new Error('DATABASE_URL is not configured');
 if(env.NEX_PERSONAL_PREVIEW!=='true'){
  return {connectionString:input,
   ssl:env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined};
 }
 const disposableCi=env.CI==='true'&&env.NEX_PERSONAL_PREVIEW_CI==='true';
 if(disposableCi)return {connectionString:input};
 let url:URL;
 try{url=new URL(input)}catch{throw new Error('Personal preview requires a valid PostgreSQL URL');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username)
  throw new Error('Personal preview requires a PostgreSQL URL with a hostname and user.');
 const host=url.hostname.toLowerCase();
 if(['localhost','127.0.0.1','::1','[::1]'].includes(host))
  throw new Error('Personal preview cannot use loopback PostgreSQL outside isolated CI.');
 // Preserve credentials, database and channel binding, but require the
 // strongest standardized mode even when existing URLs say
 // sslmode=require, prefer, verify-ca or disable.
 // Reject URL query overrides that could otherwise bypass hostname/TLS checks.
 url.searchParams.delete('host');
 url.searchParams.delete('ssl');
 url.searchParams.delete('uselibpqcompat');
 url.searchParams.set('sslmode','verify-full');
 return {connectionString:url.toString()};
}
