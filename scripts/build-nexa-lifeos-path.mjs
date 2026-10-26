/**
 * Build a path-scoped Nexa Life OS frontend without touching PJ production.
 *
 * Opt-in modes:
 *   NEXA_LIFEOS_PATH_BUILD=verify node scripts/build-nexa-lifeos-path.mjs
 *     Inert, no login or backend; verifies the final /meu-espaco/app/ path.
 *   NEXA_LIFEOS_PATH_BUILD=release NEXA_LIFEOS_PROD_RELEASE_APPROVED=true
 *     NEXA_LIFEOS_API_ORIGIN=https://<dedicated PF production service>
 *     node scripts/build-nexa-lifeos-path.mjs
 *     Only use when production PF backend, data, identity, consent and rollback
 *     have separately passed release gates.
 *
 * Never invoke this from NexOffices PJ or Nexa Wallet production builds.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const mode=process.env.NEXA_LIFEOS_PATH_BUILD;
const BASE='/meu-espaco/app/';
const root=fileURLToPath(new URL('../',import.meta.url));

function verifiedApiOrigin(value){
  let parsed;
  try{parsed=new URL(value||'');}
  catch{throw new Error('Dedicated Life OS production API origin is required');}
  const host=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:'||!host||parsed.username||parsed.password
    ||parsed.pathname!=='/'||parsed.search||parsed.hash
    ||host==='localhost'||host.endsWith('.invalid')
    ||host.endsWith('.test')||host.endsWith('.example')
    ||host==='trynexa.com.br'||host==='www.trynexa.com.br'
    ||host==='wallet.trynexa.com.br'
    ||host==='nex-personal-preview-api.onrender.com'
    ||host==='nexa-backend-p2u0.onrender.com')
    throw new Error('A dedicated HTTPS PF production API origin is required; never use Wallet or preview');
  return parsed.origin;
}

if(mode){
  if(mode!=='verify'&&mode!=='release')throw new Error('Invalid Life OS path build mode');
  if(mode==='release'&&process.env.NEXA_LIFEOS_PROD_RELEASE_APPROVED!=='true')
    throw new Error('Life OS production release must pass independent gate before frontend publication');
  const api=mode==='verify'?'https://nexa-lifeos-build.invalid':
    verifiedApiOrigin(process.env.NEXA_LIFEOS_API_ORIGIN);
  const command=process.platform==='win32'?'npm.cmd':'npm';
  const result=spawnSync(command,['run','build','-w','@nexoffice/web'],{
    cwd:root,stdio:'inherit',env:{
      ...process.env,
      VITE_PERSONAL_STAGING:'false',
      VITE_PERSONAL_SINGLE_ORIGIN:'false',
      VITE_API_URL:'',
      VITE_NEXA_LIFEOS_PUBLIC:'true',
      VITE_NEXA_LIFEOS_BUILD_PROBE:mode==='verify'?'true':'false',
      VITE_NEXA_LIFEOS_API_URL:api
    }
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Nexa Life OS path build failed: '+String(result.status));
  const htmlPath=resolve(root,'apps/web/dist/index.html');
  if(!existsSync(htmlPath))throw new Error('No Life OS dist index.html');
  let html=readFileSync(htmlPath,'utf8');
  const replacements=[
    [/<meta name="theme-color" content="[^"]*"\s*\/>/,'<meta name="theme-color" content="#06111F" />'],
    [/<meta name="description" content="[^"]*"\s*\/>/,'<meta name="description" content="Nexa: Maya, finanças, planejamento, investimentos e seu espaço pessoal em um só lugar." />'],
    [/<link rel="canonical" href="[^"]*"\s*\/>/,'<link rel="canonical" href="https://trynexa.com.br/meu-espaco/app/" />'],
    [/<meta property="og:site_name" content="[^"]*"\s*\/>/,'<meta property="og:site_name" content="Nexa" />'],
    [/<meta property="og:url" content="[^"]*"\s*\/>/,'<meta property="og:url" content="https://trynexa.com.br/meu-espaco/app/" />'],
    [/<meta property="og:title" content="[^"]*"\s*\/>/,'<meta property="og:title" content="Nexa — Seu espaço, suas escolhas" />'],
    [/<meta property="og:description" content="[^"]*"\s*\/>/,'<meta property="og:description" content="Meu Espaço Nexa: uma equipe de especialistas e organização financeira." />'],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/,'<meta name="twitter:title" content="Nexa — Seu espaço, suas escolhas" />'],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/,'<meta name="twitter:description" content="Maya, finanças e organização na Nexa." />'],
    [/<link rel="icon" type="image\/svg\+xml" href="\/meu-espaco\/app\/favicon\.svg"\s*\/>/,
     '<link rel="icon" type="image/svg+xml" href="'+BASE+'nexa-logo.svg" />'],
    [/<link rel="shortcut icon" href="\/meu-espaco\/app\/favicon\.svg"\s*\/>/,
     '<link rel="shortcut icon" href="'+BASE+'nexa-logo.svg" />'],
    [/<title>[^<]*<\/title>/,'<title>Nexa — Seu espaço, suas escolhas</title>']
  ];
  for(const [matcher,replacement] of replacements){
    if(!matcher.test(html))throw new Error('Expected HTML build marker not found: '+matcher);
    html=html.replace(matcher,replacement);
  }
  // Both verify and first real releases are unindexed until go-live SEO review.
  html=html.replace('</head>','  <meta name="robots" content="noindex, nofollow, noarchive" /></head>');
  writeFileSync(htmlPath,html,'utf8');
  if(!html.includes('src="'+BASE+'assets/'))throw new Error('Vite assets are not scoped under '+BASE);
  if(!existsSync(resolve(root,'apps/web/dist/nexa-logo.svg')))throw new Error('Official Nexa logo missing');
  console.log('NEXA_LIFEOS_PATH_BUILD_OK mode='+mode+' base='+BASE+' apiMode='+(mode==='verify'?'inert':'dedicated'));
}else{
  console.log('Nexa public-path build disabled by default: PJ/Wallet builds remain untouched.');
}
