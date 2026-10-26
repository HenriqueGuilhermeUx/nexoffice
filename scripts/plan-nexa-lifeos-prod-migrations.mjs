/**
 * Read-only schema migration inventory for a BRAND NEW PF production database.
 * NEVER executes SQL or opens DATABASE_URL. Running the preview's AUTO_MIGRATE
 * on a production database is explicitly forbidden.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const migrations=[
 'infra/personal-preview/001_identity.sql',
 'infra/postgres/046_nex_personal_foundation.sql',
 'infra/postgres/047_nex_personal_planning.sql',
 'infra/postgres/048_nex_personal_life_os.sql',
 'infra/postgres/049_nex_personal_transaction_enrichment.sql'
];
export function migrationInventory(root=process.cwd()){
 return migrations.map(file=>{
  const contents=readFileSync(resolve(root,file));
  const text=contents.toString('utf8');
  if(!text.trim()||/drop\s+(schema|database)\b/i.test(text))
   throw new Error('Unexpected or destructive SQL in '+file);
  return {file,bytes:contents.length,sha256:createHash('sha256').update(contents).digest('hex')};
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const manifest=migrationInventory();
 console.log(JSON.stringify({mode:'read_only_schema_review',migrationCount:manifest.length,migrations:manifest},null,2));
 console.log('NOT APPLIED: production identity+data migration review, backup plan and isolated Neon project provision remain mandatory.');
}
