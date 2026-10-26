import {defineConfig} from 'vite';

// Opt-in frontend layout for Nexa Life OS on the main Nexa domain.
// Default remains exactly the NexOffices/PJ layout; no Wallet/PJ rewrite.
const lifeosPathMode=process.env.NEXA_LIFEOS_PATH_BUILD;
if(lifeosPathMode && !['verify','release'].includes(lifeosPathMode))
  throw new Error('NEXA_LIFEOS_PATH_BUILD must be verify or release');
if(lifeosPathMode && process.env.VITE_NEXA_LIFEOS_PUBLIC!=='true')
  throw new Error('Public-path mode requires explicitly scoped Nexa Life OS build');
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
