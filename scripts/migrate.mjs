import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL required');
const client=new pg.Client({connectionString:url,ssl:String(process.env.DATABASE_SSL||'false')==='true'?{rejectUnauthorized:false}:undefined});
await client.connect();
try{
  await client.query(`create table if not exists nexoffice_migrations(name text primary key,applied_at timestamptz not null default now())`);
  const dir=path.resolve('infra/postgres');
  const files=(await fs.readdir(dir)).filter(x=>x.endsWith('.sql')&&x!=='seed-demo.sql').sort((a,b)=>{
    if(a==='schema.sql')return -1;if(b==='schema.sql')return 1;return a.localeCompare(b);
  });
  for(const file of files){
    const exists=await client.query(`select 1 from nexoffice_migrations where name=$1`,[file]);
    if(exists.rowCount){console.log(`skip ${file}`);continue}
    const sql=await fs.readFile(path.join(dir,file),'utf8');
    console.log(`apply ${file}`);
    await client.query('begin');
    try{await client.query(sql);await client.query(`insert into nexoffice_migrations(name) values($1)`,[file]);await client.query('commit')}
    catch(error){await client.query('rollback');throw error}
  }
  console.log('NexOffice migrations OK');
}finally{await client.end()}
