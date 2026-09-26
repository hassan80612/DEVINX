'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';
import {
  RecurringBillLike,RecurringOverrideLike,RecurringPaymentLike,
  billAppliesToMonth,billDueDay,billExpectedAmount,billPaidAmount,billRemaining,installmentNumber,dueDateForMonth
} from '@/domain/recurring';
import {useI18n} from '@/i18n/provider';

type Bill=RecurringBillLike&{
  name:string;
  category_id:string;
  payment_method:string|null;
  is_avoidable:boolean;
};
type Payment=RecurringPaymentLike&{id:string;paid_on:string};
type Override=RecurringOverrideLike&{id:string};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
function monthEnd(month:string){
  const d=new Date(month.slice(0,7)+'-01T12:00:00');
  const last=new Date(d.getFullYear(),d.getMonth()+1,0);
  return last.getFullYear()+'-'+String(last.getMonth()+1).padStart(2,'0')+'-'+String(last.getDate()).padStart(2,'0');
}

export function RecurringManager({onNavigate}:{onNavigate?:(target:string)=>void}){
  const{t,currency,date}=useI18n();
  const[bills,setBills]=useState<Bill[]>([]);
  const[payments,setPayments]=useState<Payment[]>([]);
  const[overrides,setOverrides]=useState<Override[]>([]);
  const[custom,setCustom]=useState<CustomCategory[]>([]);
  const[selectedMonth,setSelectedMonth]=useState(localMonthStartISO());

  const[open,setOpen]=useState(false);
  const[name,setName]=useState('');
  const[amount,setAmount]=useState('');
  const[firstDueDate,setFirstDueDate]=useState(localDateISO());
  const[category,setCategory]=useState('housing');
  const[paymentMethod,setPaymentMethod]=useState('pix');
  const[avoidable,setAvoidable]=useState(false);
  const[installmentCount,setInstallmentCount]=useState('');

  const[notice,setNotice]=useState('');
  const[savingAction,setSavingAction]=useState<'add'|'payment'|'month'|'rule'|''>('');
  const[paying,setPaying]=useState<Bill|null>(null);
  const[editingPayment,setEditingPayment]=useState<Payment|null>(null);
  const[paidAmount,setPaidAmount]=useState('');
  const[paymentMode,setPaymentMode]=useState<'partial'|'settle'>('partial');
  const[paidOn,setPaidOn]=useState(localDateISO());

  const[editBill,setEditBill]=useState<Bill|null>(null);
  const[eName,setEName]=useState('');
  const[eAmount,setEAmount]=useState('');
  const[eFirstDueDate,setEFirstDueDate]=useState('');
  const[eCategory,setECategory]=useState('');
  const[eMethod,setEMethod]=useState('pix');
  const[eAvoidable,setEAvoidable]=useState(false);
  const[eInstallmentCount,setEInstallmentCount]=useState('');

  const[monthBill,setMonthBill]=useState<Bill|null>(null);
  const[mAmount,setMAmount]=useState('');
  const[mDue,setMDue]=useState('');

  const categories=categoryOptions('expense',custom,t);

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const[b,p,o,c]=await Promise.all([
      s.from('recurring_bills').select('id,name,category_id,amount_minor,due_day,payment_method,is_avoidable,start_month,installment_count').eq('user_id',user.id).eq('is_active',true).order('due_day'),
      s.from('recurring_bill_payments').select('id,recurring_bill_id,due_month,amount_minor,paid_on').eq('user_id',user.id).eq('due_month',selectedMonth).order('paid_on',{ascending:true}),
      s.from('recurring_bill_month_overrides').select('id,recurring_bill_id,due_month,amount_minor,due_day').eq('user_id',user.id).eq('due_month',selectedMonth),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('kind','expense').order('created_at')
    ]);
    setBills((b.data||[]) as Bill[]);
    setPayments((p.data||[]) as Payment[]);
    setOverrides((o.data||[]) as Override[]);
    setCustom((c.data||[]) as CustomCategory[]);
  }

  useEffect(()=>{
    load();
    const refresh=()=>load();
    window.addEventListener(FINANCE_UPDATED_EVENT,refresh);
    window.addEventListener('devinx:categories-updated',refresh);
    return()=>{
      window.removeEventListener(FINANCE_UPDATED_EVENT,refresh);
      window.removeEventListener('devinx:categories-updated',refresh);
    };
  },[selectedMonth]);

  const monthBills=useMemo(
    ()=>bills.filter(b=>billAppliesToMonth(b,selectedMonth)),
    [bills,selectedMonth]
  );

  async function add(e:FormEvent){
    e.preventDefault();
    const value=minor(amount);
    if(value<=0)return;
    const count=installmentCount?Number(installmentCount):null;
    if(count!==null&&(count<1||count>600))return;
    setSavingAction('add');
    try{
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      const start=firstDueDate.slice(0,7)+'-01';
      const due=Number(firstDueDate.slice(8,10));
      const{data:existing}=await s.from('recurring_bills')
        .select('id')
        .eq('user_id',user.id)
        .eq('is_active',true)
        .ilike('name',name.trim())
        .eq('amount_minor',value)
        .eq('due_day',due)
        .eq('start_month',start)
        .limit(1)
        .maybeSingle();
      const payload={name:name.trim(),category_id:category,amount_minor:value,due_day:due,payment_method:paymentMethod,is_avoidable:avoidable,start_month:start,installment_count:count};
      const{error}=existing
        ?await s.from('recurring_bills').update(payload).eq('id',existing.id).eq('user_id',user.id)
        :await s.from('recurring_bills').insert({user_id:user.id,...payload});
      if(error){setNotice(t('common.errorSave'));return}
      setName('');setAmount('');setInstallmentCount('');setFirstDueDate(localDateISO());setOpen(false);setNotice(t('bills.saved'));
      notifyFinanceUpdated();
      await load();
    }finally{setSavingAction('')}
  }

  function openPay(b:Bill,p?:Payment){
    const remaining=billRemaining(b,selectedMonth,payments,overrides);
    setPaying(b);
    setEditingPayment(p||null);
    setPaymentMode('partial');
    setPaidAmount(String(Number(p?.amount_minor??remaining)/100).replace('.',','));
    setPaidOn(p?.paid_on||localDateISO());
    setNotice('');
  }

  async function savePayment(e:FormEvent){
    e.preventDefault();
    if(!paying)return;
    const value=minor(paidAmount);
    if(value<=0)return;
    const expected=billExpectedAmount(paying,selectedMonth,overrides);
    const paidOther=billPaidAmount(paying.id,selectedMonth,payments)-Number(editingPayment?.amount_minor||0);
    const maxAllowed=Math.max(0,expected-paidOther);
    if(value>maxAllowed){setNotice(t('bills.paymentExceeds'));return}
    setSavingAction('payment');
    try{
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      let error:any=null;
      if(editingPayment){
        ({error}=await s.from('recurring_bill_payments').update({
          amount_minor:value,paid_on:paidOn,paid_at:new Date(paidOn+'T12:00:00').toISOString()
        }).eq('id',editingPayment.id).eq('user_id',user.id));
      }else{
        ({error}=await s.from('recurring_bill_payments').insert({
          user_id:user.id,recurring_bill_id:paying.id,due_month:selectedMonth,amount_minor:value,
          paid_on:paidOn,paid_at:new Date(paidOn+'T12:00:00').toISOString()
        }));
      }
      if(error){setNotice(t('common.errorSave'));return}
      const settlesWithDiscount=paymentMode==='settle'&&paidOther+value<expected;
      if(settlesWithDiscount){
        const{error:overrideError}=await s.from('recurring_bill_month_overrides').upsert({
          user_id:user.id,recurring_bill_id:paying.id,due_month:selectedMonth,
          amount_minor:paidOther+value,due_day:billDueDay(paying,selectedMonth,overrides)
        },{onConflict:'recurring_bill_id,due_month'});
        if(overrideError){setNotice(t('common.errorSave'));return}
      }
      setPaying(null);setEditingPayment(null);setPaymentMode('partial');setNotice(settlesWithDiscount?t('payment.discountSettled'):t('bills.paymentSaved'));
      notifyFinanceUpdated();
      await load();
    }finally{setSavingAction('')}
  }

  async function removePayment(p:Payment){
    if(!confirm(t('move.deleteConfirm')))return;
    const s=createClient();
    const{error}=await s.from('recurring_bill_payments').delete().eq('id',p.id);
    if(error){setNotice(t('common.errorDelete'));return}
    notifyFinanceUpdated();
    await load();
  }

  function startBillEdit(b:Bill){
    setEditBill(b);setEName(b.name);setEAmount(String(Number(b.amount_minor)/100).replace('.',','));
    setEFirstDueDate(dueDateForMonth(b.start_month,b.due_day));setECategory(b.category_id);setEMethod(b.payment_method||'pix');
    setEAvoidable(b.is_avoidable);setEInstallmentCount(b.installment_count==null?'':String(b.installment_count));
  }

  async function saveBillEdit(e:FormEvent){
    e.preventDefault();
    if(!editBill)return;
    const count=eInstallmentCount?Number(eInstallmentCount):null;
    if(count!==null&&(count<1||count>600))return;
    setSavingAction('rule');
    try{
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      const{error}=await s.from('recurring_bills').update({
        name:eName.trim(),amount_minor:minor(eAmount),due_day:Number(eFirstDueDate.slice(8,10)),
        start_month:eFirstDueDate.slice(0,7)+'-01',category_id:eCategory,payment_method:eMethod,
        is_avoidable:eAvoidable,installment_count:count
      }).eq('id',editBill.id).eq('user_id',user.id);
      if(error){setNotice(t('common.errorUpdate'));return}
      setEditBill(null);
      notifyFinanceUpdated();
      await load();
    }finally{setSavingAction('')}
  }

  function startMonthEdit(b:Bill){
    setMonthBill(b);
    setMAmount(String(billExpectedAmount(b,selectedMonth,overrides)/100).replace('.',','));
    setMDue(String(billDueDay(b,selectedMonth,overrides)));
  }

  async function saveMonthEdit(e:FormEvent){
    e.preventDefault();
    if(!monthBill)return;
    const value=minor(mAmount);
    if(value<=0)return;
    setSavingAction('month');
    try{
      const s=createClient();
      const{data:{user}}=await s.auth.getUser();
      if(!user)return;
      const{error}=await s.from('recurring_bill_month_overrides').upsert({
        user_id:user.id,recurring_bill_id:monthBill.id,due_month:selectedMonth,amount_minor:value,due_day:Number(mDue)
      },{onConflict:'recurring_bill_id,due_month'});
      if(error){setNotice(t('common.errorUpdate'));return}
      setMonthBill(null);
      notifyFinanceUpdated();
      await load();
    }finally{setSavingAction('')}
  }

  async function clearMonthEdit(){
    if(!monthBill)return;
    setSavingAction('month');
    try{
      const s=createClient();
      const{error}=await s.from('recurring_bill_month_overrides').delete().eq('recurring_bill_id',monthBill.id).eq('due_month',selectedMonth);
      if(error){setNotice(t('common.errorUpdate'));return}
      setMonthBill(null);
      notifyFinanceUpdated();
      await load();
    }finally{setSavingAction('')}
  }

  async function disable(b:Bill){
    if(!confirm(t('common.confirm')+'?'))return;
    const s=createClient();
    const{error}=await s.from('recurring_bills').update({is_active:false}).eq('id',b.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    notifyFinanceUpdated();
    await load();
  }

  return <div className="billsPage">
    <div className="toolbar">
      <button className="primary" onClick={()=>setOpen(v=>!v)}>{t('bills.new')}</button>
      {onNavigate&&<button className="goldOutline" onClick={()=>onNavigate('categories')}>{t('nav.categories')}</button>}
    </div>

    <section className="panel billMonthNavigator">
      <div><small>{t('bills.viewMonth')}</small><b>{date(selectedMonth,{month:'long',year:'numeric'})}</b></div>
      <input type="month" value={selectedMonth.slice(0,7)} onChange={e=>setSelectedMonth(e.target.value+'-01')}/>
      {selectedMonth!==localMonthStartISO()&&<button className="textButton" type="button" onClick={()=>setSelectedMonth(localMonthStartISO())}>{t('move.thisMonth')}</button>}
    </section>

    {open&&<form className="panel entryForm" onSubmit={add}>
      <label>{t('bills.name')}<input required value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>{t('bills.base')}<input required value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal"/></label>
      <label>{t('bills.installmentsOptional')}<input type="number" min="1" max="600" value={installmentCount} onChange={e=>setInstallmentCount(e.target.value)} placeholder={t('bills.continuous')}/><small>{t('bills.installmentsHelp')}</small></label>
      <label>{t('bills.firstDueDate')}<input type="date" value={firstDueDate} onChange={e=>setFirstDueDate(e.target.value)} required/><small>{t('bills.firstDueDateHelp')}</small></label>
      <label>{t('common.category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
      <label>{t('bills.payment')}<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Cash</option><option value="debit">Debit</option></select></label>
      <label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/>{t('bills.avoidable')}</label>
      <button className="primary" disabled={savingAction==='add'} aria-busy={savingAction==='add'}>{savingAction==='add'?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('bills.save')}</button>
    </form>}

    {onNavigate&&<div className="flowGuard"><span>{t('bills.cardQuestion')}</span><button onClick={()=>onNavigate('cards')}>{t('bills.goCards')}</button></div>}
    {notice&&<div className="authMessage">{notice}</div>}

    <section className="recurringList">
      {monthBills.length===0?<div className="empty"><b>{t('bills.noBillsMonth')}</b><p>{t('bills.noBillsMonthText')}</p></div>:monthBills.map(b=>{
        const expected=billExpectedAmount(b,selectedMonth,overrides);
        const paid=billPaidAmount(b.id,selectedMonth,payments);
        const remaining=Math.max(0,expected-paid);
        const number=installmentNumber(b,selectedMonth);
        const billPayments=payments.filter(p=>p.recurring_bill_id===b.id);
        return <article className="recurringCard recurringInstallmentCard" key={b.id}>
          <div className="recurringMain">
            <div><b>{b.name}</b><small>{t('move.due')} {date(dueDateForMonth(selectedMonth,billDueDay(b,selectedMonth,overrides)),{day:'2-digit',month:'2-digit',year:'numeric'})}{b.installment_count&&number?' · '+t('bills.installment')+' '+number+'/'+b.installment_count:''}{b.is_avoidable?' · '+t('dashboard.avoidable'):''}</small></div>
            <strong>{currency(expected)}</strong>
          </div>
          <div className="billProgress">
            <span><small>{t('bills.paidThisMonth')}</small><b className="positive">{currency(paid)}</b></span>
            <span><small>{t('bills.remainingThisMonth')}</small><b className={remaining>0?'negative':'positive'}>{currency(remaining)}</b></span>
          </div>
          {billPayments.length>0&&<div className="billPaymentTrail">{billPayments.map(p=><div key={p.id}><span>{date(p.paid_on,{day:'2-digit',month:'short'})} · {currency(Number(p.amount_minor))}</span><button type="button" onClick={()=>openPay(b,p)}>{t('common.edit')}</button><button type="button" className="dangerText" onClick={()=>removePayment(p)}>{t('common.delete')}</button></div>)}</div>}
          {paid>0&&remaining>0&&<div className="billPaymentState"><small>{t('bills.partialStatus')}</small><b>{currency(paid)} · {t('bills.remainingLabel')} {currency(remaining)}</b></div>}
          <div className="recurringActions">
            {remaining>0?<button className="primary billPayPrimary" onClick={()=>openPay(b)}>{paid>0?t('bills.completePayment'):t('bills.paySettle')}</button>:<span className="paidBadge">✓ {t('bills.paidThisMonthBadge')}</span>}
            <button className="textButton" onClick={()=>startMonthEdit(b)}>{t('bills.editThisMonth')}</button>
            <button className="textButton" onClick={()=>startBillEdit(b)}>{t('bills.editRule')}</button>
            <button className="dangerText textButton" onClick={()=>disable(b)}>{t('bills.disable')}</button>
          </div>
        </article>
      })}
    </section>

    {paying&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPaying(null)}}><form className="modalCard" onSubmit={savePayment}>
      <div className="modalHead"><h2>{paying.name}</h2><button type="button" onClick={()=>setPaying(null)}>×</button></div>
      <p className="formHint">{date(selectedMonth,{month:'long',year:'numeric'})} · {t('bills.partialHelp')}</p>
      <label>{t('bills.valuePaid')}<input value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} inputMode="decimal" required/></label>
      {!editingPayment&&<div className="paymentModePicker" role="group" aria-label={t('payment.mode')}><button type="button" className={paymentMode==='partial'?'active':''} onClick={()=>setPaymentMode('partial')}><b>{t('payment.partial')}</b><small>{t('payment.partialHelp')}</small></button><button type="button" className={paymentMode==='settle'?'active':''} onClick={()=>setPaymentMode('settle')}><b>{t('payment.settle')}</b><small>{t('payment.settleHelp')}</small></button></div>}
      <label>{t('bills.paidDate')}<input type="date" value={paidOn} onChange={e=>setPaidOn(e.target.value)} required/></label>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setPaying(null)}>{t('common.cancel')}</button><button className="primary" disabled={savingAction==='payment'} aria-busy={savingAction==='payment'}>{savingAction==='payment'?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.confirm')}</button></div>
    </form></div>}

    {monthBill&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMonthBill(null)}}><form className="modalCard" onSubmit={saveMonthEdit}>
      <div className="modalHead"><h2>{t('bills.editThisMonth')} · {monthBill.name}</h2><button type="button" onClick={()=>setMonthBill(null)}>×</button></div>
      <p className="formHint">{t('bills.monthOverrideHelp')}</p>
      <label>{t('bills.monthValue')}<input value={mAmount} onChange={e=>setMAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('bills.dueDateThisMonth')}<input type="date" min={selectedMonth} max={monthEnd(selectedMonth)} value={dueDateForMonth(selectedMonth,Number(mDue||1))} onChange={e=>setMDue(e.target.value.slice(8,10))} required/></label>
      <div className="modalActions"><button type="button" className="dangerText secondary" onClick={clearMonthEdit} disabled={savingAction==='month'}>{t('bills.restoreRule')}</button><button className="primary" disabled={savingAction==='month'} aria-busy={savingAction==='month'}>{savingAction==='month'?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.save')}</button></div>
    </form></div>}

    {editBill&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditBill(null)}}><form className="modalCard" onSubmit={saveBillEdit}>
      <div className="modalHead"><h2>{t('bills.editRule')}</h2><button type="button" onClick={()=>setEditBill(null)}>×</button></div>
      <p className="formHint">{t('bills.ruleEditHelp')}</p>
      <label>{t('bills.name')}<input value={eName} onChange={e=>setEName(e.target.value)} required/></label>
      <label>{t('bills.base')}<input value={eAmount} onChange={e=>setEAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('bills.installmentsOptional')}<input type="number" min="1" max="600" value={eInstallmentCount} onChange={e=>setEInstallmentCount(e.target.value)} placeholder={t('bills.continuous')}/></label>
      <label>{t('bills.firstDueDate')}<input type="date" value={eFirstDueDate} onChange={e=>setEFirstDueDate(e.target.value)} required/><small>{t('bills.firstDueDateEditHelp')}</small></label>
      <label>{t('common.category')}<select value={eCategory} onChange={e=>setECategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
      <label>{t('bills.payment')}<select value={eMethod} onChange={e=>setEMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Cash</option><option value="debit">Debit</option></select></label>
      <label className="checkOnly"><input type="checkbox" checked={eAvoidable} onChange={e=>setEAvoidable(e.target.checked)}/>{t('bills.avoidable')}</label>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditBill(null)}>{t('common.cancel')}</button><button className="primary" disabled={savingAction==='rule'} aria-busy={savingAction==='rule'}>{savingAction==='rule'?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.save')}</button></div>
    </form></div>}
  </div>;
}
