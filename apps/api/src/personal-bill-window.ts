/**
 * Calendar-only categorization of user-entered bill reminders.
 *
 * No bank/payment status is inferred: past-dated reminders might have been paid
 * outside Nex Personal. Treat them as requiring review, not as proven debt.
 * Use Sao Paulo calendar days, independent of UTC midnight offsets or DST.
 */
export type PersonalBillReminder = {next_due_on:string|Date;amount_minor:string};
export type PersonalBillsSummary = {
 upcomingCount:number;upcomingTotalMinor:string;
 pastDatedCount:number;pastDatedTotalMinor:string;
};
const dayMs=86_400_000;
function brazilDay(now:Date):string{
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(now);
 const item=(key:string)=>parts.find(p=>p.type===key)?.value||'';
 return item('year')+'-'+item('month')+'-'+item('day');
}
function dayNumber(input:string|Date):number{
 const iso=(input instanceof Date?input.toISOString():String(input)).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw new Error('Invalid due date');
 const date=Date.parse(iso+'T00:00:00.000Z');
 if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==iso)
  throw new Error('Invalid due date');
 return date/dayMs;
}
export function summarizePersonalBills(bills:PersonalBillReminder[],now=new Date()):PersonalBillsSummary{
 const today=dayNumber(brazilDay(now));
 let upcomingCount=0,pastDatedCount=0,upcomingTotal=0n,pastDatedTotal=0n;
 for(const bill of bills){
  const diff=dayNumber(bill.next_due_on)-today;
  const amount=BigInt(bill.amount_minor);
  if(amount<0n)throw new Error('Negative bill reminder amount');
  if(diff>=0&&diff<=30){upcomingCount++;upcomingTotal+=amount;}
  else if(diff<0){pastDatedCount++;pastDatedTotal+=amount;}
 }
 return {upcomingCount,upcomingTotalMinor:String(upcomingTotal),
  pastDatedCount,pastDatedTotalMinor:String(pastDatedTotal)};
}
