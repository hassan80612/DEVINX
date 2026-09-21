'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {FuturePlanLike,FutureSettlementLike,monthPlanningImpact} from '@/domain/future-planning';
import {RecurringBillLike,RecurringOverrideLike,billAppliesToMonth,billRemaining} from '@/domain/recurring';
import {useI18n} from '@/i18n/provider';

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function SpendCheck(){
  const{t,currency}=useI18n();
  const[balance,setBalance]=useState(0);const[pending,setPending]=useState(0);const[value,setValue]=useState('');const[loading,setLoading]=useState(true);

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const month=localMonthStartISO();
    const[a,b,c,d,e,f,g,h,i,j]=await Promise.all([
      s.from('transactions').select('type,amount_minor,source_type').eq('user_id',user.id).gte('occurred_on',month),
      s.from('work_sessions').select('gross_income_minor').eq('user_id',user.id).gte('worked_on',month),
      s.from('recurring_bill_payments').select('recurring_bill_id,amount_minor,due_month,paid_on').eq('user_id',user.id).gte('paid_on',month),
      s.from('card_bill_payments').select('amount_minor').eq('user_id',user.id).gte('paid_on',month),
      s.from('recurring_bills').select('id,amount_minor,due_day,start_month,installment_count').eq('user_id',user.id).eq('is_active',true),
      s.from('card_installments').select('amount_minor,billing_month,due_date,paid_at').eq('user_id',user.id).is('paid_at',null),
      s.from('recurring_bill_month_overrides').select('recurring_bill_id,due_month,amount_minor,due_day').eq('user_id',user.id).eq('due_month',month),
      s.from('reserve_entries').select('kind,amount_minor,occurred_on,future_plan_id').eq('user_id',user.id),
      s.from('future_plans').select('id,kind,name,amount_minor,category_id,due_date,recurrence,reserve_enabled,is_active').eq('user_id',user.id),
      s.from('future_plan_settlements').select('plan_id,due_date,amount_minor,settled_on').eq('user_id',user.id)
    ]);
    const tx=(a.data||[]) as any[],work=(b.data||[]) as any[],billPay=(c.data||[]) as any[],cardPay=(d.data||[]) as any[],bills=(e.data||[]) as RecurringBillLike[],cards=(f.data||[]) as any[],overrides=(g.data||[]) as RecurringOverrideLike[],reserves=(h.data||[]) as any[];
    const futurePlans=(i.data||[]) as FuturePlanLike[],futureSettlements=(j.data||[]) as FutureSettlementLike[];
    const realTx=tx.filter(x=>x.source_type!=='cash_adjustment'&&x.source_type!=='cash_adjustment_v2'&&x.source_type!=='work_cash_model_migration');
    const income=realTx.filter(x=>x.type==='income').reduce((sum,x)=>sum+Number(x.amount_minor),0)+work.reduce((sum,x)=>sum+Number(x.gross_income_minor),0);
    const out=realTx.filter(x=>x.type==='expense').reduce((sum,x)=>sum+Number(x.amount_minor),0)+billPay.reduce((sum,x)=>sum+Number(x.amount_minor),0)+cardPay.reduce((sum,x)=>sum+Number(x.amount_minor),0);
    const billPending=bills.reduce((sum,bill)=>sum+(billAppliesToMonth(bill,month)?billRemaining(bill,month,billPay,overrides):0),0);
    const cardPending=cards.filter(x=>(x.due_date||x.billing_month).slice(0,7)+'-01'===month).reduce((sum,x)=>sum+Number(x.amount_minor),0);
    const reserveMonthNet=reserves.filter(x=>x.occurred_on>=month).reduce((sum,x)=>sum+(x.kind==='deposit'?Number(x.amount_minor):-Number(x.amount_minor)),0);
    const future=monthPlanningImpact(futurePlans,futureSettlements,reserves,month,localDateISO());
    setBalance(income-out-reserveMonthNet);
    setPending(Math.max(0,billPending+cardPending+future.totalNeed-future.expectedIncome));
    setLoading(false);
  }
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener(FINANCE_UPDATED_EVENT,refresh);return()=>window.removeEventListener(FINANCE_UPDATED_EVENT,refresh)},[]);
  const after=useMemo(()=>balance-pending-minor(value),[balance,pending,value]);
  if(loading)return <section className="panel"><span className="loader"/></section>;
  return <section className="panel spendCheck"><div className="sectionTitleRow"><div><small>{t('spend.afterCommitments')}</small><h2>{currency(balance-pending)}</h2></div></div><div className="commitmentSplit"><article><span>{t('move.balance')}</span><b>{currency(balance)}</b></article><article><span>{t('common.pending')}</span><b>{currency(pending)}</b></article></div><label>{t('spend.question')}<input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal" placeholder="0,00"/></label>{value&&<div className={'impact '+(after>=0?'good':'alert')}><span>{t('spend.after')}</span><strong>{currency(after)}</strong><span>{after>=0?t('spend.fits'):t('spend.negative')}</span></div>}</section>;
}
