import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const must=(value,label)=>{if(!value)throw new Error(`Network structured outcomes contract failed: ${label}`)};
const has=(text,value,label)=>must(text.includes(value),label||`missing ${value}`);
const lacks=(text,value,label)=>must(!text.includes(value),label||`unexpected ${value}`);

const routes=read('apps/api/src/routes-network-structured-outcomes.ts');
const standalone=read('apps/api/src/routes-standalone.ts');

has(routes,"app.post('/v1/network/requests/:id/structured-outcomes'",'structured outcome write endpoint');
has(routes,"app.get('/v1/network/requests/:id/structured-outcomes'",'requester-private outcome read endpoint');
has(routes,"app.get('/v1/network/outcomes/evidence'",'public aggregate evidence endpoint');
has(routes,"status='completed'",'outcomes require completed request');
has(routes,"requester_workspace_id=$2",'only requester records and reads private outcome');
has(routes,"schemaVersion:'structured-outcomes-v1'",'versioned structured metrics payload');
has(routes,"privateMetricValuesLogged:false",'audit never logs private metric values');
has(routes,"summaryLogged:false",'audit never logs summary');
has(routes,"having count(*)>=3",'small public category samples are suppressed');
has(routes,"minimumCategorySample:3",'public methodology explains minimum sample');
has(routes,"ranking:false",'no ranking');
has(routes,"score:false",'no score');
has(routes,"rating:false",'no rating');
has(routes,"publicMetricValues:false",'private metric values remain non-public');
has(routes,"summaryExposed:false",'public response hides outcome summary');
has(routes,"privateMetricValuesExposed:false",'public response hides metric values');
has(routes,"clientIdentityExposed:false",'public response hides client identity');
has(routes,"requestIdentityExposed:false",'public response hides request identity');
has(routes,"externalEffect:false",'recording outcome has no external effect');
lacks(routes,'workspace_members','outcomes never grant workspace access');
lacks(routes,'pix_key','outcomes never access Pix secret');
lacks(routes,'order by score','outcomes never rank by score');
lacks(routes,'order by rating','outcomes never rank by rating');
has(standalone,'registerNetworkStructuredOutcomeRoutes(app)','structured outcome routes registered');

console.log('NexOffice Network Structured Outcomes V1 contract OK');
