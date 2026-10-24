import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizePersonalBills} from '../apps/api/src/personal-bill-window.ts';

// Midnight UTC is still the PREVIOUS calendar day in Sao Paulo.
const atBoundary=new Date('2026-10-24T01:00:00.000Z');
const result=summarizePersonalBills([
 {next_due_on:'2026-10-22',amount_minor:'12500'},
 {next_due_on:'2026-10-23',amount_minor:'500'},
 {next_due_on:'2026-11-22',amount_minor:'3300'},
 {next_due_on:'2026-11-23',amount_minor:'8800'},
 {next_due_on:'2026-10-21T00:00:00.000Z',amount_minor:'900'},
 {next_due_on:'2020-01-01',amount_minor:'999900'}
],atBoundary);
assert.deepEqual(result,{
 upcomingCount:2,upcomingTotalMinor:'3800',pastDatedCount:2,pastDatedTotalMinor:'1000800'
},'Only dates 2026-10-23 through 2026-11-22 qualify for the next 30 Brazil calendar days');
const day30=summarizePersonalBills([
 {next_due_on:'2026-11-22',amount_minor:'100'},
 {next_due_on:'2026-11-23',amount_minor:'300'},
 {next_due_on:'2026-10-24',amount_minor:'25'}
],atBoundary);
assert.equal(day30.upcomingCount,2,'Day +30 is inclusive, day +31 is excluded');
assert.equal(day30.pastDatedCount,0);
assert.equal(day30.upcomingTotalMinor,'125');
assert.deepEqual(summarizePersonalBills([],atBoundary),{
 upcomingCount:0,upcomingTotalMinor:'0',pastDatedCount:0,pastDatedTotalMinor:'0'
});
assert.throws(()=>summarizePersonalBills([{next_due_on:'2026-02-30',amount_minor:'1'}],atBoundary),/Invalid due date/);
assert.throws(()=>summarizePersonalBills([{next_due_on:'2026-10-23',amount_minor:'-1'}],atBoundary),/Negative/);
const api=readFileSync('apps/api/src/routes-nex-personal-studio.ts','utf8');
const ui=readFileSync('apps/web/src/NexPersonalStudio.tsx','utf8');
assert.match(api,/summarizePersonalBills\(bills\)/);
assert.match(api,/kind:'past_dated_bills'/);
assert.match(api,/pastDatedBillsMinor:billSummary\.pastDatedTotalMinor/);
assert.match(ui,/data\.totals\.pastDatedBillsMinor/);
assert.match(ui,/isso não significa inadimplência confirmada/);
console.log('Nex Personal bill windows: Brazil-local upcoming, past-dated, no false overdue claim OK');
