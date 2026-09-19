'use client';

import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

type Tx={type:'income'|'expense';amount_minor:number;occurred_on:string;is_avoidable:boolean};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;worked_on:string};
type Goal={name:string;target_minor:number;basis:string;period:string};
type Bill={id:string;amount_minor:number;due_day:number;created_at:string;is_avoidable:boolean};
type BillPay={recurring_bill_id:string;amount_minor:number;due_month:string;paid_on:string};
type CardInst={amount_minor:number;billing_month:string;due_date:string|null;paid_at:string|null};
type CardPay={amount_minor:number;paid_on:string};
type Debt={id:string;installment_minor:number|null;outstanding_minor:number;due_day:number|null};
type DebtPay={debt_id:string;amount_minor:number;paid_on:string};

function daysAgo(days:number){const d=new Date();d.setDate(d.getDate()-days);return localDateISO(d)}
function weekStart(){
  const d=new Date();const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return localDateISO(d);
}
function addMonths(iso:string,count:number){const d=new Date(iso+'T12:00:00');d.setMonth(d.getMonth()+count);return localDateISO(new Date(d.getFullYear(),d.getMonth(),1))}

export function DashboardOverview(){
  const{t,currency,date}=useI18n();
  const[tx,setTx]=useState<Tx[]>([]);const[work,setWork]=useState<Work[]>([]);const[goal,setGoal]=useState<Goal|null>(null);
  const[bills,setBills]=useState<Bill[]>([]);const[billPays,setBillPays]=useState<BillPay[]>([]);
  const[cardInst,setCardInst]=useState<CardInst[]>([]);const[cardPays,setCardPays]=useState<CardPay[]>([]);
  const[debts,setDebts]=useState<Debt[]>([]);const[debtPays,setDebtPays]=useState<DebtPay[]>([]);
  const[loading,setLoading]=useState(true);const[projectedHost,setProjectedHost]=useState<HTMLElement|null>(null);const[goalNotice,setGoalNotice]=useState('');

  async function load(show=false){
    if(show)setLoading(true);
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.replace('/entrar');return}
    const from=daysAgo(45);const current=localMonthStartISO();const recurringFrom=addMonths(current,-12);
    const[rTx,rWork,rGoal,rBills,rBillPay,rInst,rCardPay,rDebt,rDebtPay]=await Promise.all([
      s.from('transactions').select('type,amount_minor,occurred_on,is_avoidable').eq('user_id',user.id).gte('occurred_on',from),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on').eq('user_id',user.id).gte('worked_on',from),
      s.from('goals').select('name,target_minor,basis,period').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1),
      s.from('recurring_bills').select('id,amount_minor,due_day,created_at,is_avoidable').eq('user_id',user.id).eq('is_active',true),
      s.from('recurring_bill_payments').select('recurring_bill_id,amount_minor,due_month,paid_on').eq('user_id',user.id).gte('due_month',recurringFrom),
      s.from('card_installments').select('amount_minor,billing_month,due_date,paid_at').eq('user_id',user.id).is('paid_at',null),
      s.from('card_bill_payments').select('amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from),
      s.from('debts').select('id,installment_minor,outstanding_minor,due_day').eq('user_id',user.id).eq('is_active',true),
      s.from('debt_payments').select('debt_id,amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from)
    ]);
    setTx((rTx.data||[]) as Tx[]);setWork((rWork.data||[]) as Work[]);setGoal(((rGoal.data||[])[0]||null) as Goal|null);
    setBills((rBills.data||[]) as Bill[]);setBillPays((rBillPay.data||[]) as BillPay[]);setCardInst((rInst.data||[]) as CardInst[]);
    setCardPays((rCardPay.data||[]) as CardPay[]);setDebts((rDebt.data||[]) as Debt[]);setDebtPays((rDebtPay.data||[]) as DebtPay[]);
    setLoading(false);
  }
  useEffect(()=>{load(true);setProjectedHost(document.getElementById('home-projected-slot'));const refresh=()=>load(false);window.addEventListener('devinx:finance-updated',refresh);return()=>window.removeEventListener('devinx:finance-updated',refresh)},[]);

  const numbers=useMemo(()=>{
    const today=localDateISO();const month=localMonthStartISO();
    const txMonth=tx.filter(x=>x.occurred_on>=month),workMonth=work.filter(x=>x.worked_on>=month),billPayMonth=billPays.filter(x=>x.paid_on>=month),cardPayMonth=cardPays.filter(x=>x.paid_on>=month);
    const manualIncome=txMonth.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0);
    const manualExpense=txMonth.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0);
    const workGross=workMonth.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const workCost=workMonth.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0);
    const recurringSpent=billPayMonth.reduce((a,b)=>a+Number(b.amount_minor),0);
    const cardSpent=cardPayMonth.reduce((a,b)=>a+Number(b.amount_minor),0);
    const income=manualIncome+workGross;
    const spent=manualExpense+workCost+recurringSpent+cardSpent;
    const balance=income-spent;

    const todayIncome=tx.filter(x=>x.occurred_on===today&&x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0)+work.filter(x=>x.worked_on===today).reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const todaySpent=tx.filter(x=>x.occurred_on===today&&x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0)+work.filter(x=>x.worked_on===today).reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0)+billPays.filter(x=>x.paid_on===today).reduce((a,b)=>a+Number(b.amount_minor),0)+cardPays.filter(x=>x.paid_on===today).reduce((a,b)=>a+Number(b.amount_minor),0);

    const paidMonths=new Set(billPays.map(p=>p.recurring_bill_id+'|'+p.due_month.slice(0,7)));
    let recurringPending=0;
    for(const bill of bills){
      const createdMonth=bill.created_at.slice(0,7)+'-01';
      const key=bill.id+'|'+month.slice(0,7);
      if(createdMonth<=month&&!paidMonths.has(key))recurringPending+=Number(bill.amount_minor);
    }
    const cardsDueNow=cardInst.filter(i=>(i.due_date||i.billing_month).slice(0,7)+'-01'===month).reduce((a,b)=>a+Number(b.amount_minor),0);
    const cardTotalOpen=cardInst.reduce((a,b)=>a+Number(b.amount_minor),0);
    const debtPaidMap=new Map<string,number>();debtPays.filter(p=>p.paid_on>=month).forEach(p=>debtPaidMap.set(p.debt_id,(debtPaidMap.get(p.debt_id)||0)+Number(p.amount_minor)));
    const debtPending=debts.reduce((sum,d)=>sum+Math.max(0,Math.min(Number(d.installment_minor||d.outstanding_minor),Number(d.outstanding_minor))-(debtPaidMap.get(d.id)||0)),0);
    const projected=balance-recurringPending-cardsDueNow-debtPending;
    const avoidable=txMonth.filter(x=>x.type==='expense'&&x.is_avoidable).reduce((a,b)=>a+Number(b.amount_minor),0);

    return{income,spent,balance,todayIncome,todaySpent,todayBalance:todayIncome-todaySpent,recurringPending,cardsDueNow,cardTotalOpen,debtPending,toPay:recurringPending+cardsDueNow+debtPending,projected,avoidable};
  },[tx,work,bills,billPays,cardInst,cardPays,debts,debtPays]);

  const reserveSuggestion=useMemo(()=>{
    const today=localDateISO();
    const month=localMonthStartISO();
    const monthEnd=(()=>{const d=new Date(month+'T12:00:00');return localDateISO(new Date(d.getFullYear(),d.getMonth()+1,0))})();
    const dueInMonth=(day:number|null)=>{
      if(!day)return monthEnd;
      const d=new Date(month+'T12:00:00');const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
      return localDateISO(new Date(d.getFullYear(),d.getMonth(),Math.min(Math.max(day,1),last)));
    };
    const paidMonths=new Set(billPays.map(p=>p.recurring_bill_id+'|'+p.due_month.slice(0,7)));
    const obligations:{due:string;amount:number}[]=[];
    for(const bill of bills){
      const createdMonth=bill.created_at.slice(0,7)+'-01';
      const key=bill.id+'|'+month.slice(0,7);
      if(createdMonth<=month&&!paidMonths.has(key))obligations.push({due:dueInMonth(bill.due_day),amount:Number(bill.amount_minor)});
    }
    for(const inst of cardInst){
      const due=inst.due_date||inst.billing_month;
      if(due.slice(0,7)+'-01'<=month)obligations.push({due:due<today?today:due,amount:Number(inst.amount_minor)});
    }
    const debtPaidMap=new Map<string,number>();
    debtPays.filter(p=>p.paid_on>=month).forEach(p=>debtPaidMap.set(p.debt_id,(debtPaidMap.get(p.debt_id)||0)+Number(p.amount_minor)));
    for(const debt of debts){
      const pending=Math.max(0,Math.min(Number(debt.installment_minor||debt.outstanding_minor),Number(debt.outstanding_minor))-(debtPaidMap.get(debt.id)||0));
      if(pending>0)obligations.push({due:dueInMonth(debt.due_day),amount:pending});
    }
    if(obligations.length===0)return null;
    obligations.sort((a,b)=>a.due.localeCompare(b.due));
    const grouped=new Map<string,number>();
    for(const item of obligations)grouped.set(item.due,(grouped.get(item.due)||0)+item.amount);
    let cumulative=0;
    let chosen:{deadline:string;due:number;gap:number}|null=null;
    for(const [due,amount] of [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
      cumulative+=amount;
      const gap=Math.max(0,cumulative-numbers.balance);
      if(gap>0){chosen={deadline:due<today?today:due,due:cumulative,gap};break}
    }
    if(!chosen){
      const last=[...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0])).at(-1)!;
      cumulative=[...grouped.values()].reduce((a,b)=>a+b,0);
      chosen={deadline:last[0],due:cumulative,gap:0};
    }
    const start=new Date(today+'T12:00:00');const end=new Date(chosen.deadline+'T12:00:00');
    const days=Math.max(1,Math.floor((end.getTime()-start.getTime())/86400000)+1);
    const daily=chosen.gap>0?Math.ceil(chosen.gap/days):0;
    return{...chosen,days,daily,monthTotal:obligations.reduce((a,b)=>a+b.amount,0)};
  },[bills,billPays,cardInst,debts,debtPays,numbers.balance]);

  async function useDailyGoal(){
    if(!reserveSuggestion||reserveSuggestion.daily<=0)return;
    if(goal&&!confirm(t('dashboard.dailyGoalConfirm')))return;
    const s=createClient();
    const{error}=await s.rpc('replace_active_goal',{
      p_name:'__devinx_daily_reserve__:'+reserveSuggestion.deadline,
      p_period:'daily',
      p_basis:'savings',
      p_target_minor:reserveSuggestion.daily
    });
    if(error){setGoalNotice(t('common.errorSave'));return}
    setGoalNotice(t('dashboard.dailyGoalSaved'));
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load(false);
  }

  const goalProgress=useMemo(()=>{
    if(!goal)return null;
    const today=localDateISO();const start=goal.period==='daily'?today:goal.period==='weekly'?weekStart():localMonthStartISO();
    const periodTx=tx.filter(x=>x.occurred_on>=start&&x.occurred_on<=today);
    const periodWork=work.filter(x=>x.worked_on>=start&&x.worked_on<=today);
    const periodBill=billPays.filter(x=>x.paid_on>=start&&x.paid_on<=today);
    const periodCard=cardPays.filter(x=>x.paid_on>=start&&x.paid_on<=today);
    const periodDebt=debtPays.filter(x=>x.paid_on>=start&&x.paid_on<=today);
    const income=periodTx.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0)+periodWork.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const out=periodTx.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0)+periodWork.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0)+periodBill.reduce((a,b)=>a+Number(b.amount_minor),0)+periodCard.reduce((a,b)=>a+Number(b.amount_minor),0);
    const workNet=periodWork.reduce((a,b)=>a+Number(b.gross_income_minor)-Number(b.energy_cost_minor)-Number(b.extra_work_cost_minor),0);
    const payoff=periodDebt.reduce((a,b)=>a+Number(b.amount_minor),0);
    const base=goal.basis==='operational_net'?workNet:goal.basis==='savings'?Math.max(0,income-out):goal.basis==='payoff'?payoff:income;
    return{base,percent:Math.min(100,Math.max(0,Math.round(base/Math.max(1,Number(goal.target_minor))*100)))};
  },[goal,tx,work,billPays,cardPays,debtPays]);

  if(loading)return <section className="panel dashboardLoading"><span className="loader"/></section>;

  const projectedStrip=<section className="projectedStrip"><div><small>{t('dashboard.projected')}</small><strong>{currency(numbers.projected)}</strong></div><span>{t('dashboard.projectedHelp')}</span></section>;

  const goalTitle=goal?.name?.startsWith('__devinx_daily_reserve__:')
    ?t('dashboard.dailyGoalName')+' · '+date(goal.name.split(':').slice(1).join(':'),{day:'2-digit',month:'2-digit'})
    :goal?.name==='__devinx_default_goal__'?t('goals.defaultName'):goal?.name;

  return <div className="dashboardStack">
    {projectedHost&&createPortal(projectedStrip,projectedHost)}
    <div className="metricGrid dashboardMetrics"><article><small>{t('dashboard.entered')}</small><b>{currency(numbers.income)}</b></article><article><small>{t('dashboard.spent')}</small><b>{currency(numbers.spent)}</b></article><article className="dayResult"><small>{t('dashboard.dayBalance')}</small><b className={numbers.todayBalance>=0?'positive':'negative'}>{currency(numbers.todayBalance)}</b><span>+{currency(numbers.todayIncome)} · −{currency(numbers.todaySpent)}</span></article><article><small>{t('dashboard.pending')}</small><b>{currency(numbers.toPay)}</b></article></div>
    {reserveSuggestion&&<section className={'panel dailyReserveCard '+(reserveSuggestion.daily>0?'needsAction':'covered')}>
      <div className="dailyReserveTop"><div><small>{t('dashboard.dailyReserveEyebrow')}</small><h2>{reserveSuggestion.daily>0?t('dashboard.dailyReserveTitle'):t('dashboard.dailyReserveCovered')}</h2></div><span>{date(reserveSuggestion.deadline,{day:'2-digit',month:'2-digit'})}</span></div>
      <div className="dailyReserveGrid">
        <span><small>{t('dashboard.monthCommitments')}</small><b>{currency(reserveSuggestion.monthTotal)}</b></span>
        <span><small>{t('dashboard.cashAvailable')}</small><b className={numbers.balance>=0?'positive':'negative'}>{currency(numbers.balance)}</b></span>
        <span><small>{t('dashboard.needUntilDate')}</small><b>{currency(reserveSuggestion.gap)}</b></span>
        <span className="dailyTarget"><small>{t('dashboard.perDay')}</small><b>{currency(reserveSuggestion.daily)}</b></span>
      </div>
      <p>{reserveSuggestion.daily>0?t('dashboard.dailyReserveExplain'):t('dashboard.dailyReserveCoveredHelp')}</p>
      {reserveSuggestion.daily>0&&<button className="goldOutline dailyGoalButton" onClick={useDailyGoal}>{t('dashboard.useDailyGoal')}</button>}
      {goalNotice&&<div className="authMessage">{goalNotice}</div>}
    </section>}
    {goal&&goalProgress&&<section className="panel goalPanel"><div className="sectionTitleRow"><div><small>{t('dashboard.goal')}</small><h2>{goalTitle}</h2></div><strong>{goalProgress.percent}%</strong></div><div className="bar"><i style={{width:String(goalProgress.percent)+'%'}}/></div><p className="lead">{currency(goalProgress.base)} / {currency(Number(goal.target_minor))}</p></section>}
    <section className="panel commitmentsPanel"><div className="sectionTitleRow"><div><small>{t('dashboard.commitments')}</small><h2>{t('dashboard.stillWeighs')}</h2></div><span className="statusBadge">{t('dashboard.currentMonthOnly')}</span></div><div className="commitmentTriple"><article><span>{t('dashboard.monthlyBills')}</span><b>{currency(numbers.recurringPending)}</b></article><article><span>{t('dashboard.otherDebts')}</span><b>{currency(numbers.debtPending)}</b></article><article><span>{t('dashboard.cards')}</span><b>{currency(numbers.cardsDueNow)}</b><small>{t('cards.totalOpen')}: {currency(numbers.cardTotalOpen)}</small></article></div></section>
    {numbers.income===0&&numbers.spent===0&&<section className="empty premiumEmpty"><b>{t('dashboard.emptyTitle')}</b><p>{t('dashboard.emptyText')}</p></section>}
  </div>;
}
