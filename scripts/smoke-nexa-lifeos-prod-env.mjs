import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectLifeosProdEnv} from './check-nexa-lifeos-prod-env.mjs';

const base={
 NEXA_LIFEOS_ENV:'production',
 NODE_ENV:'production',
 NEXA_LIFEOS_PROD_RELEASE_APPROVED:'true',
 NEXA_LIFEOS_PUBLIC_SIGNUP_ENABLED:'false',
 NEXOFFICE_EXTERNAL_ACTIONS:'false',
 NEXOFFICE_INTELLIGENCE_DAILY_ENGINE:'false',
 AUTO_MIGRATE:'false',
 NEXOFFICE_DATABASE_SCOPE:'nexa-lifeos-prod',
 NEXA_LIFEOS_DB_TLS_STRICT:'true',
 NEXA_LIFEOS_DISABLE_DEMO_SEED:'true',
 ALLOWED_ORIGINS:'https://trynexa.com.br',
 NEXA_LIFEOS_API_ORIGIN:'https://api-life.trynexa.com.br',
 VITE_NEXA_LIFEOS_API_URL:'https://api-life.trynexa.com.br',
 VITE_NEXA_LIFEOS_PUBLIC:'true',
 VITE_NEXA_LIFEOS_BUILD_PROBE:'false',
 NEXA_LIFEOS_ALLOW_WALLET_TOKEN_BRIDGE:'false',
 NEXA_LIFEOS_ALLOW_PRIVY_CREATE_WALLET:'false',
 DATABASE_URL:'postgresql://nexa_lifeos_owner:dummy-ci-only@ep-prod-x123.us-east-2.aws.neon.tech/nexa_lifeos_prod?sslmode=verify-full&channel_binding=require',
 NEXA_LIFEOS_DB_HOST:'ep-prod-x123.us-east-2.aws.neon.tech',
 NEXA_LIFEOS_NEON_PROJECT_ID:'blue-sun-12345678',
 SESSION_TTL_DAYS:'7'
};

test('isolated PF prod env contract accepts only explicit reviewed-looking host and flags',()=>{
 const r=inspectLifeosProdEnv(base);
 assert.equal(r.publicSignup,false);
 assert.equal(r.walletTokenBridge,false);
 assert.equal(r.databaseName,'nexa_lifeos_prod');
});

const denials=[
 ['preview flag',{NEX_PERSONAL_PREVIEW:'true'}],
 ['preview invite token',{NEX_PERSONAL_PREVIEW_INVITE_SHA256:'f'.repeat(64)}],
 ['preview allowed testers',{NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS:'dummy@example.test'}],
 ['preview Neon project',{NEXA_LIFEOS_NEON_PROJECT_ID:'orange-fog-28021931'}],
 ['preview database',{DATABASE_URL:base.DATABASE_URL.replace('/nexa_lifeos_prod','/nex_personal_preview')}],
 ['Wallet db',{DATABASE_URL:'postgresql://wallet:ci@ep-prod-x123.us-east-2.aws.neon.tech/nexa_lifeos_prod?sslmode=verify-full'}],
 ['hostname drift',{NEXA_LIFEOS_DB_HOST:'another.neon.tech'}],
 ['db tls downgrade',{DATABASE_URL:base.DATABASE_URL.replace('sslmode=verify-full','sslmode=require')}],
 ['libpq alternate host',{DATABASE_URL:base.DATABASE_URL+'&host=localhost'}],
 ['preview host',{DATABASE_URL:base.DATABASE_URL.replace('ep-prod-x123','ep-preview-x123'),NEXA_LIFEOS_DB_HOST:'ep-preview-x123.us-east-2.aws.neon.tech'}],
 ['Wallet backend origin',{NEXA_LIFEOS_API_ORIGIN:'https://nexa-backend-p2u0.onrender.com'}],
 ['wrong frontend endpoint',{VITE_NEXA_LIFEOS_API_URL:'https://nex-personal-preview-api.onrender.com'}],
 ['bad CORS wildcard',{ALLOWED_ORIGINS:'*'}],
 ['two CORS origins',{ALLOWED_ORIGINS:'https://trynexa.com.br,https://wallet.trynexa.com.br'}],
 ['Wallet token bridge',{NEXA_LIFEOS_ALLOW_WALLET_TOKEN_BRIDGE:'true'}],
 ['Privy wallet duplication',{NEXA_LIFEOS_ALLOW_PRIVY_CREATE_WALLET:'true'}],
 ['public signup prematurely',{NEXA_LIFEOS_PUBLIC_SIGNUP_ENABLED:'true'}],
 ['financial actions',{NEXOFFICE_EXTERNAL_ACTIONS:'true'}],
 ['automation jobs',{NEXOFFICE_INTELLIGENCE_DAILY_ENGINE:'true'}],
 ['auto migrations',{AUTO_MIGRATE:'true'}],
 ['no approval',{NEXA_LIFEOS_PROD_RELEASE_APPROVED:'false'}],
 ['login 30 days',{SESSION_TTL_DAYS:'30'}],
 ['session missing',{SESSION_TTL_DAYS:''}],
 ['DB SSL override',{PGSSLMODE:'disable'}],
 ['insecure env',{NODE_ENV:'development'}],
 ['wrong scope',{NEXOFFICE_DATABASE_SCOPE:'nex-personal-preview'}],
];
for(const [name,changes] of denials){
 test('reject '+name,()=>assert.throws(()=>inspectLifeosProdEnv({...base,...changes}),Error));
}
