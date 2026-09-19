export type RecurringBillLike={
  id:string;
  amount_minor:number;
  due_day:number;
  start_month:string;
  installment_count:number|null;
};
export type RecurringPaymentLike={
  recurring_bill_id:string;
  due_month:string;
  amount_minor:number;
};
export type RecurringOverrideLike={
  recurring_bill_id:string;
  due_month:string;
  amount_minor:number|null;
  due_day:number|null;
};

export function monthStart(iso:string){
  return iso.slice(0,7)+'-01';
}
export function addMonths(month:string,count:number){
  const d=new Date(monthStart(month)+'T12:00:00');
  d.setMonth(d.getMonth()+count);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
}
export function monthDiff(from:string,to:string){
  const a=new Date(monthStart(from)+'T12:00:00');
  const b=new Date(monthStart(to)+'T12:00:00');
  return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());
}
export function billAppliesToMonth(bill:RecurringBillLike,month:string){
  const index=monthDiff(bill.start_month,month);
  if(index<0)return false;
  return bill.installment_count==null||index<bill.installment_count;
}
export function installmentNumber(bill:RecurringBillLike,month:string){
  if(!billAppliesToMonth(bill,month))return null;
  return monthDiff(bill.start_month,month)+1;
}
export function billOverride(billId:string,month:string,overrides:RecurringOverrideLike[]){
  return overrides.find(o=>o.recurring_bill_id===billId&&monthStart(o.due_month)===monthStart(month))||null;
}
export function billExpectedAmount(bill:RecurringBillLike,month:string,overrides:RecurringOverrideLike[]){
  if(!billAppliesToMonth(bill,month))return 0;
  const override=billOverride(bill.id,month,overrides);
  return Number(override?.amount_minor??bill.amount_minor);
}
export function billDueDay(bill:RecurringBillLike,month:string,overrides:RecurringOverrideLike[]){
  const override=billOverride(bill.id,month,overrides);
  return Number(override?.due_day??bill.due_day);
}
export function dueDateForMonth(month:string,dueDay:number){
  const m=monthStart(month);
  const year=Number(m.slice(0,4));
  const monthNumber=Number(m.slice(5,7));
  const last=new Date(year,monthNumber,0).getDate();
  const day=Math.min(Math.max(Number(dueDay||1),1),last);
  return m.slice(0,8)+String(day).padStart(2,'0');
}
export function billPaidAmount(billId:string,month:string,payments:RecurringPaymentLike[]){
  const key=monthStart(month);
  return payments
    .filter(p=>p.recurring_bill_id===billId&&monthStart(p.due_month)===key)
    .reduce((sum,p)=>sum+Number(p.amount_minor),0);
}
export function billRemaining(
  bill:RecurringBillLike,
  month:string,
  payments:RecurringPaymentLike[],
  overrides:RecurringOverrideLike[]
){
  return Math.max(0,billExpectedAmount(bill,month,overrides)-billPaidAmount(bill.id,month,payments));
}
export function monthsBetween(start:string,end:string){
  const rows:string[]=[];
  let cursor=monthStart(start);
  const last=monthStart(end);
  while(cursor<=last&&rows.length<600){
    rows.push(cursor);
    cursor=addMonths(cursor,1);
  }
  return rows;
}
