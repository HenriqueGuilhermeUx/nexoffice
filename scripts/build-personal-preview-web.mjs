import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
}
