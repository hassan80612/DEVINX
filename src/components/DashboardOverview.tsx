'use client';

import {useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT,notifyGoalUpdated} from '@/lib/finance-events';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {
  RecurringBillLike,RecurringOverrideLike,RecurringPaymentLike,
  billAppliesToMonth,billRemaining,billDueDay,dueDateForMonth,monthsBetween
} from '@/domain/recurring';
import {useI18n} from '@/i18n/provider';
import {
  FuturePlanLike,FutureReserveEntryLike,FutureSettlementLike,
  committedReserveTotal,monthPlanningImpact,planningEvents
} from '@/domain/future-planning';

type Tx={type:'income'|'expense';amount_minor:number;occurred_on:string;is_avoidable:boolean};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;worked_on:string};
type Goal={id:string;name:string;target_minor:number;basis:string;period:string;goal_source:'manual'|'daily_reserve_auto'|'daily_reserve_manual';target_date:string|null};
type Bill=RecurringBillLike&{created_at:string;is_avoidable:boolean};
type BillPay=RecurringPaymentLike&{paid_on:string};
type BillOverride=RecurringOverrideLike;
type CardInst={amount_minor:number;billing_month:string;due_date:string|null;paid_at:string|null};
type CardPay={amount_minor:number;paid_on:string};
type DebtPay={debt_id:string;amount_minor:number;paid_on:string};
type ReserveEntry=FutureReserveEntryLike&{occurred_on:string};
type ChartPeriod='3d'|'7d'|'1m'|'3m'|'6m'|'12m';
const CHART_PERIODS:ChartPeriod[]=['3d','7d','1m','3m','6m','12m'];

function shiftISO(value:string,days:number){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()+days);return localDateISO(d)}
function daysAgo(days:number){return shiftISO(localDateISO(),-days)}
function weekStart(){
  const today=localDateISO();const d=new Date(today+'T12:00:00');const day=(d.getDay()+6)%7;return shiftISO(today,-day);
}
function validChartPeriod(value:unknown):value is ChartPeriod{return CHART_PERIODS.includes(value as ChartPeriod)}
function chartStart(period:ChartPeriod){
  if(period==='3d')return daysAgo(2);
  if(period==='7d')return daysAgo(6);
  if(period==='1m')return daysAgo(29);
  if(period==='3m')return daysAgo(89);
  const today=new Date(localDateISO()+'T12:00:00');
  const months=period==='6m'?5:11;
  return localDateISO(new Date(today.getFullYear(),today.getMonth()-months,1));
}
function dayDiff(from:string,to:string){return Math.max(0,Math.floor((new Date(to+'T12:00:00').getTime()-new Date(from+'T12:00:00').getTime())/86400000))}
function monthEnd(month:string){
  const d=new Date(month+'T12:00:00');
  return localDateISO(new Date(d.getFullYear(),d.getMonth()+1,0));
}
function daysInclusive(from:string,to:string){
  const a=new Date(from+'T12:00:00').getTime();
  const b=new Date(to+'T12:00:00').getTime();
  return Math.max(1,Math.floor((b-a)/86400000)+1);
}
function monthDistance(from:string,to:string){
  const fy=Number(from.slice(0,4)),fm=Number(from.slice(5,7));
  const ty=Number(to.slice(0,4)),tm=Number(to.slice(5,7));
  return (ty-fy)*12+(tm-fm);
}
function moneyMinor(raw:string){return Math.round((Number(String(raw||'').replace(/\./g,'').replace(',','.'))||0)*100)}

