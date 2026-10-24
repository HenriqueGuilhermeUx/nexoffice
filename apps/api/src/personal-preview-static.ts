import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

// Only precompiled Vite assets are served. No source code, .env files, or PJ backend routes.
const root=resolve('apps/web/dist');
const assetsDir=resolve(root,'assets');
const mime:Record<string,string>={
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.ico':'image/x-icon',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
  '.ttf':'font/ttf'
};

export async function registerPersonalPreviewStatic(app:FastifyInstance){
  app.get('/',async(_req,reply)=>{
    const html=await readFile(resolve(root,'index.html'));
    return reply.type('text/html; charset=utf-8').header('cache-control','no-store').send(html);
  });
  app.get('/assets/*',async(req,reply)=>{
    const raw=String((req.params as {'*':string})['*']||'');
    if(!/^[A-Za-z0-9_.\-\/]+$/.test(raw)||raw.split('/').some(part=>part==='.'||part==='..'))
      return reply.code(404).send({error:'not_found'});
    const file=resolve(assetsDir,raw);
    if(!file.startsWith(assetsDir+sep))return reply.code(404).send({error:'not_found'});
    const contentType=mime[extname(file).toLowerCase()];
    if(!contentType)return reply.code(404).send({error:'not_found'});
    try{
      const body=await readFile(file);
      return reply.type(contentType).header('cache-control','public, max-age=31536000, immutable').send(body);
    }catch(err){
      if((err as NodeJS.ErrnoException).code==='ENOENT')return reply.code(404).send({error:'not_found'});
      throw err;
    }
  });
  app.get('/favicon.ico',async(_req,reply)=>{
    try{return reply.type('image/x-icon').send(await readFile(resolve(root,'favicon.ico')));}
    catch{return reply.code(404).send({error:'not_found'});}
  });
}
