'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {spendImpact} from '@/domain/finance';

type Tx={type:'income'|'expense';amount_minor:number};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;minutes_worked:number;worked_on:string};
type Bill={id:string;amount_minor:number;due_day:number};
type Payment={recurring_bill_id:string};
type Installment={amount_minor:number;paid_at:string|null;card_purchases:{card_id:string}|null};
type Card={id:string;due_day:number|null};
type Debt={id:string;installment_minor:number|null;outstanding_minor:number};
type DebtPayment={debt_id:string;amount_minor:number};

const brl=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const minor=(v:string)=>Math.round((Number(v.replace(/\./g,'').replace(',','.'))||0)*100);
const iso=(d:Date)=>d.toISOString().slice(0,10);

function isDueWithinSevenDays(day:number){
  const now=new Date();now.setHours(0,0,0,0);
  for(let offset=0;offset<=7;offset++){
    const d=new Date(now);d.setDate(now.getDate()+offset);
    if(d.getDate()===day)return true;
  }
  return false;
}

export function SpendCheck(){
  const[value,setValue]=useState('');
  const[data,setData]=useState({income:0,expense:0,unpaidRecurring:0,unpaidCards:0,debtCommitment:0,next7:0,netPerHour:0,historyReady:false});
  const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const n=new Date();
    const start=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`;
    const e=new Date(n.getFullYear(),n.getMonth()+1,0);
    const end=iso(e);
    const historyStart=new Date();historyStart.setDate(historyStart.getDate()-30);
    const[t,w,b,p,i,c,d,dp]=await Promise.all([
      s.from('transactions').select('type,amount_minor').eq('user_id',user.id).gte('occurred_on',start).lte('occurred_on',end),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor,minutes_worked,worked_on').eq('user_id',user.id).gte('worked_on',iso(historyStart)),
      s.from('recurring_bills').select('id,amount_minor,due_day').eq('user_id',user.id).eq('is_active',true),
      s.from('recurring_bill_payments').select('recurring_bill_id').eq('user_id',user.id).eq('due_month',start),
      s.from('card_installments').select('amount_minor,paid_at,card_purchases(card_id)').eq('user_id',user.id).eq('billing_month',start),
      s.from('credit_cards').select('id,due_day').eq('user_id',user.id).eq('is_active',true),
      s.from('debts').select('id,installment_minor,outstanding_minor').eq('user_id',user.id).eq('is_active',true),
      s.from('debt_payments').select('debt_id,amount_minor').eq('user_id',user.id).gte('paid_on',start).lte('paid_on',end)
    ]);

    const tx=(t.data||[]) as Tx[];
    const work=(w.data||[]) as Work[];
    const bills=(b.data||[]) as Bill[];
    const payments=(p.data||[]) as Payment[];
    const installments=(i.data||[]) as unknown as Installment[];
    const cards=(c.data||[]) as Card[];
    const debts=(d.data||[]) as Debt[];
    const debtPayments=(dp.data||[]) as DebtPayment[];

    const monthWork=work.filter(x=>x.worked_on>=start&&x.worked_on<=end);
    const income=tx.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0)+monthWork.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const expense=tx.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0)+monthWork.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0)+installments.reduce((a,b)=>a+Number(b.amount_minor),0);

    const paid=new Set(payments.map(x=>x.recurring_bill_id));
    const unpaidBills=bills.filter(x=>!paid.has(x.id));
    const unpaidRecurring=unpaidBills.reduce((a,b)=>a+Number(b.amount_minor),0);
    const unpaidCards=installments.filter(x=>!x.paid_at).reduce((a,b)=>a+Number(b.amount_minor),0);

    const paidByDebt=new Map<string,number>();
    debtPayments.forEach(pmt=>paidByDebt.set(pmt.debt_id,(paidByDebt.get(pmt.debt_id)||0)+Number(pmt.amount_minor)));
    const debtCommitment=debts.reduce((sum,debt)=>{
      const installment=Math.min(Number(debt.installment_minor||0),Number(debt.outstanding_minor));
      return sum+Math.max(0,installment-(paidByDebt.get(debt.id)||0));
    },0);

    const recurringNext7=unpaidBills.filter(x=>isDueWithinSevenDays(x.due_day)).reduce((a,b)=>a+Number(b.amount_minor),0);
    const cardDueSoon=new Set(cards.filter(card=>card.due_day&&isDueWithinSevenDays(card.due_day)).map(card=>card.id));
    const cardsNext7=installments.filter(x=>!x.paid_at&&x.card_purchases?.card_id&&cardDueSoon.has(x.card_purchases.card_id)).reduce((a,b)=>a+Number(b.amount_minor),0);

    const historyGross=work.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const historyCost=work.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0);
    const historyHours=work.reduce((a,b)=>a+Number(b.minutes_worked),0)/60;
    const historyReady=work.length>=3&&historyHours>=3;
    const netPerHour=historyReady&&historyHours>0?(historyGross-historyCost)/historyHours:0;

    setData({income,expense,unpaidRecurring,unpaidCards,debtCommitment,next7:recurringNext7+cardsNext7,netPerHour,historyReady});
    setLoading(false);
  })()},[]);

  const proposed=minor(value);
  const accountingBalance=data.income-data.expense;
  const projected=accountingBalance-data.unpaidRecurring-data.debtCommitment;
  const after=spendImpact(projected,proposed);
  const status=useMemo(()=>after>=0?'Esse gasto cabe na projeção registrada.':'Esse gasto deixaria sua projeção negativa.',[after]);
  const proposedHours=data.historyReady&&data.netPerHour>0&&proposed>0?proposed/data.netPerHour:null;
  const recoveryHours=data.historyReady&&data.netPerHour>0&&after<0?Math.abs(after)/data.netPerHour:null;

  if(loading)return <section className="panel"><b>Calculando seu cenário...</b></section>;

  return <>
    <section className="summaryHero"><small>SALDO APÓS COMPROMISSOS</small><strong>{brl(projected)}</strong><span>usa somente seus lançamentos e compromissos cadastrados; fatura do cartão não é descontada duas vezes</span></section>
    <div className="metricGrid"><article><small>Saldo contábil</small><b>{brl(accountingBalance)}</b></article><article><small>Contas ainda a pagar</small><b>{brl(data.unpaidRecurring)}</b></article><article><small>Dívidas do mês</small><b>{brl(data.debtCommitment)}</b></article><article><small>Vence nos próximos 7 dias</small><b>{brl(data.next7)}</b></article></div>
    <section className="panel spendCheck"><h2>Quanto você quer gastar?</h2><label>Valor<input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal" placeholder="0,00"/></label>{proposed>0&&<div className={after>=0?'impact good':'impact alert'}><small>Depois desse gasto</small><strong>{brl(after)}</strong><p>{status}</p>{proposedHours!==null&&<span>Esse valor equivale a cerca de <b>{proposedHours.toFixed(1)} h</b> do seu líquido/hora dos últimos 30 dias.</span>}{recoveryHours!==null&&<span>Para cobrir o saldo negativo, seriam cerca de <b>{recoveryHours.toFixed(1)} h</b> no seu ritmo recente.</span>}</div>} {!data.historyReady&&<p className="note">A equivalência em horas aparece depois de pelo menos 3 jornadas e 3 horas registradas. O Devinx não inventa média.</p>}<p className="lead">O Devinx mostra o impacto. A decisão continua sendo sua.</p></section>
  </>;
}
