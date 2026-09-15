import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {ApiError,hashOpaqueToken,issueSession,newInviteToken,slugify} from './auth.js';
import {query,transaction} from './db.js';
import {verticalPack} from './vertical-packs.js';

const Source=z.enum(['nexjud','sindcopilot','mydatamed','health-wallet','smartbots','modo','docwallet','nextgen','taxagent','connexio','mindcompliance','mindsteps','f-insight','ecotracker','nexa','staff']);
const Vertical=z.enum(['general','legal','health','condo','commerce']);
const MemberRole=z.enum(['owner','admin','member','viewer']);
const AccessInput=z.object({sourceProduct:Source,externalWorkspaceRef:z.string().trim().min(1).max(220),externalUserSubject:z.string().trim().min(1).max(220),email:z.string().email()});
type AccessInputType=z.infer<typeof AccessInput>;

function safeEqual(received:string,expected:string){if(!received||!expected)return false;const a=Buffer.from(received),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
function authorize(req:FastifyRequest){const expected=String(process.env.NEXOFFICE_INTERNAL_KEY||'').trim();if(!expected)throw new ApiError(503,'platform_bridge_not_configured','NEXOFFICE_INTERNAL_KEY não configurada.');const received=String(req.headers['x-nexoffice-key']||'');if(!safeEqual(received,expected))throw new ApiError(401,'unauthorized','Credencial interna inválida.')}

async function resolvePlatformAccess(input:AccessInputType){
  const email=input.email.trim().toLowerCase();
  const origin=(await query<any>(`select o.workspace_id,w.name,w.slug,w.vertical,w.status from workspace_origins o join workspaces w on w.id=o.workspace_id where o.source_product=$1 and o.external_workspace_ref=$2 limit 1`,[input.sourceProduct,input.externalWorkspaceRef]))[0];
  if(!origin)throw new ApiError(404,'workspace_not_provisioned','Workspace NexOffice ainda não provisionado para esta origem.');
  const identity=(await query<any>(`select * from external_identities where workspace_id=$1 and provider=$2 and external_subject=$3 limit 1`,[origin.workspace_id,input.sourceProduct,input.externalUserSubject]))[0];
  let userId=identity?.user_id||null;
  if(!userId){
    const member=(await query<any>(`select u.id from users u join workspace_members m on m.user_id=u.id and m.workspace_id=$1 and m.active=true where lower(u.email)=lower($2) limit 1`,[origin.workspace_id,email]))[0];
    if(!member)throw new ApiError(409,'onboarding_required','O usuário ainda precisa aceitar o acesso ao NexOffice.');
    userId=member.id;
    await query(`insert into external_identities(workspace_id,user_id,provider,external_subject,external_tenant_ref,metadata) values($1,$2,$3,$4,$5,$6) on conflict(provider,external_subject,workspace_id) do update set user_id=excluded.user_id,external_tenant_ref=excluded.external_tenant_ref,metadata=external_identities.metadata||excluded.metadata,updated_at=now()`,[origin.workspace_id,userId,input.sourceProduct,input.externalUserSubject,input.externalWorkspaceRef,JSON.stringify({email})]);
  }
  const membership=(await query<any>(`select role,permissions from workspace_members where workspace_id=$1 and user_id=$2 and active=true limit 1`,[origin.workspace_id,userId]))[0];
  if(!membership)throw new ApiError(403,'workspace_access_revoked','Acesso ao workspace foi revogado.');
  return {origin,userId,membership};
}

export async function registerPlatformRoutes(app:FastifyInstance){
  app.get('/v1/platform/health',async req=>{authorize(req);return {status:'ok',service:'nexoffice-platform',capabilities:['provision','session-exchange','federated-user','browser-handoff','federated-rbac'],externalEffects:false}});

  app.post('/v1/platform/provision',async req=>{
    authorize(req);
    const input=z.object({sourceProduct:Source,externalWorkspaceRef:z.string().trim().min(1).max(220),businessName:z.string().trim().min(2).max(180),vertical:Vertical.default('general'),ownerEmail:z.string().email(),ownerName:z.string().trim().min(2).max(160).optional(),memberRole:MemberRole.default('owner'),externalUserSubject:z.string().trim().min(1).max(220).optional(),entitlements:z.array(z.string().trim().min(1).max(120)).max(50).default([])}).parse(req.body);
    const email=input.ownerEmail.trim().toLowerCase(),pack=verticalPack(input.vertical),permissions=input.memberRole==='owner'||input.memberRole==='admin'?['*']:[];let created=false,inviteToken:string|null=null,federatedUserCreated=false;
    const result=await transaction(async client=>{
      let origin=(await client.query(`select o.*,w.name,w.slug,w.vertical,w.status,w.modules from workspace_origins o join workspaces w on w.id=o.workspace_id where o.source_product=$1 and o.external_workspace_ref=$2 limit 1`,[input.sourceProduct,input.externalWorkspaceRef])).rows[0];
      let workspaceId:string;
      if(origin){workspaceId=origin.workspace_id}else{
        let slug=slugify(input.businessName);if((await client.query(`select 1 from workspaces where slug=$1`,[slug])).rows.length)slug=`${slug}-${Math.random().toString(36).slice(2,7)}`;
        const workspace=(await client.query(`insert into workspaces(name,slug,vertical,status,modules,settings) values($1,$2,$3,'active',$4,$5) returning *`,[input.businessName,slug,input.vertical,pack.modules,JSON.stringify({provisionedBy:input.sourceProduct})])).rows[0];workspaceId=workspace.id;created=true;
        origin=(await client.query(`insert into workspace_origins(workspace_id,source_product,external_workspace_ref,mode,metadata) values($1,$2,$3,'addon',$4) returning *`,[workspaceId,input.sourceProduct,input.externalWorkspaceRef,JSON.stringify({provisionedAt:new Date().toISOString()})])).rows[0];
        await client.query(`insert into finance_accounts(workspace_id,name,kind) values($1,'Conta principal','bank') on conflict do nothing`,[workspaceId]);
      }

      for(const capability of ['core.crm','core.agenda','core.erp','core.command-center',`pack.${input.vertical}`,...input.entitlements])await client.query(`insert into entitlements(workspace_id,capability,status,source,metadata) values($1,$2,'active',$3,$4) on conflict(workspace_id,capability,source) do update set status='active',metadata=excluded.metadata,updated_at=now()`,[workspaceId,capability,input.sourceProduct,JSON.stringify({externalWorkspaceRef:input.externalWorkspaceRef})]);

      let user=(await client.query(`select id,name,email,auth_mode from users where lower(email)=lower($1) limit 1`,[email])).rows[0];
      const userExisted=Boolean(user);
      if(!user&&input.externalUserSubject){
        const name=(input.ownerName||email.split('@')[0]||'Usuário').trim();
        user=(await client.query(`insert into users(name,email,password_hash,status,auth_mode) values($1,$2,null,'active','federated') returning id,name,email,auth_mode`,[name,email])).rows[0];
        federatedUserCreated=true;
      }

      if(user){
        await client.query(`insert into workspace_members(workspace_id,user_id,role,permissions) values($1,$2,$3,$4) on conflict(workspace_id,user_id) do update set active=true,role=excluded.role,permissions=excluded.permissions`,[workspaceId,user.id,input.memberRole,permissions]);
        await client.query(`update workspace_invites set status='revoked' where workspace_id=$1 and lower(email)=lower($2) and status='pending'`,[workspaceId,email]);
      }else{
        await client.query(`update workspace_invites set status='revoked' where workspace_id=$1 and lower(email)=lower($2) and status='pending'`,[workspaceId,email]);
        const invite=newInviteToken();inviteToken=invite.token;
        await client.query(`insert into workspace_invites(workspace_id,email,role,permissions,token_hash) values($1,$2,$3,$4,$5)`,[workspaceId,email,input.memberRole,permissions,invite.hash]);
      }

      if(input.externalUserSubject){
        await client.query(`insert into external_identities(workspace_id,user_id,provider,external_subject,external_tenant_ref,metadata) values($1,$2,$3,$4,$5,$6) on conflict(provider,external_subject,workspace_id) do update set user_id=coalesce(excluded.user_id,external_identities.user_id),external_tenant_ref=excluded.external_tenant_ref,metadata=external_identities.metadata||excluded.metadata,updated_at=now()`,[workspaceId,user?.id||null,input.sourceProduct,input.externalUserSubject,input.externalWorkspaceRef,JSON.stringify({email,memberRole:input.memberRole})]);
      }
      await client.query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,after_state,metadata) values($1::uuid,'service',$2,'platform.workspace.provisioned','workspace',$1::uuid::text,$3,$4)`,[workspaceId,input.sourceProduct,JSON.stringify({created,sourceProduct:input.sourceProduct,externalWorkspaceRef:input.externalWorkspaceRef}),JSON.stringify({userEmail:email,vertical:input.vertical,memberRole:input.memberRole,federatedUserCreated})]);
      const workspace=(await client.query(`select id,name,slug,vertical,status,modules,settings from workspaces where id=$1`,[workspaceId])).rows[0];
      return {workspace,origin,userExists:userExisted||federatedUserCreated,userExisted,federatedUserCreated,memberRole:input.memberRole};
    });
    const web=String(process.env.WEB_APP_URL||'').replace(/\/$/,'');
    return {...result,created,inviteToken,inviteUrl:inviteToken&&web?`${web}/?invite=${encodeURIComponent(inviteToken)}`:null};
  });

  app.post('/v1/platform/session-exchange',async req=>{
    authorize(req);
    const input=AccessInput.parse(req.body);
    const {origin,userId,membership}=await resolvePlatformAccess(input);
    const session=await issueSession(userId);
    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,metadata) values($1,'service',$2,'platform.session.exchanged','user',$3,$4)`,[origin.workspace_id,input.sourceProduct,userId,JSON.stringify({externalWorkspaceRef:input.externalWorkspaceRef})]).catch(()=>null);
    return {token:session.token,expiresAt:session.expiresAt,workspace:{id:origin.workspace_id,name:origin.name,slug:origin.slug,vertical:origin.vertical,status:origin.status,role:membership.role,permissions:membership.permissions}};
  });

  app.post('/v1/platform/handoff',async req=>{
    authorize(req);
    const input=AccessInput.parse(req.body);
    const {origin,userId}=await resolvePlatformAccess(input);
    const code=randomBytes(32).toString('base64url'),codeHash=hashOpaqueToken(code),expiresAt=new Date(Date.now()+120_000).toISOString();
    await query(`update platform_handoffs set consumed_at=now() where workspace_id=$1 and user_id=$2 and source_product=$3 and consumed_at is null`,[origin.workspace_id,userId,input.sourceProduct]);
    await query(`insert into platform_handoffs(code_hash,workspace_id,user_id,source_product,external_workspace_ref,expires_at) values($1,$2,$3,$4,$5,$6)`,[codeHash,origin.workspace_id,userId,input.sourceProduct,input.externalWorkspaceRef,expiresAt]);
    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,metadata) values($1,'service',$2,'platform.handoff.created','user',$3,$4)`,[origin.workspace_id,input.sourceProduct,userId,JSON.stringify({externalWorkspaceRef:input.externalWorkspaceRef,expiresAt})]).catch(()=>null);
    const web=String(process.env.WEB_APP_URL||'').replace(/\/$/,'');
    return {handoffCode:code,expiresAt,url:web?`${web}/#handoff=${encodeURIComponent(code)}`:null};
  });

  app.post('/v1/platform/handoff/consume',async req=>{
    const input=z.object({code:z.string().trim().min(32).max(200)}).parse(req.body),codeHash=hashOpaqueToken(input.code);
    const handoff=(await query<any>(`update platform_handoffs set consumed_at=now() where code_hash=$1 and consumed_at is null and expires_at>now() returning workspace_id,user_id,source_product,external_workspace_ref`,[codeHash]))[0];
    if(!handoff)throw new ApiError(401,'invalid_handoff','Acesso temporário inválido, expirado ou já utilizado.');
    const access=(await query<any>(`select u.id user_id,u.name,u.email,w.id workspace_id,w.name workspace_name,w.slug,w.vertical,w.status,m.role,m.permissions from users u join workspace_members m on m.user_id=u.id and m.workspace_id=$2 and m.active=true join workspaces w on w.id=m.workspace_id where u.id=$1 and u.status='active' limit 1`,[handoff.user_id,handoff.workspace_id]))[0];
    if(!access)throw new ApiError(403,'workspace_access_revoked','Acesso ao workspace foi revogado.');
    const session=await issueSession(access.user_id);
    await query(`insert into audit_log(workspace_id,actor_type,actor_ref,action,subject_type,subject_id,metadata) values($1,'service',$2,'platform.handoff.consumed','user',$3,$4)`,[access.workspace_id,handoff.source_product,access.user_id,JSON.stringify({externalWorkspaceRef:handoff.external_workspace_ref})]).catch(()=>null);
    return {token:session.token,expiresAt:session.expiresAt,user:{id:access.user_id,name:access.name,email:access.email},workspace:{id:access.workspace_id,name:access.workspace_name,slug:access.slug,vertical:access.vertical,status:access.status,role:access.role,permissions:access.permissions}};
  });
}
