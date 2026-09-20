import type {FastifyInstance} from 'fastify';
import {requirePlatformAdmin} from './platform-admin.js';
import {getBenchmarkAdminOverview,rebuildAnonymousBenchmarks} from './business-benchmark.js';

export async function registerAdminBenchmarkRoutes(app:FastifyInstance){
  app.get('/v1/admin/intelligence/benchmarks',async req=>{await requirePlatformAdmin(req);return getBenchmarkAdminOverview()});
  app.post('/v1/admin/intelligence/benchmarks/refresh',async req=>{await requirePlatformAdmin(req);const rebuild=await rebuildAnonymousBenchmarks();const overview=await getBenchmarkAdminOverview();return{rebuild,overview}});
}
