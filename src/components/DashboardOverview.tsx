'use client';

import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {
  RecurringBillLike,RecurringOverrideLike,RecurringPaymentLike,
  billAppliesToMonth,billRemaining,billDueDay,dueDateForMonth,monthsBetween
} from '@/domain/recurring';
import {useI18n} from '@/i18n/provider';

type Tx={type:'income'|'expense';amount_minor:number;occurred_on:string;is_avoidable:boolean};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;worked_on:string};
type Goal={id:string;name:string;target_minor:number;basis:string;period:string;goal_source:'manual'|'daily_reserve_auto'|'daily_reserve_manual';target_date:string|null};
type Bill=RecurringBillLike&{created_at:string;is_avoidable:boolean};
type BillPay=RecurringPaymentLike&{paid_on:string};
type BillOverride=RecurringOverrideLike;
type CardInst={amount_minor:number;billing_month:string;due_date:string|null;paid_at:string|null};
type CardPay={amount_minor:number;paid_on:string};
type DebtPay={debt_id:string;amount_minor:number;paid_on:string};
type ReserveEntry={kind:'deposit'|'withdraw';amount_minor:number;occurred_on:string};

function daysAgo(days:number){const d=new Date();d.setDate(d.getDate()-days);return localDateISO(d)}
function weekStart(){
  const d=new Date();const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return localDateISO(d);
}
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
  const[goalTargetDate,setGoalTargetDate]=useState('');
  const[targetDraft,setTargetDraft]=useState('');
  const[loading,setLoading]=useState(true);
  const[projectedHost,setProjectedHost]=useState<HTMLElement|null>(null);
  const[goalNotice,setGoalNotice]=useState('');
  const[commitmentMonth,setCommitmentMonth]=useState(localMonthStartISO());
  const[dailyGoalExpanded,setDailyGoalExpanded]=useState(true);
  const[goalMode,setGoalMode]=useState<'automatic'|'manual'>('automatic');
  const[manualDailyTarget,setManualDailyTarget]=useState('');

  async function load(show=false){
    if(show)setLoading(true);
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.replace('/entrar');return}
    const from=daysAgo(45);
    const[rTx,rWork,rGoal,rBills,rBillPay,rBillOverrides,rInst,rCardPay,rDebtPay,rReserve,rProfile]=await Promise.all([
      s.from('transactions').select('type,amount_minor,occurred_on,is_avoidable').eq('user_id',user.id).gte('occurred_on',from),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on').eq('user_id',user.id).gte('worked_on',from),
      s.from('goals').select('id,name,target_minor,basis,period,goal_source,target_date').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1),
      s.from('recurring_bills').select('id,amount_minor,due_day,start_month,installment_count,created_at,is_avoidable').eq('user_id',user.id).eq('is_active',true),
      s.from('recurring_bill_payments').select('recurring_bill_id,amount_minor,due_month,paid_on').eq('user_id',user.id),
      s.from('recurring_bill_month_overrides').select('recurring_bill_id,due_month,amount_minor,due_day').eq('user_id',user.id),
      s.from('card_installments').select('amount_minor,billing_month,due_date,paid_at').eq('user_id',user.id).is('paid_at',null),
      s.from('card_bill_payments').select('amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from),
      s.from('debt_payments').select('debt_id,amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from),
      s.from('reserve_entries').select('kind,amount_minor,occurred_on').eq('user_id',user.id),
      s.from('profiles').select('daily_goal_target_date').eq('id',user.id).maybeSingle()
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
    const saved=(rProfile.data as any)?.daily_goal_target_date||'';
    setGoalTargetDate(saved);
    setTargetDraft(saved);
    setLoading(false);
  }

  useEffect(()=>{try{const saved=localStorage.getItem('devinx_daily_goal_expanded');if(saved!==null)setDailyGoalExpanded(saved==='1')}catch{}},[]);
  function toggleDailyGoal(){setDailyGoalExpanded(current=>{const next=!current;try{localStorage.setItem('devinx_daily_goal_expanded',next?'1':'0')}catch{}return next})}

  useEffect(()=>{
    load(true);
    setProjectedHost(document.getElementById('home-projected-slot'));
    const refresh=()=>load(false);
    window.addEventListener('devinx:finance-updated',refresh);
    return()=>window.removeEventListener('devinx:finance-updated',refresh);
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

    return{recurringPending,cardsDue,total:recurringPending+cardsDue};
  },[commitmentMonth,bills,billPays,billOverrides,cardInst]);

  const flowChart=useMemo(()=>{
    const days=Array.from({length:14},(_,index)=>daysAgo(13-index));
    const map=new Map(days.map(day=>[day,{day,income:0,out:0}]));
    tx.forEach(item=>{const row=map.get(item.occurred_on);if(!row)return;if(item.type==='income')row.income+=Number(item.amount_minor);else row.out+=Number(item.amount_minor)});
    work.forEach(item=>{const row=map.get(item.worked_on);if(!row)return;row.income+=Number(item.gross_income_minor);row.out+=Number(item.energy_cost_minor)+Number(item.extra_work_cost_minor)});
    billPays.forEach(item=>{const row=map.get(item.paid_on);if(row)row.out+=Number(item.amount_minor)});
    cardPays.forEach(item=>{const row=map.get(item.paid_on);if(row)row.out+=Number(item.amount_minor)});
    const rows=[...map.values()];
    const max=Math.max(1,...rows.flatMap(row=>[row.income,row.out]));
    return{rows,max};
  },[tx,work,billPays,cardPays]);

  const commitmentShare=selectedCommitments.total>0
    ?Math.round(selectedCommitments.recurringPending/selectedCommitments.total*100)
    :0;

  const reserveSuggestion=useMemo(()=>{
    const today=localDateISO();
    const month=localMonthStartISO();
    const fallbackHorizon=monthEnd(month);
    const horizon=goalTargetDate&&goalTargetDate>=today?goalTargetDate:fallbackHorizon;
    const horizonMonth=horizon.slice(0,7)+'-01';
    const obligations:{due:string;amount:number;kind:'bill'|'card'}[]=[];

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

    obligations.sort((a,b)=>a.due.localeCompare(b.due));
    const grouped=new Map<string,number>();
    for(const item of obligations)grouped.set(item.due,(grouped.get(item.due)||0)+item.amount);

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
    const total=obligations.reduce((sum,o)=>sum+o.amount,0);
    const gap=Math.max(0,total-planningCash);
    return{
      horizon,
      criticalDeadline,
      criticalGap,
      daily,
      total,
      gap,
      days:daysInclusive(today,horizon),
      hasCustomHorizon:!!goalTargetDate&&goalTargetDate>=today
    };
  },[goalTargetDate,bills,billPays,billOverrides,cardInst,numbers.balance]);

  async function saveHorizon(){
    if(targetDraft&&targetDraft<localDateISO()){setGoalNotice(t('dashboard.futureDateError'));return}
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
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
  }

  async function clearHorizon(){
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
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
  }

  async function useDailyGoal(){
    if(reserveSuggestion.daily<=0)return;
    if(goal&&!confirm(t('dashboard.dailyGoalConfirm')))return;
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
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load(false);
  }

  async function useManualDailyGoal(){
    const value=moneyMinor(manualDailyTarget);
    if(value<=0)return;
    const today=localDateISO();
    if(targetDraft&&targetDraft<today){setGoalNotice(t('dashboard.futureDateError'));return}
    if(goal&&!confirm(t('dashboard.dailyGoalConfirm')))return;
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
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load(false);
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
    const isDailyManaged=goal.goal_source==='daily_reserve_auto'||goal.goal_source==='daily_reserve_manual';
    const base=isDailyManaged
      ?Math.max(0,income-out)
      :goal.basis==='operational_net'?workNet:goal.basis==='savings'?Math.max(0,income-out-reservePeriodNet):goal.basis==='payoff'?payoff:income;
    const target=goal.goal_source==='daily_reserve_auto'?reserveSuggestion.daily:Number(goal.target_minor);
    if(target<=0)return null;
    return{base,target,percent:Math.min(100,Math.max(0,Math.round(base/Math.max(1,target)*100)))};
  },[goal,tx,work,billPays,cardPays,debtPays,reserveEntries,reserveSuggestion.daily]);

  if(loading)return <section className="panel dashboardLoading"><span className="loader"/></section>;

  const projectedStrip=<section className="projectedStrip"><div><small>{t('dashboard.projected')}</small><strong>{currency(numbers.projected)}</strong></div><span>{t('dashboard.projectedHelp')}</span></section>;

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
      <article><small>{t('dashboard.pending')}</small><b>{currency(numbers.toPay)}</b></article>
    </div>

    <section className="panel premiumFlowPanel">
      <div className="premiumFlowHead">
        <div><small>14D · {t('nav.reports')}</small><h2>{t('dashboard.entered')} × {t('dashboard.spent')}</h2></div>
        <div className="flowLegend"><span className="in"><i/>{t('dashboard.entered')}</span><span className="out"><i/>{t('dashboard.spent')}</span></div>
      </div>
      <div className="cashFlowChart" aria-label={t('dashboard.entered')+' '+t('dashboard.spent')}>
        {flowChart.rows.map((row,index)=><div className="flowDay" key={row.day}>
          <div className="flowBars">
            <i className="incomeBar" style={{height:Math.max(3,Math.round(row.income/flowChart.max*100))+'%'}} title={currency(row.income)}/>
            <i className="outBar" style={{height:Math.max(3,Math.round(row.out/flowChart.max*100))+'%'}} title={currency(row.out)}/>
          </div>
          <small>{index%2===0?date(row.day,{day:'2-digit',month:'2-digit'}):'·'}</small>
        </div>)}
      </div>
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
          <button className="textButton" type="button" onClick={saveHorizon}>{t('dashboard.applyDate')}</button>
          {goalTargetDate&&<button className="textButton dangerText" type="button" onClick={clearHorizon}>{t('dashboard.endOfMonth')}</button>}
        </div>

        {goalMode==='automatic'?<>
          <div className="dailyReserveGrid">
            <span><small>{t('dashboard.commitmentsUntilDate')}</small><b>{currency(reserveSuggestion.total)}</b></span>
            <span><small>{t('dashboard.cashAvailable')}</small><b className={numbers.balance>=0?'positive':'negative'}>{currency(numbers.balance)}</b></span>
            <span><small>{t('dashboard.reserveSeparated')}</small><b>{currency(reserveBalance)}</b></span>
            <span className="dailyTarget"><small>{t('dashboard.perDay')}</small><b>{currency(reserveSuggestion.daily)}</b></span>
          </div>

          <div className="dailyCheckpoint">
            <span>{t('dashboard.criticalCheckpoint')}</span>
            <b>{date(reserveSuggestion.criticalDeadline,{day:'2-digit',month:'2-digit',year:'numeric'})}</b>
            <small>{t('dashboard.criticalCheckpointHelp')}</small>
          </div>

          <p>{reserveSuggestion.daily>0?t('dashboard.dailyReserveExplainAdvanced'):t('dashboard.dailyReserveCoveredHelp')}</p>
          {reserveSuggestion.daily>0&&<button className="primary dailyGoalButton" onClick={useDailyGoal}>{t('dashboard.useDailyGoal')}</button>}
        </>:<>
          <div className="manualDailyGoal">
            <label><span>{t('dashboard.manualDailyValue')}</span><input value={manualDailyTarget} onChange={e=>setManualDailyTarget(e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
            <div><small>{t('dashboard.autoReference')}</small><b>{currency(reserveSuggestion.daily)}</b></div>
          </div>
          <p>{t('dashboard.manualDailyHelp')}</p>
          <button className="primary dailyGoalButton" onClick={useManualDailyGoal} disabled={moneyMinor(manualDailyTarget)<=0}>{t('dashboard.useManualDailyGoal')}</button>
        </>}

        {goalNotice&&<div className="authMessage">{goalNotice}</div>}
      </div>}
    </section>

    {reserveBalance>0&&<section className="reserveHomeNote"><span>◇</span><div><small>{t('nav.reserves')}</small><b>{currency(reserveBalance)}</b></div><p>{t('dashboard.reserveSeparatedHelp')}</p></section>}

    {goal&&goalProgress&&<section className="panel goalPanel"><div className="sectionTitleRow"><div><small>{t('dashboard.goal')}</small><h2>{goalTitle}</h2>{dailyReserveDeadline&&<span className="goalDeadline">{t('dashboard.untilDate')} {date(dailyReserveDeadline,{day:'2-digit',month:'2-digit',year:'numeric'})}</span>}</div><div className="goalRing" style={{background:'conic-gradient(#edc55e '+goalProgress.percent+'%, rgba(255,255,255,.08) 0)'}}><div className="goalRingInner"><small>{t('dashboard.todayGoal')}</small><strong>{goalProgress.percent}%</strong></div></div></div><div className="bar"><i style={{width:String(goalProgress.percent)+'%'}}/></div><p className="lead">{currency(goalProgress.base)} / {currency(goalProgress.target)}</p></section>}

    <section className="panel commitmentsPanel">
      <div className="sectionTitleRow commitmentsTitleRow"><div><small>{t('dashboard.commitments')}</small><h2>{t('dashboard.stillWeighs')}</h2></div><label className="commitmentMonthPicker"><span>{t('common.month')}</span><input type="month" min={localMonthStartISO().slice(0,7)} value={commitmentMonth.slice(0,7)} onChange={e=>setCommitmentMonth((e.target.value||localMonthStartISO().slice(0,7))+'-01')}/></label></div>
      <div className="commitmentDouble">
        <article><span>{t('dashboard.monthlyBills')}</span><b>{currency(selectedCommitments.recurringPending)}</b></article>
        <article><span>{t('dashboard.cards')}</span><b>{currency(selectedCommitments.cardsDue)}</b></article>
      </div>
      <div className="commitmentComposition">
        <div className="commitmentCompositionBar"><i style={{width:commitmentShare+'%'}}/><i style={{width:(100-commitmentShare)+'%'}}/></div>
        <div className="commitmentCompositionLegend"><span>{t('dashboard.monthlyBills')} · {currency(selectedCommitments.recurringPending)}</span><span>{t('dashboard.cards')} · {currency(selectedCommitments.cardsDue)}</span></div>
      </div>
      <div className="commitmentMonthTotal"><span>{t('dashboard.monthCommitmentTotal')}</span><strong>{currency(selectedCommitments.total)}</strong></div>
    </section>

    {numbers.income===0&&numbers.spent===0&&<section className="empty premiumEmpty"><b>{t('dashboard.emptyTitle')}</b><p>{t('dashboard.emptyText')}</p></section>}
  </div>;
}