export function DashboardOverview(){
  const{t,currency,date}=useI18n();
  const[tx,setTx]=useState<Tx[]>([]);
  const[work,setWork]=useState<Work[]>([]);
  const[goal,setGoal]=useState<Goal|null>(null);
  const[bills,setBills]=useState<Bill[]>([]);
  const[billPays,setBillPays]=useState<BillPay[]>([]);
  const[billOverrides,setBillOverrides]=useState<BillOverride[]>([]);
  const[cardInst,setCardInst]=useState<CardInst[]>([]);
  const[cardPays,setCardPays]=useState<CardPay[]>([]);
  const[debtPays,setDebtPays]=useState<DebtPay[]>([]);
  const[reserveEntries,setReserveEntries]=useState<ReserveEntry[]>([]);
  const[futurePlans,setFuturePlans]=useState<FuturePlanLike[]>([]);
  const[futureSettlements,setFutureSettlements]=useState<FutureSettlementLike[]>([]);
  const[goalTargetDate,setGoalTargetDate]=useState('');
  const[targetDraft,setTargetDraft]=useState('');
  const[loading,setLoading]=useState(true);
  const[projectedHost,setProjectedHost]=useState<HTMLElement|null>(null);
  const[goalNotice,setGoalNotice]=useState('');
  const[commitmentMonth,setCommitmentMonth]=useState(localMonthStartISO());
  const[dailyGoalExpanded,setDailyGoalExpanded]=useState(true);
  const[goalMode,setGoalMode]=useState<'automatic'|'manual'>('automatic');
  const[manualDailyTarget,setManualDailyTarget]=useState('');
  const[chartPeriod,setChartPeriod]=useState<ChartPeriod>('1m');
  const[selectedFlowKey,setSelectedFlowKey]=useState('');
  const[goalSaving,setGoalSaving]=useState(false);

  async function load(show=false,periodOverride?:ChartPeriod){
    if(show)setLoading(true);
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.replace('/entrar');return}
    const{data:profile}=await s.from('profiles').select('daily_goal_target_date,dashboard_chart_period').eq('id',user.id).maybeSingle();
    const profilePeriod=validChartPeriod((profile as any)?.dashboard_chart_period)?(profile as any).dashboard_chart_period as ChartPeriod:chartPeriod;
    const activePeriod=periodOverride||profilePeriod||'1m';
    setChartPeriod(activePeriod);
    const chartFrom=chartStart(activePeriod);
    const monthFrom=localMonthStartISO();
    const from=chartFrom<monthFrom?chartFrom:monthFrom;
    const[rTx,rWork,rGoal,rBills,rBillPay,rBillOverrides,rInst,rCardPay,rDebtPay,rReserve,rFuturePlans,rFutureSettlements]=await Promise.all([
      s.from('transactions').select('type,amount_minor,occurred_on,is_avoidable').eq('user_id',user.id).gte('occurred_on',from),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on').eq('user_id',user.id).gte('worked_on',from),
      s.from('goals').select('id,name,target_minor,basis,period,goal_source,target_date').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1),
      s.from('recurring_bills').select('id,amount_minor,due_day,start_month,installment_count,created_at,is_avoidable').eq('user_id',user.id).eq('is_active',true),
      s.from('recurring_bill_payments').select('recurring_bill_id,amount_minor,due_month,paid_on').eq('user_id',user.id),
      s.from('recurring_bill_month_overrides').select('recurring_bill_id,due_month,amount_minor,due_day').eq('user_id',user.id),
      s.from('card_installments').select('amount_minor,billing_month,due_date,paid_at').eq('user_id',user.id).is('paid_at',null),
      s.from('card_bill_payments').select('amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from),
      s.from('debt_payments').select('debt_id,amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from),
      s.from('reserve_entries').select('kind,amount_minor,occurred_on,future_plan_id').eq('user_id',user.id),
      s.from('future_plans').select('id,kind,name,amount_minor,category_id,due_date,recurrence,reserve_enabled,is_active').eq('user_id',user.id),
      s.from('future_plan_settlements').select('plan_id,due_date,amount_minor,settled_on').eq('user_id',user.id)
    ]);
    setTx((rTx.data||[]) as Tx[]);
    setWork((rWork.data||[]) as Work[]);
    const loadedGoal=((rGoal.data||[])[0]||null) as Goal|null;
    setGoal(loadedGoal);
    if(loadedGoal?.goal_source==='daily_reserve_manual'){
      setGoalMode('manual');
      setManualDailyTarget(String(Number(loadedGoal.target_minor)/100).replace('.',','));
    }else{
      setGoalMode('automatic');
    }
    setBills((rBills.data||[]) as Bill[]);
    setBillPays((rBillPay.data||[]) as BillPay[]);
    setBillOverrides((rBillOverrides.data||[]) as BillOverride[]);
    setCardInst((rInst.data||[]) as CardInst[]);
    setCardPays((rCardPay.data||[]) as CardPay[]);
    setDebtPays((rDebtPay.data||[]) as DebtPay[]);
    setReserveEntries((rReserve.data||[]) as ReserveEntry[]);
    setFuturePlans((rFuturePlans.data||[]) as FuturePlanLike[]);
    setFutureSettlements((rFutureSettlements.data||[]) as FutureSettlementLike[]);
    const saved=(profile as any)?.daily_goal_target_date||'';
    setGoalTargetDate(saved);
    setTargetDraft(saved);
    setLoading(false);
  }

  useLayoutEffect(()=>{try{const saved=localStorage.getItem('devinx_daily_goal_expanded');if(saved!==null)setDailyGoalExpanded(saved==='1')}catch{}},[]);
  function toggleDailyGoal(){setDailyGoalExpanded(current=>{const next=!current;try{localStorage.setItem('devinx_daily_goal_expanded',next?'1':'0')}catch{}return next})}

  useEffect(()=>{
    load(true);
    setProjectedHost(document.getElementById('home-projected-slot'));
    const refresh=()=>load(false);
    window.addEventListener(FINANCE_UPDATED_EVENT,refresh);
    return()=>window.removeEventListener(FINANCE_UPDATED_EVENT,refresh);
  },[]);

  const reserveBalance=useMemo(
    ()=>reserveEntries.reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0),
    [reserveEntries]
  );

  const numbers=useMemo(()=>{
    const today=localDateISO();
    const month=localMonthStartISO();
    const txMonth=tx.filter(x=>x.occurred_on>=month);
    const workMonth=work.filter(x=>x.worked_on>=month);
    const billPayMonth=billPays.filter(x=>x.paid_on>=month);
    const cardPayMonth=cardPays.filter(x=>x.paid_on>=month);
    const manualIncome=txMonth.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0);
    const manualExpense=txMonth.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0);
    const workGross=workMonth.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const workCost=workMonth.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0);
    const recurringSpent=billPayMonth.reduce((a,b)=>a+Number(b.amount_minor),0);
    const cardSpent=cardPayMonth.reduce((a,b)=>a+Number(b.amount_minor),0);
    const reserveMonthNet=reserveEntries.filter(e=>e.occurred_on>=month).reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0);
    const reserveTodayNet=reserveEntries.filter(e=>e.occurred_on===today).reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0);
    const income=manualIncome+workGross;
    const spent=manualExpense+workCost+recurringSpent+cardSpent;
    const balance=income-spent-reserveMonthNet;

    const todayIncome=
      tx.filter(x=>x.occurred_on===today&&x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0)+
      work.filter(x=>x.worked_on===today).reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const todaySpent=
      tx.filter(x=>x.occurred_on===today&&x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0)+
      work.filter(x=>x.worked_on===today).reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0)+
      billPays.filter(x=>x.paid_on===today).reduce((a,b)=>a+Number(b.amount_minor),0)+
      cardPays.filter(x=>x.paid_on===today).reduce((a,b)=>a+Number(b.amount_minor),0);

    const recurringPending=bills.reduce((sum,bill)=>{
      if(!billAppliesToMonth(bill,month))return sum;
      return sum+billRemaining(bill,month,billPays,billOverrides);
    },0);
    const cardsDueNow=cardInst
      .filter(i=>(i.due_date||i.billing_month).slice(0,7)+'-01'===month)
      .reduce((a,b)=>a+Number(b.amount_minor),0);
    const toPay=recurringPending+cardsDueNow;
    const projected=balance-toPay;
    const avoidable=txMonth.filter(x=>x.type==='expense'&&x.is_avoidable).reduce((a,b)=>a+Number(b.amount_minor),0);

    return{income,spent,balance,todayIncome,todaySpent,todayBalance:todayIncome-todaySpent-reserveTodayNet,recurringPending,cardsDueNow,toPay,projected,avoidable};
  },[tx,work,bills,billPays,billOverrides,cardInst,cardPays,debtPays,reserveEntries]);

  const currentFutureImpact=useMemo(
    ()=>monthPlanningImpact(futurePlans,futureSettlements,reserveEntries,localMonthStartISO(),localDateISO()),
    [futurePlans,futureSettlements,reserveEntries]
  );
  const projectedWithFuture=numbers.projected+currentFutureImpact.expectedIncome-currentFutureImpact.totalNeed;
  const pendingWithFuture=numbers.toPay+currentFutureImpact.totalNeed;

  const selectedCommitments=useMemo(()=>{
    const currentMonth=localMonthStartISO();
    const selected=commitmentMonth<currentMonth?currentMonth:commitmentMonth;
    const recurringPending=bills.reduce((sum,bill)=>{
      if(!billAppliesToMonth(bill,selected))return sum;
      return sum+billRemaining(bill,selected,billPays,billOverrides);
    },0);
    const cardsDue=cardInst
      .filter(i=>(i.due_date||i.billing_month).slice(0,7)+'-01'===selected)
      .reduce((a,b)=>a+Number(b.amount_minor),0);
    const future=monthPlanningImpact(futurePlans,futureSettlements,reserveEntries,selected,localDateISO());
    const gross=recurringPending+cardsDue+future.totalNeed;
    return{recurringPending,cardsDue,futureNeed:future.totalNeed,expectedIncome:future.expectedIncome,gross,total:Math.max(0,gross-future.expectedIncome)};
  },[commitmentMonth,bills,billPays,billOverrides,cardInst,futurePlans,futureSettlements,reserveEntries]);

  const flowChart=useMemo(()=>{
    type FlowRow={key:string;start:string;income:number;out:number};
    const today=localDateISO();
    const start=chartStart(chartPeriod);
    let rows:FlowRow[]=[];
    let bucket=(value:string)=>value;
    let labelEvery=1;

    if(chartPeriod==='3d'||chartPeriod==='7d'||chartPeriod==='1m'){
      const count=chartPeriod==='3d'?3:chartPeriod==='7d'?7:30;
      const days=Array.from({length:count},(_,index)=>shiftISO(today,-(count-1-index)));
      rows=days.map(day=>({key:day,start:day,income:0,out:0}));
      bucket=value=>value;
      labelEvery=chartPeriod==='1m'?5:1;
    }else if(chartPeriod==='3m'){
      const count=13;
      rows=Array.from({length:count},(_,index)=>{
        const startOfWeek=shiftISO(start,index*7);
        return{key:'w'+index,start:startOfWeek,income:0,out:0};
      });
      bucket=value=>'w'+Math.min(count-1,Math.max(0,Math.floor(dayDiff(start,value)/7)));
    }else{
      const count=chartPeriod==='6m'?6:12;
      const startDate=new Date(start+'T12:00:00');
      rows=Array.from({length:count},(_,index)=>{
        const month=localDateISO(new Date(startDate.getFullYear(),startDate.getMonth()+index,1));
        return{key:month.slice(0,7),start:month,income:0,out:0};
      });
      bucket=value=>value.slice(0,7);
    }

    const map=new Map(rows.map(row=>[row.key,row]));
    const add=(value:string,income:number,out:number)=>{
      if(value<start||value>today)return;
      const row=map.get(bucket(value));if(!row)return;
      row.income+=income;row.out+=out;
    };
    tx.forEach(item=>add(item.occurred_on,item.type==='income'?Number(item.amount_minor):0,item.type==='expense'?Number(item.amount_minor):0));
    work.forEach(item=>add(item.worked_on,Number(item.gross_income_minor),Number(item.energy_cost_minor)+Number(item.extra_work_cost_minor)));
    billPays.forEach(item=>add(item.paid_on,0,Number(item.amount_minor)));
    cardPays.forEach(item=>add(item.paid_on,0,Number(item.amount_minor)));

    const max=Math.max(1,...rows.flatMap(row=>[row.income,row.out]));
    return{rows,max,labelEvery};
  },[tx,work,billPays,cardPays,chartPeriod]);

  const selectedFlowRow=flowChart.rows.find(row=>row.key===selectedFlowKey)||null;

  async function changeChartPeriod(next:ChartPeriod){
    setChartPeriod(next);
    setSelectedFlowKey('');
    try{localStorage.setItem('devinx_dashboard_chart_period',next)}catch{}
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(user)await s.from('profiles').update({dashboard_chart_period:next}).eq('id',user.id);
    await load(false,next);
  }

  const futureCommittedReserve=useMemo(()=>committedReserveTotal(futurePlans,reserveEntries),[futurePlans,reserveEntries]);

  const reserveSuggestion=useMemo(()=>{
    const today=localDateISO();
    const month=localMonthStartISO();
    const fallbackHorizon=monthEnd(month);
    const horizon=goalTargetDate&&goalTargetDate>=today?goalTargetDate:fallbackHorizon;
    const horizonMonth=horizon.slice(0,7)+'-01';
    const obligations:{due:string;amount:number;kind:'bill'|'card'|'future'}[]=[];

    for(const bill of bills){
      for(const dueMonth of monthsBetween(month,horizonMonth)){
        if(!billAppliesToMonth(bill,dueMonth))continue;
        const due=dueDateForMonth(dueMonth,billDueDay(bill,dueMonth,billOverrides));
        if(due>horizon)continue;
        const remaining=billRemaining(bill,dueMonth,billPays,billOverrides);
        if(remaining>0)obligations.push({due:due<today?today:due,amount:remaining,kind:'bill'});
      }
    }

    for(const inst of cardInst){
      const due=inst.due_date||dueDateForMonth(inst.billing_month,1);
      if(due<=horizon)obligations.push({due:due<today?today:due,amount:Number(inst.amount_minor),kind:'card'});
    }

    const future=planningEvents(futurePlans,futureSettlements,reserveEntries,today,horizon);
    obligations.sort((a,b)=>a.due.localeCompare(b.due));
    const grouped=new Map<string,number>();
    for(const item of obligations)grouped.set(item.due,(grouped.get(item.due)||0)+item.amount);
    for(const item of future.events){
      grouped.set(item.date,(grouped.get(item.date)||0)+(item.kind==='expense'?item.amount:-item.amount));
    }

    const planningCash=numbers.balance;
    let cumulative=0;
    let daily=0;
    let criticalDeadline=horizon;
    let criticalGap=0;
    for(const[due,amount]of [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
      cumulative+=amount;
      const gap=Math.max(0,cumulative-planningCash);
      const required=Math.ceil(gap/daysInclusive(today,due));
      if(required>daily){
        daily=required;
        criticalDeadline=due;
        criticalGap=gap;
      }
    }
    const total=obligations.reduce((sum,o)=>sum+o.amount,0)+future.grossOut;
    const netTotal=Math.max(0,total-future.expectedIncome);
    const gap=Math.max(0,netTotal-planningCash);
    return{
      horizon,
      criticalDeadline,
      criticalGap,
      daily,
      total,
      expectedIncome:future.expectedIncome,
      gap,
      days:daysInclusive(today,horizon),
      hasCustomHorizon:!!goalTargetDate&&goalTargetDate>=today
    };
  },[goalTargetDate,bills,billPays,billOverrides,cardInst,numbers.balance,futurePlans,futureSettlements,reserveEntries]);

  async function saveHorizon(){
    if(targetDraft&&targetDraft<localDateISO()){setGoalNotice(t('dashboard.futureDateError'));return}
    setGoalSaving(true);
    try{
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      const value=targetDraft||null;
      const{error}=await s.from('profiles').update({daily_goal_target_date:value}).eq('id',user.id);
      if(error){setGoalNotice(t('common.errorSave'));return}
      const effectiveHorizon=value||monthEnd(localMonthStartISO());
      if(goal?.goal_source==='daily_reserve_manual'){
        const{error:goalError}=await s.from('goals').update({target_date:effectiveHorizon}).eq('id',goal.id);
        if(goalError){setGoalNotice(t('common.errorSave'));return}
        setGoal(current=>current?{...current,target_date:effectiveHorizon}:current);
      }
      setGoalTargetDate(value||'');
      setGoalNotice(value?t('dashboard.targetDateSaved'):t('dashboard.targetDateCleared'));
      notifyFinanceUpdated();
    }finally{setGoalSaving(false)}
  }

  async function clearHorizon(){
    setGoalSaving(true);
    try{
      setTargetDraft('');
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      const{error}=await s.from('profiles').update({daily_goal_target_date:null}).eq('id',user.id);
      if(error){setGoalNotice(t('common.errorSave'));return}
      const effectiveHorizon=monthEnd(localMonthStartISO());
      if(goal?.goal_source==='daily_reserve_manual'){
        const{error:goalError}=await s.from('goals').update({target_date:effectiveHorizon}).eq('id',goal.id);
        if(goalError){setGoalNotice(t('common.errorSave'));return}
        setGoal(current=>current?{...current,target_date:effectiveHorizon}:current);
      }
      setGoalTargetDate('');
      setGoalNotice(t('dashboard.targetDateCleared'));
      notifyFinanceUpdated();
    }finally{setGoalSaving(false)}
  }

  async function useDailyGoal(){
    if(reserveSuggestion.daily<=0)return;
    if(goal&&!confirm(t('dashboard.dailyGoalConfirm')))return;
    setGoalSaving(true);
    try{
      const s=createClient();
      const{error}=await s.rpc('replace_active_goal_v2',{
        p_name:'__devinx_daily_reserve__',
        p_period:'daily',
        p_basis:'savings',
        p_target_minor:reserveSuggestion.daily,
        p_source:'daily_reserve_auto',
        p_target_date:reserveSuggestion.horizon
      });
      if(error){setGoalNotice(t('common.errorSave'));return}
      setGoalMode('automatic');
      setGoalNotice(t('dashboard.dailyGoalSaved'));
      notifyFinanceUpdated();
      await load(false);
    }finally{setGoalSaving(false)}
  }

  async function useManualDailyGoal(){
    const value=moneyMinor(manualDailyTarget);
    if(value<=0)return;
    const today=localDateISO();
    if(targetDraft&&targetDraft<today){setGoalNotice(t('dashboard.futureDateError'));return}
    if(goal&&!confirm(t('dashboard.dailyGoalConfirm')))return;
    setGoalSaving(true);
    try{
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      const effectiveHorizon=(targetDraft&&targetDraft>=today?targetDraft:'')||reserveSuggestion.horizon;
      if(targetDraft!==goalTargetDate){
        const{error:horizonError}=await s.from('profiles').update({daily_goal_target_date:targetDraft||null}).eq('id',user.id);
        if(horizonError){setGoalNotice(t('common.errorSave'));return}
        setGoalTargetDate(targetDraft||'');
      }
      const{error}=await s.rpc('replace_active_goal_v2',{
        p_name:'__devinx_daily_manual__',
        p_period:'daily',
        p_basis:'savings',
        p_target_minor:value,
        p_source:'daily_reserve_manual',
        p_target_date:effectiveHorizon
      });
      if(error){setGoalNotice(t('common.errorSave'));return}
      setGoalMode('manual');
      setGoalNotice(t('dashboard.manualDailyGoalSaved'));
      notifyFinanceUpdated();
      await load(false);
    }finally{setGoalSaving(false)}
  }

  useEffect(()=>{
    if(loading||!goal||goal.goal_source!=='daily_reserve_auto')return;
    const nextTarget=reserveSuggestion.daily;
    const nextDate=reserveSuggestion.horizon;
    if(nextTarget<=0){
      let cancelled=false;
      (async()=>{
        const s=createClient();
        const{error}=await s.from('goals').update({is_active:false}).eq('id',goal.id);
        if(!error&&!cancelled){
          setGoal(current=>current?.id===goal.id?null:current);
          setGoalNotice(t('dashboard.autoGoalCovered'));
        }
      })();
      return()=>{cancelled=true};
    }
    if(Number(goal.target_minor)===nextTarget&&goal.target_date===nextDate)return;
    let cancelled=false;
    (async()=>{
      const s=createClient();
      const{error}=await s.from('goals').update({
        name:'__devinx_daily_reserve__',
        period:'daily',
        basis:'savings',
        target_minor:nextTarget,
        goal_source:'daily_reserve_auto',
        target_date:nextDate
      }).eq('id',goal.id);
      if(!error&&!cancelled){
        setGoal(current=>current?.id===goal.id?{...current,name:'__devinx_daily_reserve__',period:'daily',basis:'savings',target_minor:nextTarget,goal_source:'daily_reserve_auto',target_date:nextDate}:current);
        notifyGoalUpdated();
      }
    })();
    return()=>{cancelled=true};
  },[loading,goal?.id,goal?.goal_source,goal?.target_minor,goal?.target_date,reserveSuggestion.daily,reserveSuggestion.horizon,t]);

  const goalProgress=useMemo(()=>{
    if(!goal)return null;
    const today=localDateISO();
    const start=goal.period==='daily'?today:goal.period==='weekly'?weekStart():localMonthStartISO();
    const periodTx=tx.filter(x=>x.occurred_on>=start&&x.occurred_on<=today);
    const periodWork=work.filter(x=>x.worked_on>=start&&x.worked_on<=today);
    const periodBill=billPays.filter(x=>x.paid_on>=start&&x.paid_on<=today);
    const periodCard=cardPays.filter(x=>x.paid_on>=start&&x.paid_on<=today);
    const periodDebt=debtPays.filter(x=>x.paid_on>=start&&x.paid_on<=today);
    const income=periodTx.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0)+periodWork.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const out=
      periodTx.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0)+
      periodWork.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0)+
      periodBill.reduce((a,b)=>a+Number(b.amount_minor),0)+
      periodCard.reduce((a,b)=>a+Number(b.amount_minor),0);
    const workNet=periodWork.reduce((a,b)=>a+Number(b.gross_income_minor)-Number(b.energy_cost_minor)-Number(b.extra_work_cost_minor),0);
    const payoff=periodDebt.reduce((a,b)=>a+Number(b.amount_minor),0);
    const reservePeriodNet=reserveEntries.filter(e=>e.occurred_on>=start&&e.occurred_on<=today).reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0);
    const availableNet=Math.max(0,income-out-reservePeriodNet);
    const isDailyManaged=goal.goal_source==='daily_reserve_auto'||goal.goal_source==='daily_reserve_manual';
    const base=isDailyManaged
      ?availableNet
      :goal.basis==='operational_net'?workNet:goal.basis==='savings'?availableNet:goal.basis==='payoff'?payoff:income;
    const target=goal.goal_source==='daily_reserve_auto'?reserveSuggestion.daily:Number(goal.target_minor);
    if(target<=0)return null;
    return{base,target,percent:Math.min(100,Math.max(0,Math.round(base/Math.max(1,target)*100)))};
  },[goal,tx,work,billPays,cardPays,debtPays,reserveEntries,reserveSuggestion.daily]);

  if(loading)return <section className="panel dashboardLoading"><span className="loader"/></section>;

  const projectedStrip=<section className="projectedStrip"><div><small>{t('dashboard.projected')}</small><strong>{currency(projectedWithFuture)}</strong></div><span>{t('future.projectedHelp')}</span></section>;

  const isDailyAutoGoal=goal?.goal_source==='daily_reserve_auto';
  const isDailyManualGoal=goal?.goal_source==='daily_reserve_manual';
  const legacyDailyDeadline=goal?.name?.startsWith('__devinx_daily_reserve__:')?goal.name.split(':').slice(1).join(':'):'';
  const dailyReserveDeadline=(isDailyAutoGoal||isDailyManualGoal)?(goal?.target_date||legacyDailyDeadline):'';
  const goalTitle=isDailyAutoGoal
    ?t('dashboard.dailyGoalName')
    :isDailyManualGoal?t('dashboard.manualDailyGoalName')
    :goal?.name==='__devinx_default_goal__'?t('goals.defaultName'):goal?.name;

  return <div className="dashboardStack">
    {projectedHost&&createPortal(projectedStrip,projectedHost)}

    <div className="metricGrid dashboardMetrics">
      <article><small>{t('dashboard.entered')}</small><b>{currency(numbers.income)}</b></article>
      <article><small>{t('dashboard.spent')}</small><b>{currency(numbers.spent)}</b></article>
      <article className="dayResult"><small>{t('dashboard.dayBalance')}</small><b className={numbers.todayBalance>=0?'positive':'negative'}>{currency(numbers.todayBalance)}</b><span>+{currency(numbers.todayIncome)} · −{currency(numbers.todaySpent)}</span></article>
      <article><small>{t('dashboard.pending')}</small><b>{currency(pendingWithFuture)}</b><span>{currentFutureImpact.expectedIncome>0?t('future.expectedIncomeShort')+' +'+currency(currentFutureImpact.expectedIncome):t('future.includesPlanning')}</span></article>
    </div>

    <section className="panel premiumFlowPanel">
      <div className="premiumFlowHead">
        <div><small>{t('nav.reports')}</small><h2>{t('dashboard.entered')} × {t('dashboard.spent')}</h2></div>
        <div className="flowHeadTools">
          <label className="flowPeriodControl"><span>{t('dashboard.chartPeriod')}</span><select value={chartPeriod} onChange={e=>changeChartPeriod(e.target.value as ChartPeriod)}>
            <option value="3d">{t('dashboard.chart3d')}</option><option value="7d">{t('dashboard.chart7d')}</option><option value="1m">{t('dashboard.chart1m')}</option><option value="3m">{t('dashboard.chart3m')}</option><option value="6m">{t('dashboard.chart6m')}</option><option value="12m">{t('dashboard.chart12m')}</option>
          </select></label>
          <div className="flowLegend"><span className="in"><i/>{t('dashboard.entered')}</span><span className="out"><i/>{t('dashboard.spent')}</span></div>
        </div>
      </div>
      <div className={'cashFlowViewport period-'+chartPeriod}>
        <div className="cashFlowChart" aria-label={t('dashboard.entered')+' '+t('dashboard.spent')}>
          {flowChart.rows.map((row,index)=><button type="button" className={'flowDay '+(selectedFlowKey===row.key?'selected':'')} key={row.key} onClick={()=>setSelectedFlowKey(current=>current===row.key?'':row.key)} aria-pressed={selectedFlowKey===row.key}>
            <div className="flowBars">
              <i className="incomeBar" style={{height:(row.income>0?Math.max(3,Math.round(row.income/flowChart.max*100)):0)+'%'}} title={currency(row.income)}/>
              <i className="outBar" style={{height:(row.out>0?Math.max(3,Math.round(row.out/flowChart.max*100)):0)+'%'}} title={currency(row.out)}/>
            </div>
            <small>{index%flowChart.labelEvery===0||index===flowChart.rows.length-1?date(row.start,chartPeriod==='6m'||chartPeriod==='12m'?{month:'short'}:{day:'2-digit',month:'2-digit'}):'·'}</small>
          </button>)}
        </div>
      </div>
      {selectedFlowRow?<div className="flowSelection"><span>{date(selectedFlowRow.start,chartPeriod==='6m'||chartPeriod==='12m'?{month:'long',year:'numeric'}:{day:'2-digit',month:'short',year:'numeric'})}</span><b className="positive">+ {currency(selectedFlowRow.income)}</b><b>− {currency(selectedFlowRow.out)}</b></div>:<small className="flowTapHint">{t('dashboard.chartTap')}</small>}
    </section>

    <section className={'panel dailyReserveCard '+(reserveSuggestion.daily>0?'needsAction':'covered')+(!dailyGoalExpanded?' isCollapsed':'')}>
      <div className="dailyReserveTop">
        <div><small>{t('dashboard.dailyReserveEyebrow')}</small><h2>{reserveSuggestion.daily>0?t('dashboard.dailyReserveTitle'):t('dashboard.dailyReserveCovered')}</h2></div>
        <div className="collapsibleHeaderTools"><span>{date(reserveSuggestion.horizon,{day:'2-digit',month:'2-digit',year:'numeric'})}</span><button type="button" className="collapseToggle" onClick={toggleDailyGoal} aria-expanded={dailyGoalExpanded}>{dailyGoalExpanded?t('common.collapseSection'):t('common.expandSection')} <i>{dailyGoalExpanded?'⌃':'⌄'}</i></button></div>
      </div>

      {!dailyGoalExpanded&&<div className="collapsedGoalSummary"><span>{t('dashboard.perDay')}</span><b>{currency(reserveSuggestion.daily)}</b><small>{t('dashboard.criticalCheckpoint')} · {date(reserveSuggestion.criticalDeadline,{day:'2-digit',month:'2-digit'})}</small></div>}

      {dailyGoalExpanded&&<div className="collapsibleBody">
        <div className="dailyGoalModeTabs" role="tablist" aria-label={t('dashboard.dailyGoalMode')}>
          <button type="button" className={goalMode==='automatic'?'active':''} onClick={()=>setGoalMode('automatic')}>{t('dashboard.goalModeAuto')}</button>
          <button type="button" className={goalMode==='manual'?'active':''} onClick={()=>setGoalMode('manual')}>{t('dashboard.goalModeManual')}</button>
        </div>

        <div className="goalHorizonControl">
          <label><span>{t('dashboard.targetDateOptional')}</span><input type="date" min={localDateISO()} value={targetDraft} onChange={e=>setTargetDraft(e.target.value)}/></label>
          <button className="textButton" type="button" onClick={saveHorizon} disabled={goalSaving} aria-busy={goalSaving}>{goalSaving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('dashboard.applyDate')}</button>
          {goalTargetDate&&<button className="textButton dangerText" type="button" onClick={clearHorizon} disabled={goalSaving}>{t('dashboard.endOfMonth')}</button>}
        </div>

        {goalMode==='automatic'?<>
          <div className="dailyReserveGrid">
            <span><small>{t('dashboard.commitmentsUntilDate')}</small><b>{currency(reserveSuggestion.total)}</b></span>
            <span><small>{t('dashboard.cashAvailable')}</small><b className={numbers.balance>=0?'positive':'negative'}>{currency(numbers.balance)}</b></span>
            <span><small>{t('dashboard.reserveSeparated')}</small><b>{currency(reserveBalance)}</b></span>
            <span><small>{t('future.expectedIncome')}</small><b className="positive">{currency(reserveSuggestion.expectedIncome)}</b></span>
            <span className="dailyTarget"><small>{t('dashboard.perDay')}</small><b>{currency(reserveSuggestion.daily)}</b></span>
          </div>

          <div className="dailyCheckpoint">
            <span>{t('dashboard.criticalCheckpoint')}</span>
            <b>{date(reserveSuggestion.criticalDeadline,{day:'2-digit',month:'2-digit',year:'numeric'})}</b>
            <small>{t('dashboard.criticalCheckpointHelp')}</small>
          </div>

          <p>{reserveSuggestion.daily>0?t('dashboard.dailyReserveExplainAdvanced'):t('dashboard.dailyReserveCoveredHelp')}</p>
          {reserveSuggestion.daily>0&&<button className="primary dailyGoalButton" onClick={useDailyGoal} disabled={goalSaving} aria-busy={goalSaving}>{goalSaving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('dashboard.useDailyGoal')}</button>}
        </>:<>
          <div className="manualDailyGoal">
            <label><span>{t('dashboard.manualDailyValue')}</span><input value={manualDailyTarget} onChange={e=>setManualDailyTarget(e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
            <div><small>{t('dashboard.autoReference')}</small><b>{currency(reserveSuggestion.daily)}</b></div>
          </div>
          <p>{t('dashboard.manualDailyHelp')}</p>
          <button className="primary dailyGoalButton" onClick={useManualDailyGoal} disabled={moneyMinor(manualDailyTarget)<=0||goalSaving} aria-busy={goalSaving}>{goalSaving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('dashboard.useManualDailyGoal')}</button>
        </>}

        {goalNotice&&<div className="authMessage">{goalNotice}</div>}
      </div>}
    </section>

    {reserveBalance>0&&<section className="reserveHomeNote"><span>◇</span><div><small>{t('nav.reserves')}</small><b>{currency(reserveBalance)}</b></div><p>{futureCommittedReserve>0?t('future.reserveHomeCommitted')+' '+currency(futureCommittedReserve):t('dashboard.reserveSeparatedHelp')}</p></section>}

    {goal&&goalProgress&&<section className="panel goalPanel"><div className="sectionTitleRow"><div><small>{t('dashboard.goal')}</small><h2>{goalTitle}</h2>{dailyReserveDeadline&&<span className="goalDeadline">{t('dashboard.untilDate')} {date(dailyReserveDeadline,{day:'2-digit',month:'2-digit',year:'numeric'})}</span>}</div><div className="goalRing" style={{background:'conic-gradient(#edc55e '+goalProgress.percent+'%, rgba(255,255,255,.08) 0)'}}><div className="goalRingInner"><small>{t('dashboard.todayGoal')}</small><strong>{goalProgress.percent}%</strong></div></div></div><div className="bar"><i style={{width:String(goalProgress.percent)+'%'}}/></div><p className="lead">{currency(goalProgress.base)} / {currency(goalProgress.target)}</p></section>}

    <section className="panel commitmentsPanel">
      <div className="sectionTitleRow commitmentsTitleRow"><div><small>{t('dashboard.commitments')}</small><h2>{t('dashboard.stillWeighs')}</h2></div><label className="commitmentMonthPicker"><span>{t('common.month')}</span><input type="month" min={localMonthStartISO().slice(0,7)} value={commitmentMonth.slice(0,7)} onChange={e=>setCommitmentMonth((e.target.value||localMonthStartISO().slice(0,7))+'-01')}/></label></div>
      <div className="commitmentDouble futureCommitmentGrid">
        <article><span>{t('dashboard.monthlyBills')}</span><b>{currency(selectedCommitments.recurringPending)}</b></article>
        <article><span>{t('dashboard.cards')}</span><b>{currency(selectedCommitments.cardsDue)}</b></article>
        <article><span>{t('future.planningNeed')}</span><b>{currency(selectedCommitments.futureNeed)}</b></article>
        <article className="futureIncomeCommitment"><span>{t('future.expectedIncome')}</span><b className="positive">+ {currency(selectedCommitments.expectedIncome)}</b></article>
      </div>
      <div className="commitmentMonthTotal"><span>{t('future.netMonthlyNeed')}</span><strong>{currency(selectedCommitments.total)}</strong><small>{t('future.grossCommitments')} {currency(selectedCommitments.gross)}</small></div>
    </section>

    {numbers.income===0&&numbers.spent===0&&<section className="empty premiumEmpty"><b>{t('dashboard.emptyTitle')}</b><p>{t('dashboard.emptyText')}</p></section>}
  </div>;
}
