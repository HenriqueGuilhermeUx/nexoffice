import type {FastifyRequest} from 'fastify';
import {ApiError,authenticate} from './auth.js';

export async function requirePlatformAdmin(req:FastifyRequest){
  const user=await authenticate(req);
  const allow=String(process.env.NEXOFFICE_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allow.length)throw new ApiError(503,'admin_not_configured','O portal administrativo ainda não foi habilitado neste ambiente.');
  if(!allow.includes(String(user.email||'').toLowerCase()))throw new ApiError(403,'admin_access_denied','Acesso administrativo não autorizado.');
  return user;
}
