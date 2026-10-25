import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Only the isolated Nex Personal Render preview builds the same-origin frontend.
// All normal NexOffices/PJ builds return without touching the web assets.
if(process.env.NEX_PERSONAL_PREVIEW==='true'){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const command=process.platform==='win32'?'npm.cmd':'npm';
  const result=spawnSync(command,['run','build','-w','@nexoffice/web'],{
    cwd:root,
    stdio:'inherit',
    env:{
      ...process.env,
      VITE_PERSONAL_STAGING:'true',
      VITE_PERSONAL_SINGLE_ORIGIN:'true',
      VITE_API_URL:''
    }
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Nex Personal preview web build failed: '+String(result.status));
  // Rewrite only the isolated preview dist HTML. The shared NexOffice PJ
  // index.html in source and its production deploy remain unchanged.
  const htmlPath=resolve(root,'apps/web/dist/index.html');
  let html=readFileSync(htmlPath,'utf8');
  const replacements=[
    [/<meta name="description" content="[^"]*"\s*\/>/,
      '<meta name="description" content="Nexa: sua vida, um só lugar. Maya, finanças, investimentos, cripto e serviços organizados no seu ritmo." />'],
    [/<link rel="canonical" href="[^"]*"\s*\/>/,
      '<link rel="canonical" href="https://trynexa.com.br/" />'],
    [/<meta property="og:site_name" content="[^"]*"\s*\/>/,
      '<meta property="og:site_name" content="Nexa" />'],
    [/<meta property="og:url" content="[^"]*"\s*\/>/,
      '<meta property="og:url" content="https://trynexa.com.br/" />'],
    [/<meta property="og:title" content="[^"]*"\s*\/>/,
      '<meta property="og:title" content="Nexa — Sua vida, um só lugar" />'],
    [/<meta property="og:description" content="[^"]*"\s*\/>/,
      '<meta property="og:description" content="Inteligência financeira, F-Insight, Cripto & Wallet e assistentes em um só lugar." />'],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/,
      '<meta name="twitter:title" content="Nexa — Sua vida, um só lugar" />'],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/,
      '<meta name="twitter:description" content="Maya, dinheiro, investimentos, cripto e uma experiência Nexa para seu dia a dia." />'],
    [/<title>[^<]*<\/title>/,
      '<title>Nexa — Sua vida, um só lugar</title>']
  ];
  for(const [pattern,replacement] of replacements){
    if(!pattern.test(html))throw new Error('Expected isolated preview branding marker was not found: '+pattern);
    html=html.replace(pattern,replacement);
  }
  // The isolated homologation login is publicly reachable but invitation-only:
  // prevent crawlers from indexing this staging application as the real Nexa.
  if(!html.includes('name="robots"')){
    html=html.replace('</head>',
      '  <meta name="robots" content="noindex, nofollow, noarchive" /></head>');
  }
  // The live site must be published on its own domain before this canonical
  // becomes authoritative; no address migration is performed by this build.
  writeFileSync(htmlPath,html,'utf8');

}
