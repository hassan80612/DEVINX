'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

type Debt={
  id:string;
  name:string;
  original_minor:number;
  outstanding_minor:number;
  installment_minor:number|null;
  installments_remaining:number|null;
  installments_total:number|null;
  expected_end:string|null;
  due_day:number|null;
  is_active:boolean;
  created_at:string;
};
type DebtPayment={
  id:string;
  debt_id:string;
  amount_minor:number;
  paid_on:string;
  payment_method:string|null;
  created_at:string;
};

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

function nextDueDate(day:number|null){
  if(!day)return null;
  const now=new Date();
  let y=now.getFullYear(),m=now.getMonth();
  const make=(yy:number,mm:number)=>{
    const last=new Date(yy,mm+1,0).getDate();
    return new Date(yy,mm,Math.min(Math.max(day,1),last));
  };
  let d=make(y,m);
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(d<today){m+=1;if(m>11){m=0;y+=1}d=make(y,m)}
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

export function DebtManager(){
  const{t,currency,date}=useI18n();
  const[items,setItems]=useState<Debt[]>([]);
  const[payments,setPayments]=useState<DebtPayment[]>([]);
  const[open,setOpen]=useState(false);
  const[expanded,setExpanded]=useState<Set<string>>(new Set());
  const[name,setName]=useState('');
  const[original,setOriginal]=useState('');
  const[installment,setInstallment]=useState('');
  const[remaining,setRemaining]=useState('');
  const[end,setEnd]=useState('');
  const[dueDay,setDueDay]=useState('');
  const[notice,setNotice]=useState('');
  const[paying,setPaying]=useState<Debt|null>(null);
  const[paymentAmount,setPaymentAmount]=useState('');
  const[paymentMethod,setPaymentMethod]=useState('pix');
  const[paymentDate,setPaymentDate]=useState(localDateISO());
  const[saving,setSaving]=useState(false);
  const[editing,setEditing]=useState<Debt|null>(null);
  const[eName,setEName]=useState('');
  const[eInstallment,setEInstallment]=useState('');
  const[eRemaining,setERemaining]=useState('');
  const[eTotal,setETotal]=useState('');
  const[eEnd,setEEnd]=useState('');
  const[eDue,setEDue]=useState('');

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const[d,p]=await Promise.all([
      s.from('debts').select('id,name,original_minor,outstanding_minor,installment_minor,installments_remaining,installments_total,expected_end,due_day,is_active,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),
      s.from('debt_payments').select('id,debt_id,amount_minor,paid_on,payment_method,created_at').eq('user_id',user.id).order('paid_on',{ascending:false}).order('created_at',{ascending:false})
    ]);
    setItems((d.data||[]) as Debt[]);
    setPayments((p.data||[]) as DebtPayment[]);
  }

  useEffect(()=>{
    load();
    const refresh=()=>load();
    window.addEventListener(FINANCE_UPDATED_EVENT,refresh);
    return()=>window.removeEventListener(FINANCE_UPDATED_EVENT,refresh);
  },[]);

  const totals=useMemo(()=>({
    original:items.reduce((s,d)=>s+Number(d.original_minor),0),
    paid:items.reduce((s,d)=>s+Math.max(0,Number(d.original_minor)-Number(d.outstanding_minor)),0),
    outstanding:items.reduce((s,d)=>s+Number(d.outstanding_minor),0),
    active:items.filter(d=>d.is_active&&Number(d.outstanding_minor)>0).length
  }),[items]);

  async function add(e:FormEvent){
    e.preventDefault();
    const value=minor(original);
    if(value<=0)return;
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const count=remaining?Number(remaining):null;
    const{error}=await s.from('debts').insert({
      user_id:user.id,
      name:name.trim(),
      original_minor:value,
      outstanding_minor:value,
      installment_minor:installment?minor(installment):null,
      installments_remaining:count,
      installments_total:count,
      expected_end:end||null,
      due_day:dueDay?Number(dueDay):null
    });
    if(error){setNotice(t('common.errorSave'));return}
    setName('');setOriginal('');setInstallment('');setRemaining('');setEnd('');setDueDay('');setOpen(false);
    notifyFinanceUpdated();
    await load();
  }

  function openPay(d:Debt){
    setPaying(d);
    setPaymentAmount(d.installment_minor?String(Number(d.installment_minor)/100).replace('.',','):'');
    setPaymentMethod('pix');
    setPaymentDate(localDateISO());
    setNotice('');
  }

  async function pay(e:FormEvent){
    e.preventDefault();
    if(!paying)return;
    const value=minor(paymentAmount);
    if(value<=0||value>Number(paying.outstanding_minor))return;
    setSaving(true);
    const s=createClient();
    const{error}=await s.rpc('register_debt_payment',{
      p_debt_id:paying.id,
      p_amount_minor:value,
      p_paid_on:paymentDate,
      p_payment_method:paymentMethod
    });
    setSaving(false);
    if(error){setNotice(t('common.errorSave'));return}
    setPaying(null);
    setNotice(t('debts.paymentSaved'));
    notifyFinanceUpdated();
    await load();
  }

  function startEdit(d:Debt){
    setEditing(d);
    setEName(d.name);
    setEInstallment(d.installment_minor?String(Number(d.installment_minor)/100).replace('.',','):'');
    setERemaining(d.installments_remaining==null?'':String(d.installments_remaining));
    setETotal(d.installments_total==null?'':String(d.installments_total));
    setEEnd(d.expected_end||'');
    setEDue(d.due_day==null?'':String(d.due_day));
  }

  async function saveEdit(e:FormEvent){
    e.preventDefault();
    if(!editing)return;
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('debts').update({
      name:eName.trim(),
      installment_minor:eInstallment?minor(eInstallment):null,
      installments_remaining:eRemaining?Number(eRemaining):null,
      installments_total:eTotal?Number(eTotal):null,
      expected_end:eEnd||null,
      due_day:eDue?Number(eDue):null
    }).eq('id',editing.id).eq('user_id',user.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    setEditing(null);
    notifyFinanceUpdated();
    await load();
  }

  async function setActive(d:Debt,active:boolean){
    if(!confirm(t('common.confirm')+'?'))return;
    const s=createClient();
    const{error}=await s.from('debts').update({is_active:active}).eq('id',d.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    notifyFinanceUpdated();
    await load();
  }

  function toggleDebt(id:string){
    setExpanded(prev=>{
      const next=new Set(prev);
      next.has(id)?next.delete(id):next.add(id);
      return next;
    });
  }
  function toggleAll(){
    setExpanded(prev=>prev.size===items.length?new Set():new Set(items.map(d=>d.id)));
  }

  return <div className="debtsPage">
    <section className="debtOverview">
      <article><small>{t('debts.totalOriginal')}</small><b>{currency(totals.original)}</b></article>
      <article><small>{t('debts.totalPaid')}</small><b className="positive">{currency(totals.paid)}</b></article>
      <article><small>{t('debts.totalOutstanding')}</small><b>{currency(totals.outstanding)}</b></article>
      <article><small>{t('debts.activeDebts')}</small><b>{totals.active}</b></article>
    </section>

    <div className="toolbar">
      <button className="primary" onClick={()=>setOpen(v=>!v)}>{t('debts.new')}</button>
      {items.length>1&&<button className="ghost compactButton" onClick={toggleAll}>{expanded.size===items.length?t('common.collapseAll'):t('common.expandAll')}</button>}
    </div>

    {open&&<form className="panel entryForm" onSubmit={add}>
      <label>{t('debts.name')}<input required value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>{t('debts.original')}<input required value={original} onChange={e=>setOriginal(e.target.value)} inputMode="decimal"/></label>
      <label>{t('debts.installment')}<input value={installment} onChange={e=>setInstallment(e.target.value)} inputMode="decimal"/></label>
      <label>{t('debts.totalInstallments')}<input type="number" min="0" value={remaining} onChange={e=>setRemaining(e.target.value)}/></label>
      <label>{t('debts.dueDay')}<input type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)}/></label>
      <label>{t('debts.end')}<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <button className="primary">{t('debts.save')}</button>
    </form>}

    {notice&&<div className="authMessage">{notice}</div>}

    <section className="debtList">
      {items.length===0?<div className="empty"><b>{t('debts.noDebts')}</b><p>{t('debts.noDebtsText')}</p></div>:items.map(d=>{
        const debtPayments=payments.filter(p=>p.debt_id===d.id);
        const paid=Math.max(0,Number(d.original_minor)-Number(d.outstanding_minor));
        const total=d.installments_total;
        const remainingCount=d.installments_remaining;
        const paidCount=total!=null&&remainingCount!=null?Math.max(0,total-remainingCount):debtPayments.length;
        const nextDue=d.is_active&&Number(d.outstanding_minor)>0?nextDueDate(d.due_day):null;
        const settled=Number(d.outstanding_minor)<=0;
        const opened=expanded.has(d.id);
        return <article className={'debtCard debtCompleteCard '+(opened?'expanded':'collapsed')} key={d.id}>
          <button className="collapseHeader debtHeader" type="button" onClick={()=>toggleDebt(d.id)}>
            <div><small>{t('nav.debts').toUpperCase()}</small><h3>{d.name}</h3><span>{settled?t('debts.settled'):d.is_active?t('common.active'):t('debts.archived')}</span></div>
            <div className="debtHeaderNumbers"><span><small>{t('debts.balance')}</small><b>{currency(Number(d.outstanding_minor))}</b></span><em>{opened?'−':'＋'}</em></div>
          </button>

          {opened&&<div className="collapsibleBody">
            <div className="debtDetailGrid">
              <span><small>{t('debts.original')}</small><b>{currency(Number(d.original_minor))}</b></span>
              <span><small>{t('debts.totalPaid')}</small><b className="positive">{currency(paid)}</b></span>
              <span><small>{t('debts.balance')}</small><b>{currency(Number(d.outstanding_minor))}</b></span>
              <span><small>{t('debts.installment')}</small><b>{d.installment_minor?currency(Number(d.installment_minor)):'—'}</b></span>
              <span><small>{t('debts.installmentsPaid')}</small><b>{paidCount}</b></span>
              <span><small>{t('debts.remaining')}</small><b>{remainingCount??'—'}</b></span>
              <span><small>{t('debts.nextDue')}</small><b>{nextDue?date(nextDue,{day:'2-digit',month:'2-digit',year:'numeric'}):'—'}</b></span>
              <span><small>{t('debts.end')}</small><b>{d.expected_end?date(d.expected_end,{day:'2-digit',month:'2-digit',year:'numeric'}):'—'}</b></span>
            </div>

            <div className="debtActions">
              {d.is_active&&Number(d.outstanding_minor)>0&&<button className="primary" onClick={()=>openPay(d)}>{t('debts.register')}</button>}
              <button className="textButton" onClick={()=>startEdit(d)}>{t('common.edit')}</button>
              {!settled&&(d.is_active
                ?<button className="dangerText textButton" onClick={()=>setActive(d,false)}>{t('debts.archive')}</button>
                :<button className="textButton" onClick={()=>setActive(d,true)}>{t('debts.reactivate')}</button>)}
            </div>

            <div className="debtHistory">
              <div className="sectionTitleRow"><div><small>{t('common.history').toUpperCase()}</small><h4>{t('debts.paymentHistory')}</h4></div><span>{debtPayments.length}</span></div>
              {debtPayments.length===0
                ?<small>{t('debts.noPayments')}</small>
                :debtPayments.map(p=><div className="debtPaymentRow" key={p.id}><span>{date(p.paid_on,{day:'2-digit',month:'short',year:'numeric'})}</span><b>{currency(Number(p.amount_minor))}</b><small>{p.payment_method||'—'}</small></div>)}
            </div>
          </div>}
        </article>
      })}
    </section>

    {paying&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPaying(null)}}><form className="modalCard" onSubmit={pay}>
      <div className="modalHead"><h2>{paying.name}</h2><button type="button" onClick={()=>setPaying(null)}>×</button></div>
      <label>{t('debts.paidValue')}<input value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('common.date')}<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} required/></label>
      <label>{t('common.payment')}<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">{t('debts.cash')}</option><option value="debit">{t('debts.debit')}</option></select></label>
      <p className="formHint">{t('debts.paymentHelp')}</p>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setPaying(null)}>{t('common.cancel')}</button><button className="primary" disabled={saving}>{saving?t('common.saving'):t('common.confirm')}</button></div>
    </form></div>}

    {editing&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><form className="modalCard" onSubmit={saveEdit}>
      <div className="modalHead"><h2>{t('common.edit')} · {editing.name}</h2><button type="button" onClick={()=>setEditing(null)}>×</button></div>
      <label>{t('debts.name')}<input value={eName} onChange={e=>setEName(e.target.value)} required/></label>
      <label>{t('debts.installment')}<input value={eInstallment} onChange={e=>setEInstallment(e.target.value)} inputMode="decimal"/></label>
      <label>{t('debts.totalInstallments')}<input type="number" min="0" value={eTotal} onChange={e=>setETotal(e.target.value)}/></label>
      <label>{t('debts.remaining')}<input type="number" min="0" value={eRemaining} onChange={e=>setERemaining(e.target.value)}/></label>
      <label>{t('debts.dueDay')}<input type="number" min="1" max="31" value={eDue} onChange={e=>setEDue(e.target.value)}/></label>
      <label>{t('debts.end')}<input type="date" value={eEnd} onChange={e=>setEEnd(e.target.value)}/></label>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div>
    </form></div>}
  </div>;
}
