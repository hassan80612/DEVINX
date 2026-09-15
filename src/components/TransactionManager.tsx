'use client';

import Link from 'next/link';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type Kind='income'|'expense';
type Item={id:string;description:string|null;amount_minor:number;occurred_on:string;category_id:string;is_avoidable:boolean};

const expenseCategories=[
  ['housing','Moradia'],['food','Alimentação'],['groceries','Mercado'],['transport','Transporte'],['health','Saúde'],['education','Educação'],['subscriptions','Assinaturas'],['leisure','Lazer'],['other','Outros']
] as const;
const incomeCategories=[
  ['salary','Salário'],['commission','Comissão'],['overtime','Hora extra'],['bonus','Bônus'],['allowance','Adicional'],['extra','Renda extra'],['other','Outros']
] as const;

function money(minor:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100)}
function toMinor(raw:string){const normalized=raw.replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'');return Math.round((Number(normalized)||0)*100)}

export function TransactionManager({kind}:{kind:Kind}){
  const[open,setOpen]=useState(false);
  const[amount,setAmount]=useState('');
  const[description,setDescription]=useState('');
  const[category,setCategory]=useState(kind==='income'?'salary':'food');
  const[date,setDate]=useState(new Date().toISOString().slice(0,10));
  const[payment,setPayment]=useState('pix');
  const[avoidable,setAvoidable]=useState(false);
  const[items,setItems]=useState<Item[]>([]);
  const[saving,setSaving]=useState(false);
  const[notice,setNotice]=useState('');
  const categories=kind==='income'?incomeCategories:expenseCategories;
  const total=useMemo(()=>items.reduce((sum,item)=>sum+Number(item.amount_minor),0),[items]);

  async function load(){
    const supabase=createClient();
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const{data}=await supabase.from('transactions').select('id,description,amount_minor,occurred_on,category_id,is_avoidable').eq('user_id',user.id).eq('type',kind).order('occurred_on',{ascending:false}).limit(30);
    setItems((data||[]) as Item[]);
  }

  useEffect(()=>{
    load();
    const refresh=()=>load();
    window.addEventListener('devinx:finance-updated',refresh);
    return()=>window.removeEventListener('devinx:finance-updated',refresh);
  },[kind]);

  async function submit(e:FormEvent){
    e.preventDefault();
    const amountMinor=toMinor(amount);
    if(amountMinor<=0){setNotice('Informe um valor maior que zero.');return}
    setSaving(true);setNotice('');
    const supabase=createClient();
    const{data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href='/entrar';return}
    const{error}=await supabase.from('transactions').insert({
      user_id:user.id,
      type:kind,
      category_id:category,
      description:description.trim()||null,
      amount_minor:amountMinor,
      occurred_on:date,
      payment_method:kind==='expense'?payment:null,
      is_avoidable:kind==='expense'?avoidable:false,
      is_recurring:false
    });
    setSaving(false);
    if(error){setNotice('Não foi possível salvar. Tente novamente.');return}
    setAmount('');setDescription('');setAvoidable(false);setOpen(false);setNotice('');
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load();
  }

  return <>
    <section className="moduleSummary"><small>{kind==='income'?'TOTAL DE ENTRADAS DIRETAS':'TOTAL DE GASTOS DIRETOS'}</small><strong>{money(total)}</strong><span>{kind==='income'?'corridas e entregas ficam em Trabalho para não duplicar renda':'cartão e contas fixas têm fluxos próprios para não duplicar despesas'}</span></section>
    <button className="primary" onClick={()=>setOpen(v=>!v)}>{open?'Fechar':kind==='income'?'+ Nova entrada':'+ Novo gasto'}</button>

    {open&&<form className="entryForm" onSubmit={submit}>
      <label>Valor<input autoFocus required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" inputMode="decimal"/></label>
      <label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} placeholder={kind==='income'?'Ex.: salário, comissão, renda extra':'Ex.: almoço, mercado, aluguel'}/></label>
      <label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      <label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
      {kind==='expense'&&<><label>Pagamento<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option></select></label><label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/> É um gasto evitável</label></>}
      <button className="primary" disabled={saving}>{saving?'Salvando...':'Salvar'}</button>
      {notice&&<div className="authMessage">{notice}</div>}
    </form>}

    {kind==='expense'&&<div className="flowGuard"><span>Compra no crédito?</span><Link href="/cartoes">Registrar no cartão</Link><span>Conta que se repete?</span><Link href="/recorrentes">Criar conta recorrente</Link></div>}
    {kind==='income'&&<div className="flowGuard"><span>Uber, 99, iFood ou entregas?</span><Link href="/trabalho">Registrar jornada de trabalho</Link></div>}

    <section className="transactionList">{items.length===0?<div className="empty"><b>Nenhum lançamento ainda</b><p>Use o botão Rápido para registrar algo em segundos ou abra o formulário completo acima.</p></div>:items.map(item=><article key={item.id}><div><b>{item.description||categories.find(c=>c[0]===item.category_id)?.[1]||'Lançamento'}</b><small>{new Date(item.occurred_on+'T12:00:00').toLocaleDateString('pt-BR')}{item.is_avoidable?' · evitável':''}</small></div><strong className={kind==='income'?'positive':'negative'}>{kind==='income'?'+ ':'- '}{money(Number(item.amount_minor))}</strong></article>)}</section>
  </>;
}
