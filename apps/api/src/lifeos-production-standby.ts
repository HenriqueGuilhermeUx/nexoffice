/**
 * Isolated Nexa PF production API bootstrap: health-only / NOT READY.
 *
 * This is NOT an authenticated Life OS backend: deliberately exposes no
 * registration, login, wallet, PJ or finance routes until production identity,
 * database migrations, privacy and monitoring complete their own QA gates.
 */
import Fastify from 'fastify';
import type {FastifyInstance} from 'fastify';
import {validateLifeOsProductionEnvironment} from './lifeos-production-policy.js';
import type {LifeOsProductionEnvironment} from './lifeos-production-policy.js';

export function createLifeOsProductionStandby(
 env:LifeOsProductionEnvironment
):FastifyInstance{
 const config=validateLifeOsProductionEnvironment(env);
 const app=Fastify({logger:false,bodyLimit:64*1024});
 app.addHook('onRequest',async(req,reply)=>{
   reply.header('cache-control','no-store');
   reply.header('x-content-type-options','nosniff');
   reply.header('x-frame-options','DENY');
   reply.header('referrer-policy','no-referrer');
   reply.header('content-security-policy',
     "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
   reply.header('permissions-policy','camera=(), microphone=(), geolocation=(), payment=()');
   reply.header('strict-transport-security','max-age=31536000');
   reply.header('vary','Origin');
   const origin=req.headers.origin;
   if(origin&&origin!==config.frontendOrigin){
     return reply.code(403).send({error:'origin_denied'});
   }
   if(origin===config.frontendOrigin)
     reply.header('access-control-allow-origin',config.frontendOrigin);
 });
 app.get('/health',async()=>({
   service:'nexa-lifeos-production-standby',
   status:'standby',
   acceptsUsers:false,
   migrationsApplied:false,
   realBankConnections:false,
   externalFinancialActions:false,
   walletIntegration:false
 }));
 app.get('/ready',async(_req,reply)=>
   reply.code(503).send({ready:false,reason:'production_release_gates_pending'})
 );
 // No other routes — especially no unaudited auth, /api/v1, PJ, Wallet or
 // payment execution. A missing route MUST be a real 404, not an SPA fallback.
 return app;
}
