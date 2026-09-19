'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

type Card={id:string;name:string;limit_minor:number|null;closing_day:number|null;due_day:number|null};
type Inst={id:string;amount_minor:number;billing_month:string;paid_at:string|null;card_purchases:{description:string|null;card_id:string;is_avoidable:boolean}|null};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function CardManager({onNavigate}:{onNavigate?:(target:string)=>void}){
  const{t,currency,date}=useI18n();
  const[cards,setCards]=useState<Card[]>([]);const[inst,setInst]=useState<Inst[]>([]);const[custom,setCustom]=useState<CustomCategory[]>([]);
  const[openCard,setOpenCard]=useState(false);const[openPurchase,setOpenPurchase]=useState(false);const[name,setName]=useState('');const[limit,setLimit]=useState('');const[closing,setClosing]=useState('');const[due,setDue]=useState('');
  const[cardId,setCardId]=useState('');const[desc,setDesc]=useState('');const[total,setTotal]=useState('');const[count,setCount]=useState('1');const[category,setCategory]=useState('other');const[avoidable,setAvoidable]=useState(false);const[purchaseDate,setPurchaseDate]=useState(localDateISO());const[notice,setNotice]=useState('');
  const[payTarget,setPayTarget]=useState<{card:Card;month:string;amount:number}|null>(null);const[payDate,setPayDate]=useState(localDateISO());const[saving,setSaving]=useState(false);
  const categories=categoryOptions('expense',custom,t);

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const[c,i,ct]=await Promise.all([
      s.from('credit_cards').select('id,name,limit_minor,closing_day,due_day').eq('user_id',user.id).eq('is_active',true).order('created_at'),
      s.from('card_installments').select('id,amount_minor,billing_month,paid_at,card_purchases(description,card_id,is_avoidable)').eq('user_id',user.id).order('billing_month'),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('kind','expense').order('created_at')
    ]);
    const cc=(c.data||[]) as Card[];setCards(cc);setInst((i.data||[]) as unknown as Inst[]);setCustom((ct.data||[]) as CustomCategory[]);if(!cardId&&cc[0])setCardId(cc[0].id);
  }
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener('devinx:finance-updated',refresh);window.addEventListener('devinx:categories-updated',refresh);return()=>{window.removeEventListener('devinx:finance-updated',refresh);window.removeEventListener('devinx:categories-updated',refresh)}},[]);

  const current=localMonthStartISO();
  const stats=useMemo(()=>Object.fromEntries(cards.map(card=>{
    const rows=inst.filter(i=>i.card_purchases?.card_id===card.id);
    const unpaid=rows.filter(i=>!i.paid_at);
    const overdue=unpaid.filter(i=>i.billing_month<current).reduce((a,b)=>a+Number(b.amount_minor),0);
    const now=unpaid.filter(i=>i.billing_month===current).reduce((a,b)=>a+Number(b.amount_minor),0);
    const future=unpaid.filter(i=>i.billing_month>current).reduce((a,b)=>a+Number(b.amount_minor),0);
    const statements=[...new Set(unpaid.filter(i=>i.billing_month<=current).map(i=>i.billing_month))].sort().map(month=>({month,amount:unpaid.filter(i=>i.billing_month===month).reduce((a,b)=>a+Number(b.amount_minor),0)}));
    return[card.id,{overdue,now,future,total:overdue+now+future,statements}];
  })),[cards,inst,current]);

  async function addCard(e:FormEvent){
    e.preventDefault();const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('credit_cards').insert({user_id:user.id,name:name.trim(),limit_minor:limit?minor(limit):null,closing_day:closing?Number(closing):null,due_day:due?Number(due):null});
    if(error){setNotice('Não foi possível salvar o cartão.');return}setName('');setLimit('');setClosing('');setDue('');setOpenCard(false);await load();
  }
  async function addPurchase(e:FormEvent){
    e.preventDefault();const value=minor(total);if(value<=0)return;setSaving(true);const s=createClient();const{error}=await s.rpc('create_card_purchase',{p_card_id:cardId,p_category_id:category,p_description:desc.trim()||null,p_total_minor:value,p_purchased_on:purchaseDate,p_installment_count:Number(count),p_is_avoidable:avoidable});setSaving(false);
    if(error){setNotice('Não foi possível salvar a compra.');return}setDesc('');setTotal('');setCount('1');setCategory('other');setAvoidable(false);setPurchaseDate(localDateISO());setOpenPurchase(false);setNotice(t('cards.saved'));window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  async function pay(e:FormEvent){
    e.preventDefault();if(!payTarget)return;setSaving(true);const s=createClient();const{error}=await s.rpc('settle_card_bill',{p_card_id:payTarget.card.id,p_statement_month:payTarget.month,p_paid_on:payDate});setSaving(false);
    if(error){setNotice('Não foi possível pagar a fatura.');return}setNotice(t('cards.billPaid'));setPayTarget(null);window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  return <div className="cardsPage">
    <section className="moduleSummary"><small>{t('cards.intro')}</small><strong>{t('cards.title')}</strong><span>{t('cards.desc')}</span></section>
    <div className="toolbar"><button className="secondary" onClick={()=>setOpenCard(v=>!v)}>{t('cards.addCard')}</button>{cards.length>0&&<button className="primary" onClick={()=>setOpenPurchase(v=>!v)}>{t('cards.addPurchase')}</button>}{onNavigate&&<button className="goldOutline" onClick={()=>onNavigate('categories')}>{t('cards.categories')}</button>}</div>
    {openCard&&<form className="panel entryForm" onSubmit={addCard}><label>{t('cards.cardName')}<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('cards.closing')}<input type="number" min="1" max="31" value={closing} onChange={e=>setClosing(e.target.value)}/></label><label>{t('cards.dueDay')}<input type="number" min="1" max="31" value={due} onChange={e=>setDue(e.target.value)}/></label><label>{t('cards.limit')} <small>({t('common.optional')})</small><input value={limit} onChange={e=>setLimit(e.target.value)} inputMode="decimal"/></label><button className="primary">{t('common.save')}</button></form>}
    {openPurchase&&<form className="panel entryForm" onSubmit={addPurchase}><label>{t('nav.cards')}<select value={cardId} onChange={e=>setCardId(e.target.value)}>{cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>{t('cards.purchase')}<input required value={desc} onChange={e=>setDesc(e.target.value)}/></label><label>{t('cards.total')}<input required value={total} onChange={e=>setTotal(e.target.value)} inputMode="decimal"/></label><label>{t('cards.installments')}<input type="number" min="1" max="60" value={count} onChange={e=>setCount(e.target.value)} required/></label><label>{t('cards.purchaseDate')}<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} required/></label><label>{t('common.category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label><label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/>{t('quick.avoidable')}</label><button className="primary" disabled={saving}>{saving?t('common.saving'):t('cards.distribute')}</button></form>}
    {notice&&<div className="authMessage">{notice}</div>}

    <section className="cardList">{cards.length===0?<div className="empty"><b>{t('cards.noCards')}</b><p>{t('cards.noCardsText')}</p></div>:cards.map(card=>{const s=stats[card.id]||{overdue:0,now:0,future:0,total:0,statements:[]};return <article className="creditCard" key={card.id}><div className="cardIdentity"><small>{t('nav.cards').toUpperCase()}</small><h3>{card.name}</h3><span>{card.due_day?t('move.due')+' '+card.due_day:'—'}{card.closing_day?' · '+t('cards.closing')+' '+card.closing_day:''}</span>{card.limit_minor!=null&&<span>{t('cards.limit')} {currency(Number(card.limit_minor))}</span>}</div><div className="cardNumbers"><div className={s.overdue>0?'dangerMetric':''}><small>{t('cards.overdue')}</small><strong>{currency(s.overdue)}</strong></div><div><small>{t('cards.thisMonth')}</small><strong>{currency(s.now)}</strong></div><div><small>{t('cards.future')}</small><strong>{currency(s.future)}</strong></div><div className="totalMetric"><small>{t('cards.totalOpen')}</small><strong>{currency(s.total)}</strong></div></div>{s.statements.length>0&&<div className="statementList">{s.statements.map(st=><button key={st.month} onClick={()=>{setPayTarget({card,month:st.month,amount:st.amount});setPayDate(localDateISO())}}><span>{date(st.month,{month:'long',year:'numeric'})}</span><b>{currency(st.amount)}</b><em>{t('cards.payBill')}</em></button>)}</div>}</article>})}</section>

    {payTarget&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPayTarget(null)}}><form className="modalCard" onSubmit={pay}><div className="modalHead"><h2>{t('cards.payBill')}</h2><button type="button" onClick={()=>setPayTarget(null)}>×</button></div><div className="payBillAmount"><small>{payTarget.card.name} · {date(payTarget.month,{month:'long',year:'numeric'})}</small><strong>{currency(payTarget.amount)}</strong></div><label>{t('cards.payDate')}<input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} required/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setPayTarget(null)}>{t('common.cancel')}</button><button className="primary" disabled={saving}>{saving?t('common.saving'):t('common.confirm')}</button></div></form></div>}
  </div>;
}
