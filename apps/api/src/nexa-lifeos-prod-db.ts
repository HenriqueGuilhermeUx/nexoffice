/**
 * Future Nexa PF production database connection constructor.
 * Not used by current NexOffices PJ or the invitation-only preview.
 * This guard must be wired into a separately reviewed PF production entrypoint.
 */
export function lifeosProductionPgConnection(
 connectionString:string,
 env:Record<string,string|undefined>
){
 if(env.NEXA_LIFEOS_ENV!=='production'||env.NEXA_LIFEOS_DB_TLS_STRICT!=='true')
  throw new Error('PF production-only DB connection requires production+strict TLS flags');
 let url:URL;
 try{url=new URL(connectionString)}catch{throw new Error('Valid dedicated PostgreSQL URL required');}
 if(!['postgres:','postgresql:'].includes(url.protocol)
   ||url.pathname!=='/nexa_lifeos_prod'
   ||!url.hostname.endsWith('.neon.tech')
   ||!url.username||!url.password)
  throw new Error('Dedicated Nexa PF production Neon database is required');
 if(url.hostname!==env.NEXA_LIFEOS_DB_HOST
   ||url.searchParams.get('sslmode')!=='verify-full')
  throw new Error('Database hostname and strict SSL verification must match reviewed PF settings');
 for(const key of [...url.searchParams.keys()])
  if(!['sslmode','channel_binding'].includes(key))
   throw new Error('Unexpected database connection override prohibited');
 url.searchParams.set('sslmode','verify-full');
 return {connectionString:url.toString(),connectionTimeoutMillis:15000};
}
