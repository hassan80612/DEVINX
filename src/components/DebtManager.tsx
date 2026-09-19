'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

type Debt={id:string;name:string;original_minor:number;outstanding_minor:number;installment_minor:number|null;installments_remaining:number|null;expected_end:string|null;due_day:number|null};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function DebtManager(){
  const{t,currency}=useI18n();
  const[items,setItems]=useState<Debt[]>([]);const[open,setOpen]=useState(false);const[name,setName]=useState('');const[original,setOriginal]=useState('');const[installment,setInstallment]=useState('');const[remaining,setRemaining]=useState('');const[end,setEnd]=useState('');const[dueDay,setDueDay]=useState('');
  const[notice,setNotice]=useState('');const[paying,setPaying]=useState<Debt|null>(null);const[paymentAmount,setPaymentAmount]=useState('');const[paymentMethod,setPaymentMethod]=useState('pix');const[paymentDate,setPaymentDate]=useState(localDateISO());const[saving,setSaving]=useState(false);
  const[editing,setEditing]=useState<Debt|null>(null);const[eName,setEName]=useState('');const[eInstallment,setEInstallment]=useState('');const[eRemaining,setERemaining]=useState('');const[eEnd,setEEnd]=useState('');const[eDue,setEDue]=useState('');

  async function load(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const{data}=await s.from('debts').select('id,name,original_minor,outstanding_minor,installment_minor,installments_remaining,expected_end,due_day').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false});setItems((data||[]) as Debt[])}
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener('devinx:finance-updated',refresh);return()=>window.removeEventListener('devinx:finance-updated',refresh)},[]);

  async function add(e:FormEvent){
    e.preventDefault();const value=minor(original);if(value<=0)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('debts').insert({user_id:user.id,name:name.trim(),original_minor:value,outstanding_minor:value,installment_minor:installment?minor(installment):null,installments_remaining:remaining?Number(remaining):null,expected_end:end||null,due_day:dueDay?Number(dueDay):null});
    if(error){setNotice('Não foi possível salvar.');return}setName('');setOriginal('');setInstallment('');setRemaining('');setEnd('');setDueDay('');setOpen(false);window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  function openPay(d:Debt){setPaying(d);setPaymentAmount(d.installment_minor?String(Number(d.installment_minor)/100).replace('.',','):'');setPaymentMethod('pix');setPaymentDate(localDateISO());setNotice('')}
  async function pay(e:FormEvent){
    e.preventDefault();if(!paying)return;const value=minor(paymentAmount);if(value<=0||value>Number(paying.outstanding_minor))return;setSaving(true);const s=createClient();const{error}=await s.rpc('register_debt_payment',{p_debt_id:paying.id,p_amount_minor:value,p_paid_on:paymentDate,p_payment_method:paymentMethod});setSaving(false);
    if(error){setNotice('Não foi possível registrar o pagamento.');return}setPaying(null);setNotice('Pagamento registrado.');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  function startEdit(d:Debt){setEditing(d);setEName(d.name);setEInstallment(d.installment_minor?String(Number(d.installment_minor)/100).replace('.',','):'');setERemaining(d.installments_remaining==null?'':String(d.installments_remaining));setEEnd(d.expected_end||'');setEDue(d.due_day==null?'':String(d.due_day))}
  async function saveEdit(e:FormEvent){
    e.preventDefault();if(!editing)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('debts').update({name:eName.trim(),installment_minor:eInstallment?minor(eInstallment):null,installments_remaining:eRemaining?Number(eRemaining):null,expected_end:eEnd||null,due_day:eDue?Number(eDue):null}).eq('id',editing.id).eq('user_id',user.id);if(error){setNotice('Não foi possível atualizar.');return}setEditing(null);window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  async function disable(d:Debt){if(!confirm(t('common.confirm')+'?'))return;const s=createClient();const{error}=await s.from('debts').update({is_active:false}).eq('id',d.id);if(error){setNotice('Não foi possível desativar.');return}window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load()}

  return <div className="debtsPage">
    <button className="primary" onClick={()=>setOpen(v=>!v)}>{t('debts.new')}</button>
    {open&&<form className="panel entryForm" onSubmit={add}><label>{t('debts.name')}<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('debts.original')}<input required value={original} onChange={e=>setOriginal(e.target.value)} inputMode="decimal"/></label><label>{t('debts.installment')}<input value={installment} onChange={e=>setInstallment(e.target.value)} inputMode="decimal"/></label><label>{t('debts.remaining')}<input type="number" min="0" value={remaining} onChange={e=>setRemaining(e.target.value)}/></label><label>{t('debts.dueDay')}<input type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)}/></label><label>{t('debts.end')}<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><button className="primary">{t('debts.save')}</button></form>}
    {notice&&<div className="authMessage">{notice}</div>}
    <section className="debtList">{items.length===0?<div className="empty"><b>{t('debts.noDebts')}</b><p>{t('debts.noDebtsText')}</p></div>:items.map(d=><article className="debtCard" key={d.id}><div><small>{t('nav.debts').toUpperCase()}</small><h3>{d.name}</h3><span>{t('debts.original')} {currency(Number(d.original_minor))}</span>{d.installments_remaining!=null&&<span>{d.installments_remaining} · {t('debts.remaining')}</span>}{d.due_day&&<span>{t('move.due')} {d.due_day}</span>}</div><div className="debtNumbers"><small>{t('debts.balance')}</small><strong>{currency(Number(d.outstanding_minor))}</strong>{d.installment_minor&&<span>{t('debts.installment')} {currency(Number(d.installment_minor))}</span>}</div><div className="debtActions"><button className="primary" onClick={()=>openPay(d)}>{t('debts.register')}</button><button className="textButton" onClick={()=>startEdit(d)}>{t('common.edit')}</button><button className="dangerText textButton" onClick={()=>disable(d)}>{t('bills.disable')}</button></div></article>)}</section>

    {paying&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPaying(null)}}><form className="modalCard" onSubmit={pay}><div className="modalHead"><h2>{paying.name}</h2><button type="button" onClick={()=>setPaying(null)}>×</button></div><label>{t('debts.paidValue')}<input value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('common.date')}<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} required/></label><label>{t('common.payment')}<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Cash</option><option value="debit">Debit</option></select></label><p className="formHint">{t('debts.paymentHelp')}</p><div className="modalActions"><button type="button" className="secondary" onClick={()=>setPaying(null)}>{t('common.cancel')}</button><button className="primary" disabled={saving}>{saving?t('common.saving'):t('common.confirm')}</button></div></form></div>}

    {editing&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><form className="modalCard" onSubmit={saveEdit}><div className="modalHead"><h2>{t('common.edit')} · {editing.name}</h2><button type="button" onClick={()=>setEditing(null)}>×</button></div><label>{t('debts.name')}<input value={eName} onChange={e=>setEName(e.target.value)} required/></label><label>{t('debts.installment')}<input value={eInstallment} onChange={e=>setEInstallment(e.target.value)} inputMode="decimal"/></label><label>{t('debts.remaining')}<input type="number" min="0" value={eRemaining} onChange={e=>setERemaining(e.target.value)}/></label><label>{t('debts.dueDay')}<input type="number" min="1" max="31" value={eDue} onChange={e=>setEDue(e.target.value)}/></label><label>{t('debts.end')}<input type="date" value={eEnd} onChange={e=>setEEnd(e.target.value)}/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}
  </div>;
}
