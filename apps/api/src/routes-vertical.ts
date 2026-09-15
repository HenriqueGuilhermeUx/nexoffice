import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';
import {VERTICAL_PACKS,verticalPack,type VerticalPackId} from './vertical-packs.js';

const PackId=z.enum(['general','legal','health','condo','commerce']);

export async function registerVerticalRoutes(app:FastifyInstance){
  app.get('/v1/vertical-packs',async req=>{
    await workspaceContext(req,'workspace.read');
    return Object.values(VERTICAL_PACKS);
  });

  app.get('/v1/workspace/vertical-pack',async req=>{
    const ctx=await workspaceContext(req,'workspace.read');
    const workspace=(await query<any>(`select vertical,modules,settings from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const pack=verticalPack(workspace?.vertical||'general');
    return {pack,workspace:{vertical:workspace?.vertical||'general',modules:workspace?.modules||[],settings:workspace?.settings||{}}};
  });

  app.put('/v1/workspace/vertical-pack',async req=>{
    const ctx=await workspaceContext(req,'workspace.manage');
    const input=z.object({packId:PackId}).parse(req.body);
    const pack=verticalPack(input.packId);
    const before=(await query<any>(`select * from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const settings={...(before?.settings||{}),verticalPack:{id:pack.id,label:pack.label,terminology:pack.terminology,recommendedIntegrations:pack.recommendedIntegrations,domainOwner:pack.domainOwner,excludedObjects:pack.excludedObjects,privacy:pack.privacy,plannedCapabilities:pack.plannedCapabilities,appliedAt:new Date().toISOString()}};
    const after=await transaction(async client=>{
      const row=(await client.query(`update workspaces set vertical=$2,modules=$3,settings=$4,updated_at=now() where id=$1 returning *`,[ctx.workspaceId,input.packId,pack.modules,JSON.stringify(settings)])).rows[0];
      await client.query(`delete from entitlements where workspace_id=$1 and source='vertical-pack'`,[ctx.workspaceId]);
      const entitlements=[`pack.${pack.id}`,...pack.modules.map((m:string)=>`module.${m}`)];
      for(const capability of entitlements)await client.query(`insert into entitlements(workspace_id,capability,status,source,metadata) values($1,$2,'active','vertical-pack',$3) on conflict(workspace_id,capability,source) do update set status='active',metadata=excluded.metadata,updated_at=now()`,[ctx.workspaceId,capability,JSON.stringify({packId:pack.id})]);
      return row;
    });
    await auditLog(ctx,'workspace.vertical_pack.applied','workspace',ctx.workspaceId,before,after,{packId:input.packId,domainOwner:pack.domainOwner,excludedObjects:pack.excludedObjects});
    return {workspace:after,pack};
  });
}
