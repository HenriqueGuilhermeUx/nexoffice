import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const office=readFileSync('apps/web/src/NexPersonalLifeOffice.tsx','utf8');
const web=readFileSync('apps/web/src/NexPersonalAgents.tsx','utf8');
const api=readFileSync('apps/api/src/routes-nex-personal-agents.ts','utf8');
const citizen=readFileSync('apps/web/src/PersonalCitizenAgents.tsx','utf8');

const rooms={
 money:'Nina', investments:'Léo',shopping:'Bia',health:'Luna',education:'Duda',
 documents:'Mel',work:'Zoe',travel:'Kai',vehicle:'Max',family:'Luca',
 marketing:'Gabi',offers:'Noah',public_services:'Theo',debt_review:'Joca',legal_support:'Bella'
};
const agents={
 expenses:'Mila',financial:'Nina',planning:'Liz',investments:'Léo',shopping:'Bia',
 simulations:'Ben',payments:'Ravi',contracts:'Mel',public_services:'Theo',
 debt_review:'Joca',legal_support:'Bella'
};
assert.equal(Object.keys(rooms).length,15);
assert.equal(Object.keys(agents).length,11);
assert.equal(new Set(Object.values(rooms)).size,15,'room names must be distinct');
assert.equal(new Set(Object.values(agents)).size,11,'available agent names must be distinct');

for(const [id,name] of Object.entries(rooms)){
 const match=office.match(new RegExp("\\{id:'"+id+"',title:'[^']+',emoji:'[^']+',agent:'([^']+)',tagline:'([^']+)'"));
 assert.ok(match,'office must show a name and a tagline for '+id);
 assert.equal(match[1],name,id+' has wrong display name');
 assert.ok(match[2].length>=12,id+' needs a useful description below its name');
 assert.ok(match[2].length<=68,id+' description should fit an office card');
}
for(const [id,name] of Object.entries(agents)){
 for(const [source,content] of [['web',web],['API',api]]){
  const found=content.match(new RegExp("\\{id:'"+id+"',name:'([^']+)'"));
  assert.ok(found,source+' missing '+id);
  assert.equal(found[1],name,source+' name mismatch for '+id);
 }
}
assert.match(office,/np-life-room-agent.*room\.agent/);
assert.match(office,/np-life-room-tagline.*room\.tagline/);
assert.match(citizen,/THEO · SERVIÇOS PÚBLICOS/);
assert.match(citizen,/JOCA · DÍVIDAS E NEGOCIAÇÃO/);
assert.match(citizen,/BELLA · ORIENTAÇÃO JURÍDICA INICIAL/);
assert.doesNotMatch(office,/agent:'Cida'|agent:'Recomeço'|agent:'Equipe saúde'|agent:'Tutor pessoal'/);
assert.doesNotMatch(web,/name:'Cida'|name:'Recomeço'|name:'Atlas'|name:'Norte'|name:'Clara'/);
console.log('Nex Personal branding: 15 unique person-first rooms with concise taglines and 11 matched agent names OK');
