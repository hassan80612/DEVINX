export type FuturePlanKind='income'|'expense';
export type FutureRecurrence='once'|'monthly'|'annual';

export type FuturePlanLike={
  id:string;
  kind:FuturePlanKind;
  name:string;
  amount_minor:number;
  category_id:string;
  due_date:string;
  recurrence:FutureRecurrence;
  reserve_enabled:boolean;
  is_active:boolean;
};

export type FutureSettlementLike={
  plan_id:string;
  due_date:string;
  amount_minor:number;
  settled_on:string;
};

export type FutureReserveEntryLike={
  kind:'deposit'|'withdraw';
  amount_minor:number;
  future_plan_id:string|null;
  occurred_on?:string;
};

function iso(d:Date){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function parts(value:string){return{y:Number(value.slice(0,4)),m:Number(value.slice(5,7))-1,d:Number(value.slice(8,10))}}
function clamped(y:number,m:number,d:number){return iso(new Date(y,m,Math.min(d,new Date(y,m+1,0).getDate()),12))}
export function addCalendarMonths(value:string,count:number){
  const p=parts(value);return clamped(p.y,p.m+count,p.d);
}
export function addCalendarYears(value:string,count:number){
  const p=parts(value);return clamped(p.y+count,p.m,p.d);
}
export function endOfMonth(monthStart:string){
  const p=parts(monthStart);return iso(new Date(p.y,p.m+1,0,12));
}
export function daysBetween(from:string,to:string){
  return Math.floor((new Date(to+'T12:00:00').getTime()-new Date(from+'T12:00:00').getTime())/86400000);
}
export function monthsToDue(today:string,due:string){
  if(due<=today)return 1;
  return Math.max(1,Math.ceil(daysBetween(today,due)/30.4375));
}
export function settlementKey(planId:string,dueDate:string){return planId+'|'+dueDate}
export function settledSet(settlements:FutureSettlementLike[]){
  return new Set(settlements.map(s=>settlementKey(s.plan_id,s.due_date)));
}
export function occurrenceDates(plan:FuturePlanLike,from:string,to:string,settlements:FutureSettlementLike[]){
  if(!plan.is_active&&plan.recurrence!=='once')return[];
  const done=settledSet(settlements);
  const values:string[]=[];
  const push=(date:string)=>{if(date>=from&&date<=to&&!done.has(settlementKey(plan.id,date)))values.push(date)};
  if(plan.recurrence==='once'){push(plan.due_date);return values}
  let cursor=plan.due_date;
  let guard=0;
  while(cursor<=to&&guard<720){
    push(cursor);
    cursor=plan.recurrence==='monthly'?addCalendarMonths(cursor,1):addCalendarYears(cursor,1);
    guard+=1;
  }
  return values;
}
export function nextPendingOccurrence(plan:FuturePlanLike,settlements:FutureSettlementLike[],today:string){
  const done=settledSet(settlements);
  if(plan.recurrence==='once')return done.has(settlementKey(plan.id,plan.due_date))?null:plan.due_date;
  let cursor=plan.due_date;
  let guard=0;
  const limit=addCalendarYears(today,5);
  while(cursor<=limit&&guard<720){
    if(!done.has(settlementKey(plan.id,cursor)))return cursor;
    cursor=plan.recurrence==='monthly'?addCalendarMonths(cursor,1):addCalendarYears(cursor,1);
    guard+=1;
  }
  return null;
}
export function committedReserveForPlan(planId:string,entries:FutureReserveEntryLike[]){
  return Math.max(0,entries.filter(e=>e.future_plan_id===planId).reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0));
}
export function committedReserveTotal(plans:FuturePlanLike[],entries:FutureReserveEntryLike[]){
  const active=new Set(plans.filter(p=>p.is_active&&p.kind==='expense'&&p.reserve_enabled).map(p=>p.id));
  return Math.max(0,entries.filter(e=>e.future_plan_id&&active.has(e.future_plan_id)).reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0));
}
export function reserveNeed(plan:FuturePlanLike,settlements:FutureSettlementLike[],entries:FutureReserveEntryLike[],today:string){
  if(plan.kind!=='expense'||!plan.reserve_enabled)return{due:null,committed:0,remaining:0,monthly:0,monthlyAverage:0,daily:0};
  const due=nextPendingOccurrence(plan,settlements,today);
  const committed=committedReserveForPlan(plan.id,entries);
  if(!due)return{due:null,committed,remaining:0,monthly:0,monthlyAverage:0,daily:0};
  const remaining=Math.max(0,Number(plan.amount_minor)-committed);
  const monthStart=today.slice(0,7)+'-01';
  const monthNet=entries
    .filter(e=>e.future_plan_id===plan.id&&!!e.occurred_on&&(e.occurred_on||'')>=monthStart&&(e.occurred_on||'').slice(0,7)===monthStart.slice(0,7))
    .reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0);
  const committedAtMonthStart=Math.max(0,committed-monthNet);
  const remainingAtMonthStart=Math.max(0,Number(plan.amount_minor)-committedAtMonthStart);
  const monthlyTarget=Math.ceil(remainingAtMonthStart/monthsToDue(today,due));
  const monthly=Math.max(0,monthlyTarget-Math.max(0,monthNet));
  const monthlyAverage=Math.ceil(remaining/Math.max(1,monthsToDue(today,due)));
  const days=Math.max(1,daysBetween(today,due)+1);
  const daily=Math.ceil(remaining/days);
  return{due,committed,remaining,monthly,monthlyAverage,daily};
}
export function monthPlanningImpact(
  plans:FuturePlanLike[],
  settlements:FutureSettlementLike[],
  entries:FutureReserveEntryLike[],
  monthStart:string,
  today:string
){
  const monthEnd=endOfMonth(monthStart);
  const currentMonth=today.slice(0,7)+'-01';
  let expectedIncome=0,directExpense=0,reserveContribution=0;
  for(const plan of plans.filter(p=>p.is_active)){
    if(plan.kind==='income'){
      const from=monthStart===currentMonth&&today>monthStart?today:monthStart;
      expectedIncome+=occurrenceDates(plan,from,monthEnd,settlements).reduce(sum=>sum+Number(plan.amount_minor),0);
      continue;
    }
    if(plan.reserve_enabled){
      const need=reserveNeed(plan,settlements,entries,today);
      if(!need.due||need.remaining<=0)continue;
      const dueMonth=need.due.slice(0,7)+'-01';
      if(monthStart>=currentMonth&&monthStart<=dueMonth){
        reserveContribution+=Math.min(need.remaining,monthStart===currentMonth?need.monthly:need.monthlyAverage);
      }
      continue;
    }
    directExpense+=occurrenceDates(plan,monthStart,monthEnd,settlements).reduce(sum=>sum+Number(plan.amount_minor),0);
    const overdue=nextPendingOccurrence(plan,settlements,today);
    if(monthStart===currentMonth&&overdue&&overdue<today)directExpense+=Number(plan.amount_minor);
  }
  return{expectedIncome,directExpense,reserveContribution,totalNeed:directExpense+reserveContribution,netNeed:Math.max(0,directExpense+reserveContribution-expectedIncome)};
}
export type FuturePlanningEvent={date:string;amount:number;kind:'income'|'expense';planId:string};
export function planningEvents(
  plans:FuturePlanLike[],
  settlements:FutureSettlementLike[],
  entries:FutureReserveEntryLike[],
  today:string,
  horizon:string
){
  const events:FuturePlanningEvent[]=[];
  let grossOut=0,expectedIncome=0;
  for(const plan of plans.filter(p=>p.is_active)){
    let dates=occurrenceDates(plan,today,horizon,settlements);
    const next=nextPendingOccurrence(plan,settlements,today);
    if(plan.kind==='expense'&&next&&next<today)dates=[next,...dates.filter(d=>d!==next)];
    if(plan.kind==='income'){
      for(const due of dates.filter(d=>d>=today)){
        events.push({date:due,amount:Number(plan.amount_minor),kind:'income',planId:plan.id});
        expectedIncome+=Number(plan.amount_minor);
      }
      continue;
    }
    let committed=plan.reserve_enabled?committedReserveForPlan(plan.id,entries):0;
    for(const rawDue of dates){
      const due=rawDue<today?today:rawDue;
      let amount=Number(plan.amount_minor);
      if(plan.reserve_enabled&&committed>0){
        const covered=Math.min(committed,amount);
        amount-=covered;committed-=covered;
      }
      if(amount<=0)continue;
      events.push({date,amount,kind:'expense',planId:plan.id});
      grossOut+=amount;
    }
  }
  return{events:events.sort((a,b)=>a.date.localeCompare(b.date)),grossOut,expectedIncome};
}
