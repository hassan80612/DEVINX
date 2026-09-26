'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

type Card={id:string;name:string;limit_minor:number|null;closing_day:number|null;due_day:number|null};
type Inst={id:string;installment_number:number;amount_minor:number;billing_month:string;due_date:string|null;paid_at:string|null;card_purchases:{description:string|null;card_id:string;category_id:string;is_avoidable:boolean;installment_count:number}|null};
type ItemPay={id:string;amount_minor:number;occurred_on:string;source_id:string|null};
type OpenInst=Inst&{paid:number;remaining:number};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
function statementDueDate(month:string,dueDay:number|null){
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  const max=new Date(y,m,0).getDate();
  const day=Math.min(Math.max(Number(dueDay||1),1),max);
  return month.slice(0,8)+String(day).padStart(2,'0');
}

export function CardManager({onNavigate}:{onNavigate?:(target:string)=>void}){
  const{t,currency,date}=useI18n();
  const[cards,setCards]=useState<Card[]>([]);const[inst,setInst]=useState<Inst[]>([]);const[itemPays,setItemPays]=useState<ItemPay[]>([]);const[custom,setCustom]=useState<CustomCategory[]>([]);
  const[openCard,setOpenCard]=useState(false);const[openPurchase,setOpenPurchase]=useState(false);const[name,setName]=useState('');const[limit,setLimit]=useState('');const[closing,setClosing]=useState('');const[due,setDue]=useState('');
  const[cardId,setCardId]=useState('');const[desc,setDesc]=useState('');const[total,setTotal]=useState('');const[count,setCount]=useState('1');const[category,setCategory]=useState('other');const[avoidable,setAvoidable]=useState(false);const[purchaseDate,setPurchaseDate]=useState(localDateISO());const[firstDueDate,setFirstDueDate]=useState('');const[notice,setNotice]=useState('');
  const[payTarget,setPayTarget]=useState<{card:Card;installment:OpenInst;dueDate:string}|null>(null);const[payDate,setPayDate]=useState(localDateISO());const[payAmount,setPayAmount]=useState('');const[payMode,setPayMode]=useState<'partial'|'settle'>('partial');const[saving,setSaving]=useState(false);const[expandedCards,setExpandedCards]=useState<Set<string>>(new Set());const[editingCard,setEditingCard]=useState<Card|null>(null);const[eCardName,setECardName]=useState('');const[eCardLimit,setECardLimit]=useState('');const[eCardClosing,setECardClosing]=useState('');const[eCardDue,setECardDue]=useState('');
  const categories=categoryOptions('expense',custom,t);
  function toggleCard(id:string){setExpandedCards(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next})}
  function toggleAll(){setExpandedCards(prev=>prev.size===cards.length?new Set():new Set(cards.map(card=>card.id)))}

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const[c,i,p,ct]=await Promise.all([
      s.from('credit_cards').select('id,name,limit_minor,closing_day,due_day').eq('user_id',user.id).eq('is_active',true).order('created_at'),
      s.from('card_installments').select('id,installment_number,amount_minor,billing_month,due_date,paid_at,card_purchases(description,card_id,category_id,is_avoidable,installment_count)').eq('user_id',user.id).order('billing_month').order('installment_number'),
      s.from('transactions').select('id,amount_minor,occurred_on,source_id').eq('user_id',user.id).eq('source_type','card_installment_payment').order('occurred_on'),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('kind','expense').order('created_at')
    ]);
    const cc=(c.data||[]) as Card[];setCards(cc);setInst((i.data||[]) as unknown as Inst[]);setItemPays((p.data||[]) as ItemPay[]);setCustom((ct.data||[]) as CustomCategory[]);if(cc[0]&&!cc.some(card=>card.id===cardId))setCardId(cc[0].id);if(cc.length===0)setCardId('');
  }
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener(FINANCE_UPDATED_EVENT,refresh);window.addEventListener('devinx:categories-updated',refresh);return()=>{window.removeEventListener(FINANCE_UPDATED_EVENT,refresh);window.removeEventListener('devinx:categories-updated',refresh)}},[]);

  const current=localMonthStartISO();
  const stats=useMemo(()=>Object.fromEntries(cards.map(card=>{
    const paidMap=new Map<string,number>();
    itemPays.forEach(p=>{if(p.source_id)paidMap.set(p.source_id,(paidMap.get(p.source_id)||0)+Number(p.amount_minor))});
    const rows=inst.filter(i=>i.card_purchases?.card_id===card.id).map(i=>{
      const linkedPaid=paidMap.get(i.id)||0;
      const paid=i.paid_at?Number(i.amount_minor):Math.min(Number(i.amount_minor),linkedPaid);
      return{...i,paid,remaining:Math.max(0,Number(i.amount_minor)-paid)} as OpenInst;
    });
    const unpaid=rows.filter(i=>i.remaining>0);
    const rowMonth=(i:Inst)=>(i.due_date||i.billing_month).slice(0,7)+'-01';
    const today=localDateISO();
    const overdue=unpaid.filter(i=>(i.due_date||statementDueDate(i.billing_month,card.due_day))<today).reduce((a,b)=>a+b.remaining,0);
    const now=unpaid.filter(i=>rowMonth(i)===current&&(i.due_date||statementDueDate(i.billing_month,card.due_day))>=today).reduce((a,b)=>a+b.remaining,0);
    const future=unpaid.filter(i=>rowMonth(i)>current).reduce((a,b)=>a+b.remaining,0);
    const statements=[...new Set(unpaid.map(i=>i.billing_month))].sort().map(month=>{
      const monthRows=unpaid.filter(i=>i.billing_month===month);
      return{month,amount:monthRows.reduce((a,b)=>a+b.remaining,0),dueDate:monthRows.find(i=>i.due_date)?.due_date||statementDueDate(month,card.due_day),rows:monthRows};
    });
    return[card.id,{overdue,now,future,total:unpaid.reduce((a,b)=>a+b.remaining,0),statements}];
  })),[cards,inst,itemPays,current]);

  async function addCard(e:FormEvent){
    e.preventDefault();const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('credit_cards').insert({user_id:user.id,name:name.trim(),limit_minor:limit?minor(limit):null,closing_day:closing?Number(closing):null,due_day:due?Number(due):null});
    if(error){setNotice(t('common.errorSave'));return}setName('');setLimit('');setClosing('');setDue('');setOpenCard(false);await load();
  }
  async function addPurchase(e:FormEvent){
    e.preventDefault();const value=minor(total);if(value<=0)return;setSaving(true);const s=createClient();const{error}=await s.rpc('create_card_purchase_v2',{p_card_id:cardId,p_category_id:category,p_description:desc.trim()||null,p_total_minor:value,p_purchased_on:purchaseDate,p_installment_count:Number(count),p_is_avoidable:avoidable,p_first_due_date:firstDueDate||null});setSaving(false);
    if(error){setNotice(t('common.errorSave'));return}setDesc('');setTotal('');setCount('1');setCategory('other');setAvoidable(false);setPurchaseDate(localDateISO());setFirstDueDate('');setOpenPurchase(false);setNotice(t('cards.saved'));notifyFinanceUpdated();await load();
  }
  function startCardEdit(card:Card){
    setEditingCard(card);setECardName(card.name);setECardLimit(card.limit_minor==null?'':String(Number(card.limit_minor)/100).replace('.',','));setECardClosing(card.closing_day==null?'':String(card.closing_day));setECardDue(card.due_day==null?'':String(card.due_day));setNotice('');
  }
  async function saveCardEdit(e:FormEvent){
    e.preventDefault();if(!editingCard)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('credit_cards').update({name:eCardName.trim(),limit_minor:eCardLimit?minor(eCardLimit):null,closing_day:eCardClosing?Number(eCardClosing):null,due_day:eCardDue?Number(eCardDue):null}).eq('id',editingCard.id).eq('user_id',user.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    setEditingCard(null);setNotice(t('cards.cardUpdated'));notifyFinanceUpdated();await load();
  }
  async function archiveCard(card:Card){
    if(!confirm(t('cards.deleteConfirm')))return;const s=createClient();const{error}=await s.rpc('archive_credit_card',{p_card_id:card.id});
    if(error){setNotice(t('cards.deleteOpenError'));return}
    setNotice(t('cards.cardDeleted'));if(cardId===card.id)setCardId('');notifyFinanceUpdated();await load();
  }

  async function pay(e:FormEvent){
    e.preventDefault();if(!payTarget)return;
    const value=minor(payAmount);
    if(value<=0)return;
    if(value>payTarget.installment.remaining){setNotice(t('cards.paymentTooHigh'));return}
    setSaving(true);
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){setSaving(false);return}
    const installment=payTarget.installment;const purchase=installment.card_purchases;
    const{data:created,error:txError}=await s.from('transactions').insert({
      user_id:user.id,type:'expense',category_id:purchase?.category_id||'card_payment',
      description:purchase?.description||payTarget.card.name,amount_minor:value,
      occurred_on:payDate,payment_method:null,is_avoidable:!!purchase?.is_avoidable,is_recurring:false,
      source_type:'card_installment_payment',source_id:installment.id
    }).select('id').single();
    if(txError||!created?.id){setSaving(false);setNotice(t('common.errorSave'));return}
    const willFinish=payMode==='settle'||installment.paid+value>=Number(installment.amount_minor);
    if(willFinish){
      const paidAt=new Date(payDate+'T12:00:00').toISOString();
      const{error:installmentError}=await s.from('card_installments').update({paid_at:paidAt}).eq('id',installment.id).eq('user_id',user.id);
      if(installmentError){
        await s.from('transactions').delete().eq('id',created.id).eq('user_id',user.id);
        setSaving(false);setNotice(t('common.errorSave'));return
      }
    }else if(installment.paid_at){
      await s.from('card_installments').update({paid_at:null}).eq('id',installment.id).eq('user_id',user.id);
    }
    setSaving(false);setNotice(payMode==='settle'&&installment.paid+value<Number(installment.amount_minor)?t('cards.discountSettled'):willFinish?t('cards.itemPaid'):t('cards.partialPaid'));setPayTarget(null);setPayAmount('');setPayMode('partial');notifyFinanceUpdated();await load();
  }

  return <div className="cardsPage">
    <section className="moduleSummary"><small>{t('cards.intro')}</small><strong>{t('cards.title')}</strong><span>{t('cards.desc')}</span></section>
    <div className="toolbar"><button className="secondary" onClick={()=>setOpenCard(v=>!v)}>{t('cards.addCard')}</button>{cards.length>0&&<button className="primary" onClick={()=>setOpenPurchase(v=>!v)}>{t('cards.addPurchase')}</button>}{onNavigate&&<button className="goldOutline" onClick={()=>onNavigate('categories')}>{t('cards.categories')}</button>}{cards.length>1&&<button className="ghost compactButton" onClick={toggleAll}>{expandedCards.size===cards.length?t('common.collapseAll'):t('common.expandAll')}</button>}</div>
    {openCard&&<form className="panel entryForm" onSubmit={addCard}><label>{t('cards.cardName')}<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('cards.closing')}<input type="number" min="1" max="31" value={closing} onChange={e=>setClosing(e.target.value)}/></label><label>{t('cards.dueDay')}<input type="number" min="1" max="31" value={due} onChange={e=>setDue(e.target.value)}/></label><label>{t('cards.limit')} <small>({t('common.optional')})</small><input value={limit} onChange={e=>setLimit(e.target.value)} inputMode="decimal"/></label><button className="primary">{t('common.save')}</button></form>}
    {openPurchase&&<form className="panel entryForm" onSubmit={addPurchase}><label>{t('nav.cards')}<select value={cardId} onChange={e=>setCardId(e.target.value)}>{cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>{t('cards.purchase')}<input required value={desc} onChange={e=>setDesc(e.target.value)}/></label><label>{t('cards.total')}<input required value={total} onChange={e=>setTotal(e.target.value)} inputMode="decimal"/></label><label>{t('cards.installments')}<input type="number" min="1" max="60" value={count} onChange={e=>setCount(e.target.value)} required/></label><label>{t('cards.purchaseDate')}<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} required/></label><label>{t('cards.firstDueDate')} <small>({t('common.optional')})</small><input type="date" value={firstDueDate} onChange={e=>setFirstDueDate(e.target.value)}/><small>{t('cards.firstDueDateHelp')}</small></label><label>{t('common.category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label><label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/>{t('quick.avoidable')}</label><button className="primary" disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('cards.distribute')}</button></form>}
    {notice&&<div className="authMessage">{notice}</div>}

    <section className="cardList">{cards.length===0?<div className="empty"><b>{t('cards.noCards')}</b><p>{t('cards.noCardsText')}</p></div>:cards.map(card=>{const s=stats[card.id]||{overdue:0,now:0,future:0,total:0,statements:[]};const opened=expandedCards.has(card.id);return <article className={'creditCard collapsibleCard '+(opened?'expanded':'collapsed')} key={card.id}>
      <button type="button" className="collapseHeader cardCollapseHeader" onClick={()=>toggleCard(card.id)} aria-expanded={opened}>
        <div className="cardIdentity"><small>{t('nav.cards').toUpperCase()}</small><h3>{card.name}</h3><span>{card.due_day?t('cards.dueDay')+' '+card.due_day:'—'}{card.closing_day?' · '+t('cards.closing')+' '+card.closing_day:''}</span></div>
        <div className="cardCompactNumbers"><span><small>{t('cards.thisMonth')}</small><b>{currency(s.now)}</b></span><span><small>{t('cards.totalOpen')}</small><b>{currency(s.total)}</b></span></div>
        <em>{opened?'−':'＋'}</em>
      </button>
      {opened&&<div className="collapsibleBody">
        <div className="cardManageRow"><div>{card.limit_minor!=null&&<div className="cardLimitLine"><span>{t('cards.limit')}</span><b>{currency(Number(card.limit_minor))}</b></div>}</div><div className="cardManageActions"><button className="textButton" type="button" onClick={()=>startCardEdit(card)}>{t('common.edit')}</button><button className="dangerText textButton" type="button" onClick={()=>archiveCard(card)}>{t('common.delete')}</button></div></div>
        <div className="cardNumbers"><div className={s.overdue>0?'dangerMetric':''}><small>{t('cards.overdue')}</small><strong>{currency(s.overdue)}</strong></div><div><small>{t('cards.thisMonth')}</small><strong>{currency(s.now)}</strong></div><div><small>{t('cards.future')}</small><strong>{currency(s.future)}</strong></div><div className="totalMetric"><small>{t('cards.totalOpen')}</small><strong>{currency(s.total)}</strong></div></div>
        {s.statements.length>0&&<div className="statementList">{s.statements.map(st=><section className="statementGroup" key={st.month}><div className="statementHead"><span>{t('move.dueOn')} {date(st.dueDate,{day:'2-digit',month:'2-digit',year:'numeric'})}</span><b>{currency(st.amount)}</b><small>{t('cards.statementTotal')}</small></div><div className="statementItems">{st.rows.map(item=><button type="button" key={item.id} onClick={()=>{setPayTarget({card,installment:item,dueDate:item.due_date||st.dueDate});setPayDate(localDateISO());setPayAmount(String(item.remaining/100).replace('.',','));setPayMode('partial')}}><span><b>{item.card_purchases?.description||card.name}</b><small>{item.card_purchases?.installment_count&&item.card_purchases.installment_count>1?item.installment_number+'/'+item.card_purchases.installment_count+' · ':''}{t('move.dueOn')} {date(item.due_date||st.dueDate,{day:'2-digit',month:'2-digit'})}{item.paid>0?' · '+t('cards.paidSoFar')+' '+currency(item.paid):''}</small></span><strong>{currency(item.remaining)}</strong><em>{t('cards.payItem')}</em></button>)}</div></section>)}</div>}
      </div>}
    </article>})}</section>

    {editingCard&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditingCard(null)}}><form className="modalCard" onSubmit={saveCardEdit}><div className="modalHead"><h2>{t('common.edit')} · {editingCard.name}</h2><button type="button" onClick={()=>setEditingCard(null)}>×</button></div><label>{t('cards.cardName')}<input required value={eCardName} onChange={e=>setECardName(e.target.value)}/></label><label>{t('cards.closing')}<input type="number" min="1" max="31" value={eCardClosing} onChange={e=>setECardClosing(e.target.value)}/></label><label>{t('cards.dueDay')}<input type="number" min="1" max="31" value={eCardDue} onChange={e=>setECardDue(e.target.value)}/></label><label>{t('cards.limit')} <small>({t('common.optional')})</small><input value={eCardLimit} onChange={e=>setECardLimit(e.target.value)} inputMode="decimal"/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditingCard(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}

    {payTarget&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPayTarget(null)}}><form className="modalCard" onSubmit={pay}><div className="modalHead"><h2>{t('cards.payItem')}</h2><button type="button" onClick={()=>setPayTarget(null)}>×</button></div><div className="payBillAmount"><small>{payTarget.card.name} · {payTarget.installment.card_purchases?.description||t('cards.purchase')} · {t('move.dueOn')} {date(payTarget.dueDate,{day:'2-digit',month:'2-digit',year:'numeric'})}</small><strong>{currency(payTarget.installment.remaining)}</strong>{payTarget.installment.paid>0&&<span>{t('cards.paidSoFar')}: {currency(payTarget.installment.paid)} · {t('cards.originalValue')}: {currency(Number(payTarget.installment.amount_minor))}</span>}<span>{t('cards.individualPaymentHelp')}</span></div><label>{t('cards.amountToPay')}<input value={payAmount} onChange={e=>setPayAmount(e.target.value)} inputMode="decimal" required/></label><div className="paymentModePicker" role="group" aria-label={t('cards.paymentMode')}><button type="button" className={payMode==='partial'?'active':''} onClick={()=>setPayMode('partial')}><b>{t('cards.partialMode')}</b><small>{t('cards.partialModeHelp')}</small></button><button type="button" className={payMode==='settle'?'active':''} onClick={()=>setPayMode('settle')}><b>{t('cards.settleMode')}</b><small>{t('cards.settleModeHelp')}</small></button></div><label>{t('cards.payDate')}<input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} required/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setPayTarget(null)}>{t('common.cancel')}</button><button className="primary" disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.confirm')}</button></div></form></div>}
  </div>;
}
