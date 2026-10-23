import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError,authenticate,hashPassword,issueSession} from './auth.js';
import {query,transaction} from './db.js';

const registration=z.object({
  name:z.string().trim().min(2).max(160),
  email:z.string().email().max(255),
  password:z.string().min(8).max(256)
}).strict();

async function personalOwner(req:Parameters<typeof authenticate>[0]):Promise<string>{
  const user=await authenticate(req);
  const rows=await query<{user_id:string}>('select user_id from nex_personal.profiles where user_id=$1 limit 1',[user.id]);
  if(!rows.length)throw new ApiError(409,'personal_activation_required','Ative seu perfil Nex Personal antes de continuar.');
  return user.id;
}

export async function registerNexPersonalRoutes(app:FastifyInstance){
  // The existing identity/session mechanism is reused. No business workspace is created.
  app.post('/v1/personal/auth/register',async req=>{
    const input=registration.parse(req.body),email=input.email.toLowerCase();
    if((await query('select id from users where lower(email)=lower($1) limit 1',[email])).length)
      throw new ApiError(409,'email_exists','Este e-mail já está cadastrado. Entre usando sua senha atual.');
    const userId=randomUUID(),passwordHash=await hashPassword(input.password);
    await transaction(async client=>{
      await client.query('insert into users(id,name,email,password_hash) values($1,$2,$3,$4)',[userId,input.name,email,passwordHash]);
      await client.query('insert into nex_personal.profiles(user_id) values($1)',[userId]);
      await client.query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$1,'profile.created','profile')",[userId]);
    });
    const session=await issueSession(userId);
    return {token:session.token,expiresAt:session.expiresAt,user:{id:userId,name:input.name,email},activated:true};
  });

  app.get('/v1/personal/me',async req=>{
    const user=await authenticate(req);
    const profiles=await query('select 1 from nex_personal.profiles where user_id=$1',[user.id]);
    return {user:{id:user.id,name:user.name,email:user.email},activated:profiles.length>0};
  });

  app.post('/v1/personal/activate',async req=>{
    const user=await authenticate(req);
    await transaction(async client=>{
      const inserted=await client.query('insert into nex_personal.profiles(user_id) values($1) on conflict(user_id) do nothing returning user_id',[user.id]);
      if(inserted.rowCount)await client.query("insert into nex_personal.audit_events(owner_user_id,actor_user_id,action,subject_type) values($1,$1,'profile.activated','profile')",[user.id]);
    });
    return {activated:true,externalEffect:false};
  });

  app.get('/v1/personal/providers',async req=>{
    await personalOwner(req);
    return {
      openFinance:{provider:'belvo',status:'integration_pending',connectEnabled:false},
      payments:{provider:'efi',status:'integration_pending',initiationEnabled:false},
      externalEffect:false
    };
  });

  app.get('/v1/personal/accounts',async req=>{
    const owner=await personalOwner(req);
    const rows=await query<any>(
      "select id, institution_name, name, account_type, currency, current_minor::text current_minor, available_minor::text available_minor, balance_as_of, last_synced_at, status, (balance_as_of >= now()-interval '48 hours' and status='active') fresh from nex_personal.accounts where owner_user_id=$1 order by institution_name,name",
      [owner]
    );
    return {accounts:rows,source:'connected_institutions',custodial:false};
  });

  app.get('/v1/personal/transactions',async req=>{
    const owner=await personalOwner(req);
    const rows=await query<any>(
      'select t.id,t.account_id,t.description,t.amount_minor::text amount_minor,t.currency,t.category,t.booked_at,a.institution_name from nex_personal.transactions t join nex_personal.accounts a on a.id=t.account_id and a.owner_user_id=t.owner_user_id where t.owner_user_id=$1 order by t.booked_at desc,t.id desc limit 50',
      [owner]
    );
    return {transactions:rows,readOnly:true};
  });

  app.get('/v1/personal/overview',async req=>{
    const owner=await personalOwner(req);
    const metrics=await query<any>(
      "select count(*)::int account_count, count(*) filter(where status='active' and currency='BRL' and balance_as_of>=now()-interval '48 hours' and available_minor is not null)::int fresh_brl_count, sum(available_minor) filter(where status='active' and currency='BRL' and balance_as_of>=now()-interval '48 hours' and available_minor is not null)::text available_minor, max(balance_as_of) last_balance_at from nex_personal.accounts where owner_user_id=$1",
      [owner]
    );
    const row=metrics[0],complete=row.account_count>0 && row.account_count===row.fresh_brl_count;
    const expenses=await query<any>(
      "select coalesce(sum(-amount_minor),0)::text spent_minor from nex_personal.transactions where owner_user_id=$1 and currency='BRL' and amount_minor<0 and booked_at>=date_trunc('month',now())",
      [owner]
    );
    return {
      currency:'BRL',
      connectedAccounts:row.account_count,
      freshAccounts:row.fresh_brl_count,
      availableMinor:complete?row.available_minor:null,
      spentThisMonthMinor:row.account_count>0?expenses[0].spent_minor:null,
      lastBalanceAt:row.last_balance_at,
      incomplete:!complete,
      custodial:false,
      financialActionsEnabled:false,
      maya:{status:complete?'data_ready':'awaiting_verified_data',message:complete?'Dados financeiros disponíveis para análise.':'Conecte uma instituição para que a Maya analise números reais.'}
    };
  });

  app.get('/v1/personal/consents',async req=>{
    const owner=await personalOwner(req);
    const rows=await query<any>(
      'select id,purpose,status,provider,partner_ref,data_scopes,granted_at,expires_at,revoked_at,created_at from nex_personal.consents where owner_user_id=$1 order by created_at desc',
      [owner]
    );
    return {consents:rows};
  });
}
