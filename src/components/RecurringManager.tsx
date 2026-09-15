'use client';

import Link from 'next/link';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localMonthStartISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';

type Bill={id:string;name:string;category_id:string;amount_minor:number;due_day:number;payment_method:string|null;is_avoidable:boolean};
type Payment={recurring_bill_id:string;due_month:string;amount_minor:number};
const brl=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const minor=(v:string)=>Math.round((Number(v.replace(/\./g,'').replace(',','.'))||0)*100);

export function RecurringManager(){
  const[bills,setBills]=useState<Bill[]>([]);const[payments,setPayments]=useState<Payment[]>([]);const[customCategories,setCustomCategories]=useState<CustomCategory[]>([]);const[open,setOpen]=useState(false);const[name,setName]=useState('');const[amount,setAmount]=useState('');const[dueDay,setDueDay]=useState('10');const[category,setCategory]=useState('housing');const[paymentMethod,setPaymentMethod]=useState('pix');const[avoidable,setAvoidable]=useState(false);const[notice,setNotice]=useState('');const[payingId,setPayingId]=useState<string|null>(null);const[paidAmount,setPaidAmount]=useState('');
  const categories=categoryOptions('expense',customCategories);

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const month=localMonthStartISO();
    const[{data:b},{data:p},{data:custom}]=await Promise.all([
      s.from('recurring_bills').select('id,name,category_id,amount_minor,due_day,payment_method,is_avoidable').eq('user_id',user.id).eq('is_active',true).order('due_day'),
      s.from('recurring_bill_payments').select('recurring_bill_id,due_month,amount_minor').eq('user_id',user.id).eq('due_month',month),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('kind','expense').order('created_at')
    ]);
    setBills((b||[]) as Bill[]);setPayments((p||[]) as Payment[]);setCustomCategories((custom||[]) as CustomCategory[]);
  }
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener('devinx:categories-updated',refresh);return()=>window.removeEventListener('devinx:categories-updated',refresh)},[]);
  const paidIds=useMemo(()=>new Set(payments.map(p=>p.recurring_bill_id)),[payments]);

  async function add(e:FormEvent){e.preventDefault();const value=minor(amount);if(value<=0){setNotice('Informe um valor maior que zero.');return}const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('recurring_bills').insert({user_id:user.id,name:name.trim(),category_id:category,amount_minor:value,due_day:Number(dueDay),payment_method:paymentMethod,is_avoidable:avoidable});if(error){setNotice('Não foi possível salvar a conta.');return}setName('');setAmount('');setOpen(false);setNotice('');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load()}
  function startPayment(b:Bill){setPayingId(b.id);setPaidAmount(String(Number(b.amount_minor)/100).replace('.',','));setNotice('')}
  async function markPaid(e:FormEvent,b:Bill){e.preventDefault();const value=minor(paidAmount);if(value<=0){setNotice('Informe o valor pago.');return}const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('recurring_bill_payments').insert({user_id:user.id,recurring_bill_id:b.id,due_month:localMonthStartISO(),amount_minor:value});if(error){setNotice('Não foi possível marcar como paga.');return}setPayingId(null);setPaidAmount('');setNotice('Conta marcada como paga.');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load()}
  async function disable(id:string){const s=createClient();const{error}=await s.from('recurring_bills').update({is_active:false}).eq('id',id);if(error){setNotice('Não foi possível desativar a conta.');return}window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load()}

  return <>
    <div className="toolbar"><button className="primary" onClick={()=>setOpen(v=>!v)}>{open?'Fechar':'+ Nova conta recorrente'}</button><Link className="secondary" href="/categorias">Categorias</Link></div>
    {open&&<form className="entryForm" onSubmit={add}>
      <label>Nome<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: aluguel"/></label>
      <label>Valor base<input required value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
      <label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(item=><option value={item.id} key={item.id}>{item.icon} {item.name}</option>)}</select></label>
      <label>Dia do vencimento<input required type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)}/></label>
      <label>Pagamento<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option></select></label>
      <label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/> É um gasto evitável</label>
      <button className="primary">Salvar conta</button>
    </form>}
    <div className="flowGuard"><span>Conta fixa cobrada no cartão?</span><Link href="/cartoes">Registre pelo módulo Cartões para não duplicar</Link></div>
    {notice&&<div className="authMessage">{notice}</div>}
    <section className="recurringList">{bills.length===0?<div className="empty"><b>Nenhuma conta recorrente</b><p>Cadastre aluguel, internet, energia, escola e outras contas fixas uma vez.</p></div>:bills.map(b=>{const paid=paidIds.has(b.id);return <article key={b.id} className="recurringCard"><div><b>{b.name}</b><small>Vence dia {b.due_day}{b.is_avoidable?' · evitável':''}</small></div><strong>{brl(Number(b.amount_minor))}</strong><div className="recurringActions">{paid?<button className="paidButton" disabled>Pago</button>:<button className="secondary" onClick={()=>payingId===b.id?setPayingId(null):startPayment(b)}>{payingId===b.id?'Cancelar':'Marcar pago'}</button>}<button className="textButton" onClick={()=>disable(b.id)}>Desativar</button></div>{payingId===b.id&&!paid&&<form className="recurringPaymentForm" onSubmit={e=>markPaid(e,b)}><label>Valor pago neste mês<input autoFocus value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} inputMode="decimal"/></label><button className="primary">Confirmar</button><small>Você pode ajustar o valor deste mês sem alterar o valor base da conta.</small></form>}</article>})}</section>
  </>;
}
