'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

type Bill={id:string;name:string;category_id:string;amount_minor:number;due_day:number;payment_method:string|null;is_avoidable:boolean};
type Payment={id:string;recurring_bill_id:string;due_month:string;amount_minor:number;paid_on:string};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function RecurringManager({onNavigate}:{onNavigate?:(target:string)=>void}){
  const{t,currency,date}=useI18n();
  const[bills,setBills]=useState<Bill[]>([]);const[payments,setPayments]=useState<Payment[]>([]);const[custom,setCustom]=useState<CustomCategory[]>([]);
  const[open,setOpen]=useState(false);const[name,setName]=useState('');const[amount,setAmount]=useState('');const[dueDay,setDueDay]=useState('10');const[category,setCategory]=useState('housing');const[paymentMethod,setPaymentMethod]=useState('pix');const[avoidable,setAvoidable]=useState(false);
  const[notice,setNotice]=useState('');const[paying,setPaying]=useState<Bill|null>(null);const[editingPayment,setEditingPayment]=useState<Payment|null>(null);const[paidAmount,setPaidAmount]=useState('');const[paidOn,setPaidOn]=useState(localDateISO());
  const[editBill,setEditBill]=useState<Bill|null>(null);const[eName,setEName]=useState('');const[eAmount,setEAmount]=useState('');const[eDue,setEDue]=useState('');const[eCategory,setECategory]=useState('');const[eMethod,setEMethod]=useState('pix');const[eAvoidable,setEAvoidable]=useState(false);
  const categories=categoryOptions('expense',custom,t);

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const month=localMonthStartISO();
    const[b,p,c]=await Promise.all([
      s.from('recurring_bills').select('id,name,category_id,amount_minor,due_day,payment_method,is_avoidable').eq('user_id',user.id).eq('is_active',true).order('due_day'),
      s.from('recurring_bill_payments').select('id,recurring_bill_id,due_month,amount_minor,paid_on').eq('user_id',user.id).eq('due_month',month),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('kind','expense').order('created_at')
    ]);
    setBills((b.data||[]) as Bill[]);setPayments((p.data||[]) as Payment[]);setCustom((c.data||[]) as CustomCategory[]);
  }
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener('devinx:finance-updated',refresh);window.addEventListener('devinx:categories-updated',refresh);return()=>{window.removeEventListener('devinx:finance-updated',refresh);window.removeEventListener('devinx:categories-updated',refresh)}},[]);

  async function add(e:FormEvent){
    e.preventDefault();const value=minor(amount);if(value<=0)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('recurring_bills').insert({user_id:user.id,name:name.trim(),category_id:category,amount_minor:value,due_day:Number(dueDay),payment_method:paymentMethod,is_avoidable:avoidable});
    if(error){setNotice(t('common.errorSave'));return}setName('');setAmount('');setOpen(false);setNotice(t('bills.saved'));window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  function openPay(b:Bill,p?:Payment){setPaying(b);setEditingPayment(p||null);setPaidAmount(String(Number(p?.amount_minor??b.amount_minor)/100).replace('.',','));setPaidOn(p?.paid_on||localDateISO());setNotice('')}
  async function savePayment(e:FormEvent){
    e.preventDefault();if(!paying)return;const value=minor(paidAmount);if(value<=0)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;let error:any=null;
    if(editingPayment)({error}=await s.from('recurring_bill_payments').update({amount_minor:value,paid_on:paidOn,paid_at:new Date(paidOn+'T12:00:00').toISOString()}).eq('id',editingPayment.id).eq('user_id',user.id));
    else({error}=await s.from('recurring_bill_payments').insert({user_id:user.id,recurring_bill_id:paying.id,due_month:localMonthStartISO(),amount_minor:value,paid_on:paidOn,paid_at:new Date(paidOn+'T12:00:00').toISOString()}));
    if(error){setNotice(t('common.errorSave'));return}setPaying(null);setEditingPayment(null);setNotice(t('bills.paymentSaved'));window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  function startBillEdit(b:Bill){setEditBill(b);setEName(b.name);setEAmount(String(Number(b.amount_minor)/100).replace('.',','));setEDue(String(b.due_day));setECategory(b.category_id);setEMethod(b.payment_method||'pix');setEAvoidable(b.is_avoidable)}
  async function saveBillEdit(e:FormEvent){
    e.preventDefault();if(!editBill)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('recurring_bills').update({name:eName.trim(),amount_minor:minor(eAmount),due_day:Number(eDue),category_id:eCategory,payment_method:eMethod,is_avoidable:eAvoidable}).eq('id',editBill.id).eq('user_id',user.id);if(error){setNotice(t('common.errorUpdate'));return}setEditBill(null);window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  async function disable(b:Bill){if(!confirm(t('common.confirm')+'?'))return;const s=createClient();const{error}=await s.from('recurring_bills').update({is_active:false}).eq('id',b.id);if(error){setNotice(t('common.errorUpdate'));return}window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load()}

  return <div className="billsPage">
    <div className="toolbar"><button className="primary" onClick={()=>setOpen(v=>!v)}>{t('bills.new')}</button>{onNavigate&&<button className="goldOutline" onClick={()=>onNavigate('categories')}>{t('nav.categories')}</button>}</div>
    {open&&<form className="panel entryForm" onSubmit={add}><label>{t('bills.name')}<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('bills.base')}<input required value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal"/></label><label>{t('common.category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label><label>{t('bills.dueDay')}<input type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)}/></label><label>{t('bills.payment')}<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Cash</option><option value="debit">Debit</option></select></label><label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/>{t('bills.avoidable')}</label><button className="primary">{t('bills.save')}</button></form>}
    {onNavigate&&<div className="flowGuard"><span>{t('bills.cardQuestion')}</span><button onClick={()=>onNavigate('cards')}>{t('bills.goCards')}</button></div>}
    {notice&&<div className="authMessage">{notice}</div>}

    <section className="recurringList">{bills.length===0?<div className="empty"><b>{t('bills.noBills')}</b><p>{t('bills.noBillsText')}</p></div>:bills.map(b=>{const p=payments.find(x=>x.recurring_bill_id===b.id);return <article className="recurringCard" key={b.id}><div><b>{b.name}</b><small>{t('move.due')} {b.due_day}{b.is_avoidable?' · '+t('dashboard.avoidable'):''}</small></div><strong>{currency(Number(b.amount_minor))}</strong><div className="recurringActions">{p?<button className="paidButton" onClick={()=>openPay(b,p)}>{t('bills.paid')} {currency(Number(p.amount_minor))} · {date(p.paid_on,{day:'2-digit',month:'short'})}</button>:<button className="secondary" onClick={()=>openPay(b)}>{t('bills.markPaid')}</button>}<button className="textButton" onClick={()=>startBillEdit(b)}>{t('bills.editBase')}</button><button className="dangerText textButton" onClick={()=>disable(b)}>{t('bills.disable')}</button></div></article>})}</section>

    {paying&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPaying(null)}}><form className="modalCard" onSubmit={savePayment}><div className="modalHead"><h2>{paying.name}</h2><button type="button" onClick={()=>setPaying(null)}>×</button></div><label>{t('bills.valuePaid')}<input value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('bills.paidDate')}<input type="date" value={paidOn} onChange={e=>setPaidOn(e.target.value)} required/></label><p className="formHint">{t('bills.overrideHelp')}</p><div className="modalActions"><button type="button" className="secondary" onClick={()=>setPaying(null)}>{t('common.cancel')}</button><button className="primary">{t('common.confirm')}</button></div></form></div>}

    {editBill&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditBill(null)}}><form className="modalCard" onSubmit={saveBillEdit}><div className="modalHead"><h2>{t('bills.editBase')}</h2><button type="button" onClick={()=>setEditBill(null)}>×</button></div><label>{t('bills.name')}<input value={eName} onChange={e=>setEName(e.target.value)} required/></label><label>{t('bills.base')}<input value={eAmount} onChange={e=>setEAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('bills.dueDay')}<input type="number" min="1" max="31" value={eDue} onChange={e=>setEDue(e.target.value)} required/></label><label>{t('common.category')}<select value={eCategory} onChange={e=>setECategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label><label>{t('bills.payment')}<select value={eMethod} onChange={e=>setEMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Cash</option><option value="debit">Debit</option></select></label><label className="checkOnly"><input type="checkbox" checked={eAvoidable} onChange={e=>setEAvoidable(e.target.checked)}/>{t('bills.avoidable')}</label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditBill(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}
  </div>;
}
