'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {PanelLauncher} from '@/components/PanelLauncher';
import {localMonthEndISO,localMonthStartISO} from '@/lib/date';

type Tx={type:'income'|'expense';amount_minor:number;is_avoidable:boolean};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number};
type Goal={name:string;target_minor:number;basis:string};
type Bill={id:string;amount_minor:number;is_avoidable:boolean};
type Payment={recurring_bill_id:string;amount_minor:number};
type Installment={amount_minor:number;paid_at:string|null;card_purchases:{is_avoidable:boolean}|null};
type Debt={id:string;installment_minor:number|null;outstanding_minor:number};
type DebtPayment={debt_id:string;amount_minor:number};

const brl=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);

export function DashboardOverview(){
  const{messages:m}=useI18n();
  const[tx,setTx]=useState<Tx[]>([]);
  const[work,setWork]=useState<Work[]>([]);
  const[goals,setGoals]=useState<Goal[]>([]);
  const[bills,setBills]=useState<Bill[]>([]);
  const[payments,setPayments]=useState<Payment[]>([]);
  const[installments,setInstallments]=useState<Installment[]>([]);
  const[debts,setDebts]=useState<Debt[]>([]);
  const[debtPayments,setDebtPayments]=useState<DebtPayment[]>([]);
  const[loading,setLoading]=useState(true);

  async function load(showLoading=false){
    if(showLoading)setLoading(true);
    const supabase=createClient();
    const{data:{user}}=await supabase.auth.getUser();
    if(!user){location.replace('/entrar');return}
    const start=localMonthStartISO();
    const end=localMonthEndISO();
    const[t,w,g,b,p,i,d,dp]=await Promise.all([
      supabase.from('transactions').select('type,amount_minor,is_avoidable').eq('user_id',user.id).gte('occurred_on',start).lte('occurred_on',end),
      supabase.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor').eq('user_id',user.id).gte('worked_on',start).lte('worked_on',end),
      supabase.from('goals').select('name,target_minor,basis').eq('user_id',user.id).eq('is_active',true).limit(1),
      supabase.from('recurring_bills').select('id,amount_minor,is_avoidable').eq('user_id',user.id).eq('is_active',true),
      supabase.from('recurring_bill_payments').select('recurring_bill_id,amount_minor').eq('user_id',user.id).eq('due_month',start),
      supabase.from('card_installments').select('amount_minor,paid_at,card_purchases(is_avoidable)').eq('user_id',user.id).eq('billing_month',start),
      supabase.from('debts').select('id,installment_minor,outstanding_minor').eq('user_id',user.id).eq('is_active',true),
      supabase.from('debt_payments').select('debt_id,amount_minor').eq('user_id',user.id).gte('paid_on',start).lte('paid_on',end)
    ]);
    setTx((t.data||[]) as Tx[]);setWork((w.data||[]) as Work[]);setGoals((g.data||[]) as Goal[]);setBills((b.data||[]) as Bill[]);setPayments((p.data||[]) as Payment[]);setInstallments((i.data||[]) as unknown as Installment[]);setDebts((d.data||[]) as Debt[]);setDebtPayments((dp.data||[]) as DebtPayment[]);setLoading(false);
  }

  useEffect(()=>{
    load(true);
    const refresh=()=>load(false);
    window.addEventListener('devinx:finance-updated',refresh);
    return()=>window.removeEventListener('devinx:finance-updated',refresh);
  },[]);

  const numbers=useMemo(()=>{
    const manualIncome=tx.filter(x=>x.type==='income').reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const manualExpense=tx.filter(x=>x.type==='expense').reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const workGross=work.reduce((sum,item)=>sum+Number(item.gross_income_minor),0);
    const workCost=work.reduce((sum,item)=>sum+Number(item.energy_cost_minor)+Number(item.extra_work_cost_minor),0);
    const cardExpense=installments.reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const paidBillIds=new Set(payments.map(item=>item.recurring_bill_id));
    const recurringPaid=payments.reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const recurringUnpaid=bills.filter(item=>!paidBillIds.has(item.id)).reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const unpaidCards=installments.filter(item=>!item.paid_at).reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const paidByDebt=new Map<string,number>();
    debtPayments.forEach(item=>paidByDebt.set(item.debt_id,(paidByDebt.get(item.debt_id)||0)+Number(item.amount_minor)));
    const debtCommitment=debts.reduce((sum,debt)=>{const installment=Math.min(Number(debt.installment_minor||0),Number(debt.outstanding_minor));return sum+Math.max(0,installment-(paidByDebt.get(debt.id)||0))},0);
    const income=manualIncome+workGross;
    const expense=manualExpense+workCost+cardExpense+recurringPaid;
    const directAvoidable=tx.filter(x=>x.type==='expense'&&x.is_avoidable).reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const cardAvoidable=installments.filter(x=>x.card_purchases?.is_avoidable).reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const avoidableBillIds=new Set(bills.filter(x=>x.is_avoidable).map(x=>x.id));
    const recurringAvoidable=payments.filter(x=>avoidableBillIds.has(x.recurring_bill_id)).reduce((sum,item)=>sum+Number(item.amount_minor),0);
    const avoidable=directAvoidable+cardAvoidable+recurringAvoidable;
    const balance=income-expense;
    return{income,expense,balance,toPay:recurringUnpaid+unpaidCards+debtCommitment,projected:balance-recurringUnpaid-debtCommitment,avoidable,workGross,workCost,recurringUnpaid,unpaidCards,debtCommitment};
  },[tx,work,bills,payments,installments,debts,debtPayments]);

  const goal=goals[0];
  const goalBase=goal?.basis==='operational_net'?numbers.workGross-numbers.workCost:goal?.basis==='savings'?Math.max(0,numbers.balance):numbers.income;
  const progress=goal?Math.min(100,Math.round((goalBase/Number(goal.target_minor))*100)):0;

  if(loading)return <section className="panel dashboardLoading"><b>{m.dashboard.loading}</b></section>;

  return <div className="dashboardStack">
    <section className="summaryHero premiumSummary"><small>{m.dashboard.projected}</small><strong>{brl(numbers.projected)}</strong><span>{m.dashboard.projectedHelp}</span></section>
    <div className="metricGrid dashboardMetrics"><article><small>{m.dashboard.income}</small><b>{brl(numbers.income)}</b></article><article><small>{m.dashboard.spent}</small><b>{brl(numbers.expense)}</b></article><article><small>{m.dashboard.pending}</small><b>{brl(numbers.toPay)}</b></article><article><small>{m.dashboard.avoidable}</small><b>{brl(numbers.avoidable)}</b></article></div>
    <section className="panel quickPanel"><div className="sectionTitleRow"><div><small>ATALHOS</small><h2>Abra a área completa quando precisar</h2></div></div><div className="actionGrid premiumActions"><Link href="/rendas">Rendas</Link><Link href="/gastos">Gastos</Link><Link href="/trabalho">Trabalho</Link></div><p className="lead compactLead">Para lançar algo na hora, use o botão <b>+ Rápido</b> que fica sempre à mão.</p></section>
    {goal&&<section className="panel goalPanel"><div className="sectionTitleRow"><div><small>META ATIVA</small><h2>{goal.name}</h2></div><strong>{progress}%</strong></div><div className="bar"><i style={{width:`${progress}%`}}/></div><p className="lead">{brl(goalBase)} de {brl(Number(goal.target_minor))}</p></section>}
    <section className="panel commitmentsPanel"><div className="sectionTitleRow"><div><small>COMPROMISSOS</small><h2>{m.dashboard.commitments}</h2></div></div><div className="commitmentSplit commitmentTriple"><article><span>Contas recorrentes</span><b>{brl(numbers.recurringUnpaid)}</b></article><article><span>Dívidas do mês</span><b>{brl(numbers.debtCommitment)}</b></article><article><span>Faturas já contabilizadas</span><b>{brl(numbers.unpaidCards)}</b></article></div></section>
    <PanelLauncher/>
    {numbers.income===0&&numbers.expense===0&&<section className="empty premiumEmpty"><b>{m.dashboard.emptyTitle}</b><p>{m.dashboard.emptyText}</p><Link href="/onboarding" className="primary">{m.dashboard.configure}</Link></section>}
  </div>;
}
