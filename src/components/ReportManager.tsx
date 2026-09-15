'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthKey} from '@/lib/date';

type Filter='all'|'income'|'work'|'expenses'|'cards'|'debts'|'avoidable';
type Tx={type:'income'|'expense';amount_minor:number;occurred_on:string;is_avoidable:boolean;category_id:string};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;worked_on:string;minutes_worked:number};
type Installment={amount_minor:number;billing_month:string;card_purchases:{is_avoidable:boolean}|null};
type RecurringPayment={amount_minor:number;due_month:string;recurring_bills:{is_avoidable:boolean}|null};

const brl=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const key=(date:string)=>date.slice(0,7);
const filterLabels:Record<Filter,string>={all:'Tudo',income:'Rendas',work:'Trabalho',expenses:'Gastos',cards:'Cartões',debts:'Dívidas',avoidable:'Evitáveis'};

export function ReportManager(){
  const[months,setMonths]=useState(6);
  const[filter,setFilter]=useState<Filter>('all');
  const[tx,setTx]=useState<Tx[]>([]);
  const[work,setWork]=useState<Work[]>([]);
  const[installments,setInstallments]=useState<Installment[]>([]);
  const[recurring,setRecurring]=useState<RecurringPayment[]>([]);
  const[loading,setLoading]=useState(true);

  async function load(showLoading=true){
    if(showLoading)setLoading(true);
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const start=new Date();start.setDate(1);start.setMonth(start.getMonth()-(months-1));
    const from=localDateISO(start);
    const monthFrom=`${localMonthKey(start)}-01`;
    const[t,w,i,r]=await Promise.all([
      s.from('transactions').select('type,amount_minor,occurred_on,is_avoidable,category_id').eq('user_id',user.id).gte('occurred_on',from),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on,minutes_worked').eq('user_id',user.id).gte('worked_on',from),
      s.from('card_installments').select('amount_minor,billing_month,card_purchases(is_avoidable)').eq('user_id',user.id).gte('billing_month',monthFrom),
      s.from('recurring_bill_payments').select('amount_minor,due_month,recurring_bills(is_avoidable)').eq('user_id',user.id).gte('due_month',monthFrom)
    ]);
    setTx((t.data||[]) as Tx[]);setWork((w.data||[]) as Work[]);setInstallments((i.data||[]) as unknown as Installment[]);setRecurring((r.data||[]) as unknown as RecurringPayment[]);setLoading(false);
  }

  useEffect(()=>{
    load(true);
    const refresh=()=>load(false);
    window.addEventListener('devinx:finance-updated',refresh);
    return()=>window.removeEventListener('devinx:finance-updated',refresh);
  },[months]);

  const rows=useMemo(()=>{
    const map=new Map<string,{income:number;expense:number;avoidable:number;workCost:number;hours:number;debt:number}>();
    for(let n=months-1;n>=0;n--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-n);map.set(localMonthKey(d),{income:0,expense:0,avoidable:0,workCost:0,hours:0,debt:0})}

    tx.forEach(x=>{
      const r=map.get(key(x.occurred_on));if(!r)return;
      const isDebt=x.type==='expense'&&x.category_id==='debt_payment';
      const includeIncome=x.type==='income'&&(filter==='all'||filter==='income');
      const includeExpense=x.type==='expense'&&(filter==='all'||filter==='avoidable'&&x.is_avoidable||filter==='debts'&&isDebt||filter==='expenses'&&!isDebt);
      if(includeIncome)r.income+=Number(x.amount_minor);
      if(includeExpense){r.expense+=Number(x.amount_minor);if(x.is_avoidable)r.avoidable+=Number(x.amount_minor);if(isDebt)r.debt+=Number(x.amount_minor)}
    });

    if(filter==='all'||filter==='work')work.forEach(x=>{const r=map.get(key(x.worked_on));if(!r)return;const cost=Number(x.energy_cost_minor)+Number(x.extra_work_cost_minor);r.income+=Number(x.gross_income_minor);r.expense+=cost;r.workCost+=cost;r.hours+=Number(x.minutes_worked)/60});
    if(filter==='all'||filter==='cards'||filter==='avoidable')installments.forEach(x=>{if(filter==='avoidable'&&!x.card_purchases?.is_avoidable)return;const r=map.get(key(x.billing_month));if(!r)return;r.expense+=Number(x.amount_minor);if(x.card_purchases?.is_avoidable)r.avoidable+=Number(x.amount_minor)});
    if(filter==='all'||filter==='expenses'||filter==='avoidable')recurring.forEach(x=>{if(filter==='avoidable'&&!x.recurring_bills?.is_avoidable)return;const r=map.get(key(x.due_month));if(!r)return;r.expense+=Number(x.amount_minor);if(x.recurring_bills?.is_avoidable)r.avoidable+=Number(x.amount_minor)});

    return [...map.entries()].map(([month,v])=>({month,...v,balance:v.income-v.expense}));
  },[tx,work,installments,recurring,months,filter]);

  const totals=rows.reduce((a,r)=>({income:a.income+r.income,expense:a.expense+r.expense,balance:a.balance+r.balance,avoidable:a.avoidable+r.avoidable,workCost:a.workCost+r.workCost,hours:a.hours+r.hours,debt:a.debt+r.debt}),{income:0,expense:0,balance:0,avoidable:0,workCost:0,hours:0,debt:0});

  return <>
    <div className="reportControls"><div className="filterRow reportPeriods"><button className={months===1?'active':''} onClick={()=>setMonths(1)}>Mês</button><button className={months===3?'active':''} onClick={()=>setMonths(3)}>3 meses</button><button className={months===6?'active':''} onClick={()=>setMonths(6)}>6 meses</button><button className={months===12?'active':''} onClick={()=>setMonths(12)}>12 meses</button></div><div className="filterRow reportFilters">{(Object.keys(filterLabels) as Filter[]).map(value=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{filterLabels[value]}</button>)}</div></div>
    {loading?<section className="panel"><b>Carregando relatório...</b></section>:<>
      <div className="metricGrid reportMetrics"><article><small>Entradas</small><b>{brl(totals.income)}</b></article><article><small>Saídas</small><b>{brl(totals.expense)}</b></article><article><small>Resultado</small><b>{brl(totals.balance)}</b></article><article><small>{filter==='work'?'Horas trabalhadas':'Evitáveis'}</small><b>{filter==='work'?`${totals.hours.toFixed(1)} h`:brl(totals.avoidable)}</b></article></div>
      {filter==='all'&&<section className="reportClosing"><article><span>Custos do trabalho</span><b>{brl(totals.workCost)}</b></article><article><span>Pagamentos de dívidas</span><b>{brl(totals.debt)}</b></article><article><span>Horas de trabalho</span><b>{totals.hours.toFixed(1)} h</b></article></section>}
      <section className="reportTable">{rows.map(r=><article key={r.month}><div><b>{new Date(r.month+'-02T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</b><small>Resultado {brl(r.balance)}{r.hours>0?` · ${r.hours.toFixed(1)} h`:''}</small></div><span className="positive">+ {brl(r.income)}</span><span className="negative">- {brl(r.expense)}</span></article>)}</section>
    </>}
  </>;
}
