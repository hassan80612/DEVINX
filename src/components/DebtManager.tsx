'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type Debt={id:string;name:string;original_minor:number;outstanding_minor:number;installment_minor:number|null;installments_remaining:number|null;expected_end:string|null};
const brl=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const minor=(v:string)=>Math.round((Number(v.replace(/\./g,'').replace(',','.'))||0)*100);

export function DebtManager(){
  const[items,setItems]=useState<Debt[]>([]);
  const[open,setOpen]=useState(false);
  const[name,setName]=useState('');
  const[original,setOriginal]=useState('');
  const[installment,setInstallment]=useState('');
  const[remaining,setRemaining]=useState('');
  const[end,setEnd]=useState('');
  const[notice,setNotice]=useState('');
  const[payingId,setPayingId]=useState<string|null>(null);
  const[paymentAmount,setPaymentAmount]=useState('');
  const[paymentMethod,setPaymentMethod]=useState('pix');
  const[paymentDate,setPaymentDate]=useState(new Date().toISOString().slice(0,10));
  const[savingPayment,setSavingPayment]=useState(false);

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const{data}=await s.from('debts').select('id,name,original_minor,outstanding_minor,installment_minor,installments_remaining,expected_end').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false});
    setItems((data||[]) as Debt[]);
  }
  useEffect(()=>{load()},[]);

  async function add(e:FormEvent){
    e.preventDefault();
    const value=minor(original);
    if(value<=0){setNotice('Informe o valor original da dívida.');return}
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('debts').insert({user_id:user.id,name:name.trim(),original_minor:value,outstanding_minor:value,installment_minor:installment?minor(installment):null,installments_remaining:remaining?Number(remaining):null,expected_end:end||null});
    if(error){setNotice('Não foi possível salvar a dívida.');return}
    setName('');setOriginal('');setInstallment('');setRemaining('');setEnd('');setOpen(false);setNotice('');await load();
  }

  function openPayment(d:Debt){
    setPayingId(d.id);
    setPaymentAmount(d.installment_minor?String(Number(d.installment_minor)/100).replace('.',','):'');
    setPaymentMethod('pix');
    setPaymentDate(new Date().toISOString().slice(0,10));
    setNotice('');
  }

  async function pay(e:FormEvent,d:Debt){
    e.preventDefault();
    const value=minor(paymentAmount);
    if(value<=0){setNotice('Informe o valor pago.');return}
    if(value>Number(d.outstanding_minor)){setNotice('O pagamento não pode ser maior que o saldo da dívida.');return}
    setSavingPayment(true);
    const s=createClient();
    const{error}=await s.rpc('register_debt_payment',{p_debt_id:d.id,p_amount_minor:value,p_paid_on:paymentDate,p_payment_method:paymentMethod});
    setSavingPayment(false);
    if(error){setNotice('Não foi possível registrar o pagamento.');return}
    setPayingId(null);setPaymentAmount('');setNotice('Pagamento registrado e lançado no caixa sem duplicação.');
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load();
  }

  return <>
    <button className="primary" onClick={()=>setOpen(v=>!v)}>{open?'Fechar':'+ Adicionar dívida'}</button>
    {open&&<form className="entryForm" onSubmit={add}><label>Nome<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: financiamento"/></label><label>Valor original<input required value={original} onChange={e=>setOriginal(e.target.value)} inputMode="decimal" placeholder="0,00"/></label><label>Valor da parcela<input value={installment} onChange={e=>setInstallment(e.target.value)} inputMode="decimal" placeholder="0,00"/></label><label>Parcelas restantes<input type="number" min="0" value={remaining} onChange={e=>setRemaining(e.target.value)}/></label><label>Previsão de término<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><button className="primary">Salvar dívida</button></form>}
    {notice&&<div className="authMessage">{notice}</div>}
    <section className="debtList">{items.length===0?<div className="empty"><b>Nenhuma dívida cadastrada</b><p>Empréstimos, financiamentos e acordos aparecerão aqui.</p></div>:items.map(d=><article key={d.id} className="debtCard"><div><small>DÍVIDA</small><h3>{d.name}</h3><span>Original {brl(Number(d.original_minor))}</span>{d.installments_remaining!=null&&<span>{d.installments_remaining} parcelas restantes</span>}</div><div><small>Saldo restante</small><strong>{brl(Number(d.outstanding_minor))}</strong>{d.installment_minor&&<span>Parcela {brl(Number(d.installment_minor))}</span>}<button className="secondary" onClick={()=>payingId===d.id?setPayingId(null):openPayment(d)}>{payingId===d.id?'Cancelar':'Registrar pagamento'}</button></div>{payingId===d.id&&<form className="debtPaymentForm" onSubmit={e=>pay(e,d)}><label>Valor pago<input autoFocus required value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} inputMode="decimal" placeholder="0,00"/></label><label>Data<input required type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label><label>Pagamento<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option></select></label><button className="primary" disabled={savingPayment}>{savingPayment?'Salvando...':'Confirmar pagamento'}</button><small>Esse pagamento reduz a dívida e também sai do caixa uma única vez.</small></form>}</article>)}</section>
  </>;
}
