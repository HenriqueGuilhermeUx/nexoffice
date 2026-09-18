import type {FastifyRequest} from 'fastify';
import {createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {query} from './db.js';

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
const BILLING_GRACE_DAYS = 7;
const DAY = 86_400_000;

export class ApiError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message = code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  locale: string;
  timezone: string;
};

export type WorkspaceContext = {
  user: AuthUser;
  workspaceId: string;
  workspaceName: string;
  role: 'owner'|'admin'|'member'|'viewer';
  permissions: string[];
};

const ROLE_PERMISSIONS: Record<string,string[]> = {
  owner: ['*'],
  admin: ['*'],
  member: [
    'workspace.read','crm.read','crm.write','agenda.read','agenda.write','finance.read','finance.write',
    'command.read','command.decide','documents.read','documents.write','usage.read','integrations.read'
  ],
  viewer: ['workspace.read','crm.read','agenda.read','finance.read','command.read','documents.read','usage.read','integrations.read']
};

export function hasPermission(role: string, extra: string[], permission: string): boolean {
  const allowed = new Set([...(ROLE_PERMISSIONS[role] || []), ...(extra || [])]);
  if (allowed.has('*') || allowed.has(permission)) return true;
  const [scope] = permission.split('.');
  return allowed.has(`${scope}.*`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [kind,salt,storedHex] = String(encoded || '').split('$');
  if (kind !== 'scrypt' || !salt || !storedHex) return false;
  const stored = Buffer.from(storedHex, 'hex');
  const derived = await scrypt(password, salt, stored.length) as Buffer;
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueSession(userId: string): Promise<{token:string;expiresAt:string}> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY).toISOString();
  await query(`insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,$3)`, [userId,tokenHash,expiresAt]);
  return {token,expiresAt};
}

function bearer(req: FastifyRequest): string {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) throw new ApiError(401,'unauthorized','Sessão necessária.');
  const token = auth.slice(7).trim();
  if (!token) throw new ApiError(401,'unauthorized','Sessão necessária.');
  return token;
}

function billingMetadata(value:unknown):Record<string,any>{
  if(!value)return {};
  if(typeof value==='object')return value as Record<string,any>;
  try{return JSON.parse(String(value)) as Record<string,any>}catch{return {}}
}

export async function authenticate(req: FastifyRequest): Promise<AuthUser> {
  const tokenHash = hashOpaqueToken(bearer(req));
  const rows = await query<any>(
    `select u.id,u.name,u.email,u.status,u.locale,u.timezone,s.id session_id
       from auth_sessions s join users u on u.id=s.user_id
      where s.token_hash=$1 and s.expires_at>now() and u.status='active' limit 1`, [tokenHash]
  );
  if (!rows.length) throw new ApiError(401,'invalid_session','Sessão inválida ou expirada.');
  await query(`update auth_sessions set last_used_at=now() where id=$1`, [rows[0].session_id]).catch(()=>null);
  return {id:rows[0].id,name:rows[0].name,email:rows[0].email,status:rows[0].status,locale:rows[0].locale,timezone:rows[0].timezone};
}

export async function revokeSession(req: FastifyRequest): Promise<void> {
  const tokenHash = hashOpaqueToken(bearer(req));
  await query(`delete from auth_sessions where token_hash=$1`, [tokenHash]);
}

export async function workspaceContext(req: FastifyRequest, permission?: string): Promise<WorkspaceContext> {
  const user = await authenticate(req);
  const raw = req.headers['x-workspace-id'];
  if (Array.isArray(raw)) throw new ApiError(400,'invalid_workspace','Workspace inválido.');
  const requested = raw ? String(raw) : null;
  const rows = await query<any>(
    requested
      ? `select m.workspace_id,m.role,m.permissions,w.name,w.status workspace_status,b.status billing_status,b.trial_ends_at,b.current_period_ends_at,b.metadata billing_metadata
           from workspace_members m join workspaces w on w.id=m.workspace_id
           left join workspace_billing b on b.workspace_id=w.id
          where m.user_id=$1 and m.workspace_id=$2 and m.active=true limit 1`
      : `select m.workspace_id,m.role,m.permissions,w.name,w.status workspace_status,b.status billing_status,b.trial_ends_at,b.current_period_ends_at,b.metadata billing_metadata
           from workspace_members m join workspaces w on w.id=m.workspace_id
           left join workspace_billing b on b.workspace_id=w.id
          where m.user_id=$1 and m.active=true
          order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end,w.created_at limit 1`,
    requested ? [user.id,requested] : [user.id]
  );
  if (!rows.length) throw new ApiError(403,'workspace_access_denied','Você não tem acesso a esse workspace.');
  const billingStatus=String(rows[0].billing_status||'active');
  const now=Date.now();
  const trialEnd=rows[0].trial_ends_at?new Date(rows[0].trial_ends_at).getTime():0;
  const paidThrough=rows[0].current_period_ends_at?new Date(rows[0].current_period_ends_at).getTime():0;
  const metadata=billingMetadata(rows[0].billing_metadata);
  const pastDueAt=metadata.pastDueAt?new Date(String(metadata.pastDueAt)).getTime():0;
  const pastDueGrace=billingStatus==='past_due'&&pastDueAt>0&&pastDueAt+BILLING_GRACE_DAYS*DAY>now;
  const cancelledButPaidThrough=billingStatus==='cancelled'&&paidThrough>now;
  const trialLike=billingStatus==='trialing'||billingStatus==='pending_activation';
  if(trialLike&&trialEnd>0&&trialEnd<=now)throw new ApiError(402,'trial_expired','Seu período gratuito de 7 dias terminou. Assine o NexOffice Pro para continuar.');
  if(billingStatus==='expired'||(billingStatus==='past_due'&&!pastDueGrace)||(billingStatus==='cancelled'&&!cancelledButPaidThrough))throw new ApiError(402,'subscription_required','Sua assinatura do NexOffice precisa ser regularizada para continuar.');
  if(String(rows[0].workspace_status)==='suspended')throw new ApiError(402,'workspace_suspended','Este workspace está suspenso. Regularize a assinatura para continuar.');
  const ctx: WorkspaceContext = {
    user,
    workspaceId: rows[0].workspace_id,
    workspaceName: rows[0].name,
    role: rows[0].role,
    permissions: rows[0].permissions || []
  };
  if (permission && !hasPermission(ctx.role,ctx.permissions,permission)) throw new ApiError(403,'permission_denied','Você não tem permissão para esta ação.');
  return ctx;
}

export function newInviteToken(): {token:string;hash:string} {
  const token = randomBytes(24).toString('base64url');
  return {token,hash:hashOpaqueToken(token)};
}

export function slugify(value: string): string {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
  return base || `empresa-${randomBytes(3).toString('hex')}`;
}