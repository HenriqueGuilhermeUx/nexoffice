import {defineConfig} from 'vite';

export default defineConfig({
  build:{
    rollupOptions:{
      output:{
        manualChunks(id){
          if(!id.includes('node_modules')) return;
          if(id.includes('pptxgenjs')) return 'pptxgen';
          if(id.includes('react-dom')||id.includes('/react/')||id.includes('/scheduler/')) return 'react-vendor';
          return 'vendor';
        }
      }
    }
  }
});
