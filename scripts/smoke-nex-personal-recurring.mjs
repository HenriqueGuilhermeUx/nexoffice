import assert from 'node:assert/strict';
import {detectRecurringExpenses} from '../packages/integrations/dist/personal-recurring-expenses.js';
const expense=(date,description,amount,category='Assinaturas',role='expense')=>({
 bookedAt:date,description,amountMinor:String(-amount),category,analysisRole:role
});
const rows=[
 expense('2026-07-10','Netflix assinatura 01/2026',10000),
 expense('2026-08-11','Netflix assinatura 02/2026',10200),
 expense('2026-09-11','Netflix assinatura 03/2026',11500),
 expense('2026-09-14','PIX para terceiros',12000,'Transferências'),
 expense('2026-07-10','Farmacia Popular',4800,'Saúde'),
 expense('2026-08-10','Farmacia Popular',4800,'Saúde'),
 expense('2026-09-10','Farmacia Popular',4800,'Saúde'),
 expense('2026-07-21','Spotify assinatura',3500,'Assinaturas','review'),
 expense('2026-08-21','Spotify assinatura',3500,'Assinaturas','review'),
 expense('2026-09-21','Spotify assinatura',3500,'Assinaturas','review')
];
const result=detectRecurringExpenses(rows,'2026-10-23');
assert.equal(result.patterns.length,1,JSON.stringify(result));
assert.equal(result.patterns[0].monthlyAmountMinor,'11500');
assert.equal(result.patterns[0].increaseDetected,true);
assert.equal(result.patterns[0].amountChangeMinor,'1500');
assert.equal(result.patterns[0].confidence,'medium');
assert.equal(result.marketingUsed,false);
assert.equal(result.externalEffect,false);
assert.equal(result.providerConnected,false);
const sameMonth=[
 expense('2026-07-03','Assinatura TV 1001',4400),
 expense('2026-08-03','Assinatura TV 1002',4400),
 expense('2026-09-03','Assinatura TV 1003',4400),
 expense('2026-09-15','Assinatura TV 1004',4400)
];
assert.equal(detectRecurringExpenses(sameMonth,'2026-10-23').patterns.length,0,'Repeated charges in same month are ambiguous');
assert.equal(detectRecurringExpenses(rows.slice(0,2),'2026-10-23').patterns.length,0,'Two months insufficient');
const uneven=[
 expense('2026-07-10','Spotify assinatura',1000),
 expense('2026-08-10','Spotify assinatura',5000),
 expense('2026-09-10','Spotify assinatura',1000)
];
assert.equal(detectRecurringExpenses(uneven,'2026-10-23').patterns.length,0);
const spaced=[
 expense('2026-06-10','Spotify assinatura',1000),
 expense('2026-08-10','Spotify assinatura',1000),
 expense('2026-09-10','Spotify assinatura',1000)
];
assert.equal(detectRecurringExpenses(spaced,'2026-10-23').patterns.length,0);
const privacy=[
 expense('2026-07-10','Consulta medico',5000,'Saúde'),
 expense('2026-08-10','Consulta medico',5000,'Saúde'),
 expense('2026-09-10','Consulta medico',5000,'Saúde')
];
assert.equal(detectRecurringExpenses(privacy,'2026-10-23').patterns.length,0);
const stale=[
 expense('2026-02-10','Netflix assinatura',9900),
 expense('2026-03-10','Netflix assinatura',9900),
 expense('2026-04-10','Netflix assinatura',9900)
];
assert.equal(detectRecurringExpenses(stale,'2026-10-23').patterns.length,0,
 'An old cancelled service must not appear as an active monthly pattern.');
assert.throws(()=>detectRecurringExpenses([],'2026-02-31'));
console.log('Personal recurring: 3-month evidence, change signals, ambiguous payments and sensitive exclusion passed');
