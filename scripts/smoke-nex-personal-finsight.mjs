import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyFInsightQuote} from '../apps/api/src/personal-finsight-quote.ts';
const api=readFileSync('apps/api/src/routes-nex-personal-finsight.ts','utf8');
const server=readFileSync('apps/api/src/server-personal.ts','utf8');
const main=readFileSync('apps/web/src/NexPersonal.tsx','utf8');
const office=readFileSync('apps/web/src/NexPersonalLifeOffice.tsx','utf8');
const ui=readFileSync('apps/web/src/PersonalFInsight.tsx','utf8');

assert.match(server,/registerNexPersonalFInsightRoutes\(app\)/);
assert.match(main,/\['market','Investimentos & Mercados'\]/);
assert.match(main,/section==='market'&&<PersonalFInsight key=\{token\}/);
assert.match(office,/id:'investments'.*route:'market'/);
assert.match(office,/type Route=.*'market'/);
assert.match(api,/await requirePersonal\(req\)/);
assert.match(api,/select user_id from nex_personal\.profiles where user_id=\$1/);
assert.match(api,/FINSIGHT_PERSONAL_INTERNAL_URL/);
assert.match(api,/FINSIGHT_PERSONAL_INTERNAL_KEY/);
assert.match(api,/x-finsight-internal-key/);
assert.match(api,/AbortSignal\.timeout\(8_000\)/);
assert.match(api,/url\.protocol!=='https:'/);
assert.match(api,/const symbolSchema=.*regex/);
assert.match(api,/history=false&news=false&macro=false&sentiment=false/);
assert.match(api,/readOnly:true,externalEffect:false/);
assert.match(api,/dataSharing:false,accountLinking:false,portfolioImported:false/);
assert.match(api,/row\.source!=='Banco Central do Brasil - SGS'/);
assert.match(api,/verifyFInsightQuote\(payload\.quote,symbol\)/);
assert.match(api,/redirect:'error'/);
assert.match(api,/finsight_unexpected_content/);
assert.match(api,/Number\.isFinite\(Date\.parse\(q\.timestamp\)\)/);
assert.ok(!api.includes('workspaceContext('),'PF must never reuse PJ workspace credentials');
assert.ok(!api.includes('FINSIGHT_SERVICE_KEY'),'PF must not reuse PJ bridge credentials');
assert.ok(!api.includes('SELECT *')&&!api.includes('select *'),'No personal data export to research provider');
assert.equal((api.match(/app\.get\('/g)||[]).length,3,'Only three read-only PF F-Insight routes');
assert.ok(!api.includes("app.post(")&&!api.includes("app.put(")&&!api.includes("app.delete("));
assert.match(ui,/status\?\.configured!==true/);
assert.match(ui,/Sem ordens, recomendações personalizadas ou conexão automática/);
assert.match(ui,/target="_blank" rel="noopener noreferrer"/);
assert.match(ui,/Nenhum dado do Nex Personal ou credencial de acesso é enviado/);
assert.ok(!ui.includes('FINSIGHT_PERSONAL_INTERNAL_KEY'),'Provider secrets never reach browser');
assert.ok(!ui.includes('localStorage.'),'No F-Insight identity stored in browser');


const now=Date.parse('2026-10-24T14:00:00.000Z');
const good={provider:'finnhub',symbol:'AAPL',price:150.25,timestamp:'2026-10-23T18:00:00.000Z'};
const ok=verifyFInsightQuote(good,'AAPL',now);
assert.deepEqual(ok,{value:150.25,source:'finnhub',observedAt:good.timestamp,currency:'unspecified'});
for(const bad of [
 undefined,null,[],{},
 {...good,provider:'mock'},
 {...good,provider:'yahoo'},
 {...good,symbol:'MSFT'},
 {...good,price:0},
 {...good,price:-1},
 {...good,price:'150.25'},
 {...good,price:NaN},
 {...good,price:Infinity},
 {...good,timestamp:null},
 {...good,timestamp:'not-a-time'},
 {...good,timestamp:'2026-10-16T13:59:59.000Z'},
 {...good,timestamp:'2026-10-24T14:06:00.000Z'}
]){
 assert.equal(verifyFInsightQuote(bad,'AAPL',now),null,'Invalid quote must fail closed: '+JSON.stringify(bad));
}
assert.ok(verifyFInsightQuote({...good,timestamp:'2026-10-17T14:00:00.000Z'},'AAPL',now),
 'Seven-day history handles weekends and holidays');
assert.equal(verifyFInsightQuote({...good,timestamp:'2026-10-17T13:59:59.000Z'},'AAPL',now),null,
 'Older than seven days must not be presented as current');

console.log('Nex Personal F-Insight: private owner, read-only, disabled-default, no fake prices, no PF/PJ sharing OK');
