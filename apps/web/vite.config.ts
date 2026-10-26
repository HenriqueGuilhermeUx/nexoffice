import {defineConfig} from 'vite';

// Opt-in frontend layout for Nexa Life OS on the main Nexa domain.
// Default remains exactly the NexOffices/PJ layout; no Wallet/PJ rewrite.
const lifeosPathMode=process.env.NEXA_LIFEOS_PATH_BUILD;
if(lifeosPathMode && !['verify','release'].includes(lifeosPathMode))
  throw new Error('NEXA_LIFEOS_PATH_BUILD must be verify or release');
if(lifeosPathMode && process.env.VITE_NEXA_LIFEOS_PUBLIC!=='true')
  throw new Error('Public-path mode requires explicitly scoped Nexa Life OS build');
if(lifeosPathMode==='release'){
  if(process.env.NEXA_LIFEOS_PROD_RELEASE_APPROVED!=='true')
    throw new Error('Production Life OS path build is not approved');
  const api=process.env.VITE_NEXA_LIFEOS_API_URL||'';
  let url:URL;
  try{url=new URL(api);}
  catch{throw new Error('Dedicated production PF API origin required');}
  const denied=['trynexa.com.br','www.trynexa.com.br','wallet.trynexa.com.br',
    'nex-personal-preview-api.onrender.com','nexa-backend-p2u0.onrender.com','localhost'];
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash
     ||url.username||url.password||denied.includes(url.hostname)
     ||['.invalid','.example','.test'].some(suffix=>url.hostname.endsWith(suffix)))
    throw new Error('Never publish Life OS with Wallet, staging or untrusted API origins');
}
export default defineConfig({
  base:lifeosPathMode?'/meu-espaco/app/':'/',
  build:{
    rollupOptions:{
      output:{
        manualChunks(id){
          if(!id.includes('node_modules')) return;
          if(id.includes('pptxgenjs-plus')) return 'pptxgen';
          if(id.includes('react-dom')||id.includes('/react/')||id.includes('/scheduler/')) return 'react-vendor';
          return 'vendor';
        }
      }
    }
  }
});
