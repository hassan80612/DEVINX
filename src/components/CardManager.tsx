'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';

type Card={id:string;name:string;limit_minor:number|null;closing_day:number|null;due_day:number|null};
type Installment={id:string;amount_minor:number;billing_month:string;paid_at:string|null;card_purchases:{description:string|null;card_id:string;is_avoidable:boolean}|null};
const brl=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const minor=(v:string)=>Math.round((Number(v.replace(/\./g,'').replace(',','.'))||0)*100);

export function CardManager(){
  const[cards,setCards]=useState<Card[]>([]);
  const[installments,setInstallments]=useState<Installment[]>([]);
  const[openCard,setOpenCard]=useState(false);
  const[openPurchase,setOpenPurchase]=useState(false);
  const[name,setName]=useState('');
  const[limit,setLimit]=useState('');
  const[closing,setClosing]=useState('');
  const[due,setDue]=useState('');
  const[cardId,setCardId]=useState('');
  const[desc,setDesc]=useState('');
  const[total,setTotal]=useState('');
  const[count,setCount]=useState('1');
  const[category,setCategory]=useState('other');
  const[avoidable,setAvoidable]=useState(false);
  const[purchaseDate,setPurchaseDate]=useState(localDateISO());
  const[notice,setNotice]=useState('');

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const month=localMonthStartISO();
    const[{data:c},{data:i}]=await Promise.all([
      s.from('credit_cards').select('id,name,limit_minor,closing_day,due_day').eq('user_id',user.id).eq('is_active',true).order('created_at'),
      s.from('card_installments').select('id,amount_minor,billing_month,paid_at,card_purchases(description,card_id,is_avoidable)').eq('user_id',user.id).gte('billing_month',month).order('billing_month')
    ]);
    setCards((c||[]) as Card[]);
    setInstallments((i||[]) as unknown as Installment[]);
    if(!cardId&&c?.[0])setCardId(c[0].id);
  }
  useEffect(()=>{load()},[]);

  const currentMonth=localMonthStartISO();
  const currentInstallments=useMemo(()=>installments.filter(i=>i.billing_month===currentMonth),[installments,currentMonth]);
  const billByCard=useMemo(()=>Object.fromEntries(cards.map(card=>[card.id,currentInstallments.filter(i=>i.card_purchases?.card_id===card.id).reduce((a,b)=>a+Number(b.amount_minor),0)])),[cards,currentInstallments]);
  const futureByCard=useMemo(()=>Object.fromEntries(cards.map(card=>[card.id,installments.filter(i=>i.billing_month>currentMonth&&i.card_purchases?.card_id===card.id).reduce((a,b)=>a+Number(b.amount_minor),0)])),[cards,installments,currentMonth]);

  async function addCard(e:FormEvent){
    e.preventDefault();
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('credit_cards').insert({user_id:user.id,name:name.trim(),limit_minor:limit?minor(limit):null,closing_day:closing?Number(closing):null,due_day:due?Number(due):null});
    if(error){setNotice('Não foi possível salvar o cartão.');return}
    setName('');setLimit('');setClosing('');setDue('');setOpenCard(false);setNotice('');
    await load();
  }

  async function addPurchase(e:FormEvent){
    e.preventDefault();
    const value=minor(total);
    if(value<=0){setNotice('Informe o valor da compra.');return}
    const s=createClient();
    const{error}=await s.rpc('create_card_purchase',{p_card_id:cardId,p_category_id:category,p_description:desc.trim()||null,p_total_minor:value,p_purchased_on:purchaseDate,p_installment_count:Number(count),p_is_avoidable:avoidable});
    if(error){setNotice('Não foi possível salvar a compra.');return}
    setDesc('');setTotal('');setCount('1');setCategory('other');setAvoidable(false);setPurchaseDate(localDateISO());setOpenPurchase(false);setNotice('Compra registrada e distribuída nas faturas corretas.');
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load();
  }

  async function settle(id:string){
    const s=createClient();
    const{error}=await s.rpc('settle_card_bill',{p_card_id:id,p_statement_month:localMonthStartISO(),p_paid_on:localDateISO()});
    if(error){setNotice('Não foi possível marcar a fatura como paga.');return}
    setNotice('Fatura marcada como paga. O pagamento não virou uma segunda despesa.');
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load();
  }

  return <>
    <div className="toolbar"><button className="primary" onClick={()=>setOpenCard(v=>!v)}>+ Adicionar cartão</button>{cards.length>0&&<button className="secondary" onClick={()=>setOpenPurchase(v=>!v)}>+ Registrar compra</button>}</div>
    {openCard&&<form className="entryForm" onSubmit={addCard}><label>Nome<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Nubank"/></label><label>Limite<input value={limit} onChange={e=>setLimit(e.target.value)} placeholder="0,00" inputMode="decimal"/></label><label>Dia de fechamento<input value={closing} onChange={e=>setClosing(e.target.value)} inputMode="numeric" min="1" max="31"/></label><label>Dia de vencimento<input value={due} onChange={e=>setDue(e.target.value)} inputMode="numeric" min="1" max="31"/></label><button className="primary">Salvar cartão</button></form>}
    {openPurchase&&<form className="entryForm" onSubmit={addPurchase}><label>Cartão<select required value={cardId} onChange={e=>setCardId(e.target.value)}>{cards.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Descrição<input required value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ex.: notebook"/></label><label>Valor total<input required value={total} onChange={e=>setTotal(e.target.value)} inputMode="decimal" placeholder="0,00"/></label><label>Parcelas<input required type="number" min="1" max="60" value={count} onChange={e=>setCount(e.target.value)}/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}><option value="food">Alimentação</option><option value="groceries">Mercado</option><option value="transport">Transporte</option><option value="health">Saúde</option><option value="education">Educação</option><option value="subscriptions">Assinaturas</option><option value="leisure">Lazer</option><option value="other">Outros</option></select></label><label>Data da compra<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} required/></label><label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/> É um gasto evitável</label><button className="primary">Salvar compra</button></form>}
    {notice&&<div className="authMessage">{notice}</div>}
    <section className="cardList">{cards.length===0?<div className="empty"><b>Nenhum cartão cadastrado</b><p>Adicione um cartão para acompanhar fatura, limite e parcelas futuras.</p></div>:cards.map(card=>{const bill=Number(billByCard[card.id]||0);const future=Number(futureByCard[card.id]||0);const rows=currentInstallments.filter(i=>i.card_purchases?.card_id===card.id);const paid=rows.length>0&&rows.every(i=>i.paid_at);return <article className="creditCard" key={card.id}><div><small>CARTÃO</small><h3>{card.name}</h3><span>Limite {card.limit_minor?brl(card.limit_minor):'não informado'}</span><span>Fechamento {card.closing_day?'dia '+card.closing_day:'não informado'}</span><span>Parcelas futuras {brl(future)}</span></div><div className="billBox"><small>Fatura do mês</small><strong>{brl(bill)}</strong><span>{card.due_day?'Vence dia '+card.due_day:'Vencimento não informado'}</span>{bill>0&&<button onClick={()=>settle(card.id)} disabled={paid}>{paid?'Fatura paga':'Marcar fatura paga'}</button>}</div></article>})}</section>
  </>;
}
