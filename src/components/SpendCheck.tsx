'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localMonthStartISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function SpendCheck(){
  const{t,currency}=useI18n();
  const[balance,setBalance]=useState(0);const[pending,setPending]=useState(0);const[value,setValue]=useState('');const[loading,setLoading]=useState(true);

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const month=localMonthStartISO();
    const[a,b,c,d,e,f,g,h]=await Promise.all([
      s.from('transactions').select('type,amount_minor').eq('user_id',user.id).gte('occurred_on',month),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor').eq('user_id',user.id).gte('worked_on',month),
      s.from('recurring_bill_payments').select('recurring_bill_id,amount_minor,due_month,paid_on').eq('user_id',user.id).gte('paid_on',month),
      s.from('card_bill_payments').select('amount_minor').eq('user_id',user.id).gte('paid_on',month),
      s.from('recurring_bills').select('id,amount_minor,created_at').eq('user_id',user.id).eq('is_active',true),
      s.from('card_installments').select('amount_minor,billing_month,due_date,paid_at').eq('user_id',user.id).is('paid_at',null),
      s.from('debts').select('id,installment_minor,outstanding_minor').eq('user_id',user.id).eq('is_active',true),
      s.from('debt_payments').select('debt_id,amount_minor').eq('user_id',user.id).gte('paid_on',month)
    ]);
    const tx=(a.data||[]) as any[],work=(b.data||[]) as any[],billPay=(c.data||[]) as any[],cardPay=(d.data||[]) as any[],bills=(e.data||[]) as any[],cards=(f.data||[]) as any[],debts=(g.data||[]) as any[],debtPay=(h.data||[]) as any[];
    const income=tx.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount_minor),0)+work.reduce((s,x)=>s+Number(x.gross_income_minor),0);
    const out=tx.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount_minor),0)+billPay.reduce((s,x)=>s+Number(x.amount_minor),0)+cardPay.reduce((s,x)=>s+Number(x.amount_minor),0);
    const paidBills=new Set(billPay.filter(x=>x.due_month===month).map(x=>x.recurring_bill_id));const billPending=bills.filter(x=>String(x.created_at).slice(0,7)+'-01'<=month&&!paidBills.has(x.id)).reduce((s,x)=>s+Number(x.amount_minor),0);
    const cardPending=cards.filter(x=>(x.due_date||x.billing_month).slice(0,7)+'-01'===month).reduce((s,x)=>s+Number(x.amount_minor),0);
    const paidDebt=new Map<string,number>();debtPay.forEach(x=>paidDebt.set(x.debt_id,(paidDebt.get(x.debt_id)||0)+Number(x.amount_minor)));const debtPending=debts.reduce((s,x)=>s+Math.max(0,Math.min(Number(x.installment_minor||x.outstanding_minor),Number(x.outstanding_minor))-(paidDebt.get(x.id)||0)),0);
    setBalance(income-out);setPending(billPending+cardPending+debtPending);setLoading(false);
  }
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener('devinx:finance-updated',refresh);return()=>window.removeEventListener('devinx:finance-updated',refresh)},[]);
  const after=useMemo(()=>balance-pending-minor(value),[balance,pending,value]);
  if(loading)return <section className="panel"><span className="loader"/></section>;
  return <section className="panel spendCheck"><div className="sectionTitleRow"><div><small>{t('spend.afterCommitments')}</small><h2>{currency(balance-pending)}</h2></div></div><div className="commitmentSplit"><article><span>{t('move.balance')}</span><b>{currency(balance)}</b></article><article><span>{t('common.pending')}</span><b>{currency(pending)}</b></article></div><label>{t('spend.question')}<input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal" placeholder="0,00"/></label>{value&&<div className={'impact '+(after>=0?'good':'alert')}><span>{t('spend.after')}</span><strong>{currency(after)}</strong><span>{after>=0?t('spend.fits'):t('spend.negative')}</span></div>}</section>;
}
