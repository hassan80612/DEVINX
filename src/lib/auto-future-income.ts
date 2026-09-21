'use client';

import {createClient} from '@/lib/supabase/client';
import {localDateISO} from '@/lib/date';
import {FuturePlanLike,FutureSettlementLike,occurrenceDates,settlementKey} from '@/domain/future-planning';

const ENABLED_KEY='devinx_auto_future_income';
const SINCE_KEY='devinx_auto_future_income_since';
const IGNORED_KEY='devinx_auto_future_income_ignored';

function readIgnored(){
  try{
    const raw=localStorage.getItem(IGNORED_KEY);
    const parsed=raw?JSON.parse(raw):[];
    return new Set<string>(Array.isArray(parsed)?parsed.filter(item=>typeof item==='string'):[]);
  }catch{return new Set<string>()}
}

function writeIgnored(values:Set<string>){
  try{localStorage.setItem(IGNORED_KEY,JSON.stringify([...values]))}catch{}
}

export function isAutoFutureIncomeEnabled(){
  if(typeof window==='undefined')return false;
  try{return localStorage.getItem(ENABLED_KEY)==='1'}catch{return false}
}

export function setAutoFutureIncomeEnabled(enabled:boolean){
  if(typeof window==='undefined')return;
  try{
    const wasEnabled=localStorage.getItem(ENABLED_KEY)==='1';
    localStorage.setItem(ENABLED_KEY,enabled?'1':'0');
    if(enabled&&!wasEnabled)localStorage.setItem(SINCE_KEY,localDateISO());
  }catch{}
}

export function ignoreAutomaticFutureIncome(planId:string,dueDate:string){
  if(typeof window==='undefined')return;
  const ignored=readIgnored();
  ignored.add(settlementKey(planId,dueDate));
  writeIgnored(ignored);
}

export async function settleAutomaticFutureIncome(){
  if(typeof window==='undefined'||!isAutoFutureIncomeEnabled())return 0;
  const s=createClient();
  const{data:{user}}=await s.auth.getUser();
  if(!user)return 0;

  const today=localDateISO();
  let since=today;
  try{
    const saved=localStorage.getItem(SINCE_KEY);
    if(saved&&/^\d{4}-\d{2}-\d{2}$/.test(saved))since=saved;
  }catch{}

  const[p,st]=await Promise.all([
    s.from('future_plans')
      .select('id,kind,name,amount_minor,category_id,due_date,recurrence,reserve_enabled,is_active')
      .eq('user_id',user.id)
      .eq('kind','income')
      .eq('is_active',true)
      .lte('due_date',today),
    s.from('future_plan_settlements')
      .select('plan_id,due_date,amount_minor,settled_on')
      .eq('user_id',user.id)
      .gte('due_date',since)
      .lte('due_date',today)
  ]);
  if(p.error||st.error)return 0;

  const plans=(p.data||[]) as FuturePlanLike[];
  const settlements=(st.data||[]) as FutureSettlementLike[];
  const ignored=readIgnored();
  let settledCount=0;

  for(const plan of plans){
    const from=plan.due_date>since?plan.due_date:since;
    const dates=occurrenceDates(plan,from,today,settlements);
    for(const due of dates){
      if(ignored.has(settlementKey(plan.id,due)))continue;
      const{error}=await s.rpc('settle_future_plan',{
        p_plan_id:plan.id,
        p_due_date:due,
        p_amount_minor:Number(plan.amount_minor),
        p_settled_on:due
      });
      if(!error){
        settlements.push({plan_id:plan.id,due_date:due,amount_minor:Number(plan.amount_minor),settled_on:due});
        settledCount+=1;
      }
    }
  }

  return settledCount;
}
