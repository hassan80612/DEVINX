'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';
import {
  FuturePlanLike,FutureRecurrence,FutureReserveEntryLike,FutureSettlementLike,
  addCalendarMonths,committedReserveTotal,monthsToDue,nextPendingOccurrence,occurrenceDates,reserveNeed
} from '@/domain/future-planning';
import {useI18n} from '@/i18n/provider';
import {ignoreAutomaticFutureIncome,isAutoFutureIncomeEnabled} from '@/lib/auto-future-income';

type FuturePlan=FuturePlanLike&{created_at:string;updated_at:string};
type Settlement=FutureSettlementLike&{
  id:string;transaction_id:string;created_at:string;
  future_plans:{name:string;kind:'income'|'expense'}|null;
};
type ReserveEntry=FutureReserveEntryLike&{occurred_on:string};

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function FuturePlanningManager(){
  const{t,currency,date}=useI18n();
  const[plans,setPlans]=useState<FuturePlan[]>([]);
  const[settlements,setSettlements]=useState<Settlement[]>([]);
  const[reserveEntries,setReserveEntries]=useState<ReserveEntry[]>([]);
  const[custom,setCustom]=useState<CustomCategory[]>([]);
  const[expanded,setExpanded]=useState(()=>{
    if(typeof window==='undefined')return true;
    try{const saved=localStorage.getItem('devinx_future_planning_expanded');return saved===null?true:saved==='1'}catch{return true}
  });
  const[openIds,setOpenIds]=useState<Record<string,boolean>>({});
  const[editing,setEditing]=useState<FuturePlan|null>(null);
  const[formOpen,setFormOpen]=useState(false);
  const[kind,setKind]=useState<'income'|'expense'>('income');
  const[name,setName]=useState('');
  const[amount,setAmount]=useState('');
  const[dueDate,setDueDate]=useState(localDateISO());
  const[recurrence,setRecurrence]=useState<FutureRecurrence>('once');
  const[category,setCategory]=useState('salary');
  const[reserveEnabled,setReserveEnabled]=useState(false);
  const[settling,setSettling]=useState<{plan:FuturePlan;due:string}|null>(null);
  const[settledAmount,setSettledAmount]=useState('');
  const[settledOn,setSettledOn]=useState(localDateISO());
  const[saving,setSaving]=useState('');
  const[notice,setNotice]=useState('');

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const[p,st,re,c]=await Promise.all([
      s.from('future_plans').select('id,kind,name,amount_minor,category_id,due_date,recurrence,reserve_enabled,is_active,created_at,updated_at').eq('user_id',user.id).order('is_active',{ascending:false}).order('due_date'),
      s.from('future_plan_settlements').select('id,plan_id,due_date,amount_minor,settled_on,transaction_id,created_at,future_plans(name,kind)').eq('user_id',user.id).order('settled_on',{ascending:false}).order('created_at',{ascending:false}).limit(60),
      s.from('reserve_entries').select('kind,amount_minor,future_plan_id,occurred_on').eq('user_id',user.id).not('future_plan_id','is',null),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id)
    ]);
    setPlans((p.data||[]) as FuturePlan[]);
    setSettlements((st.data||[]) as unknown as Settlement[]);
    setReserveEntries((re.data||[]) as ReserveEntry[]);
    setCustom((c.data||[]) as CustomCategory[]);
  }

  useEffect(()=>{load();const refresh=()=>load();window.addEventListener(FINANCE_UPDATED_EVENT,refresh);return()=>window.removeEventListener(FINANCE_UPDATED_EVENT,refresh)},[]);

  const active=plans.filter(p=>p.is_active);
  const today=localDateISO();
  const activeSettlements=settlements as FutureSettlementLike[];
  const settledPlanIds=new Set(settlements.map(s=>s.plan_id));
  const pausedPlans=plans.filter(p=>!p.is_active&&!settledPlanIds.has(p.id));

  const summary=useMemo(()=>{
    const in30=addCalendarMonths(today,1);
    const expectedIncome=active.filter(p=>p.kind==='income').reduce((sum,p)=>{
      const overdue=occurrenceDates(p,p.due_date,today,activeSettlements).filter(d=>d<today).length;
      const upcoming=occurrenceDates(p,today,in30,activeSettlements).length;
      return sum+(overdue+upcoming)*Number(p.amount_minor);
    },0);
    const committed=committedReserveTotal(active,reserveEntries);
    const monthlyNeed=active.filter(p=>p.kind==='expense'&&p.reserve_enabled).reduce((sum,p)=>sum+reserveNeed(p,activeSettlements,reserveEntries,today).monthly,0);
    const nextExpense=active.filter(p=>p.kind==='expense').map(p=>nextPendingOccurrence(p,activeSettlements,today)).filter(Boolean).sort()[0]||null;
    return{expectedIncome,committed,monthlyNeed,nextExpense};
  },[plans,settlements,reserveEntries,today]);

  function toggle(){
    setExpanded(current=>{const next=!current;try{localStorage.setItem('devinx_future_planning_expanded',next?'1':'0')}catch{}return next});
  }
  function openNew(nextKind:'income'|'expense'='income'){
    setEditing(null);setKind(nextKind);setName('');setAmount('');setDueDate(localDateISO());setRecurrence('once');setCategory(nextKind==='income'?'salary':'other');setReserveEnabled(false);setFormOpen(true);setNotice('');
  }
  function openEdit(plan:FuturePlan){
    setEditing(plan);setKind(plan.kind);setName(plan.name);setAmount(String(Number(plan.amount_minor)/100).replace('.',','));setDueDate(plan.due_date);setRecurrence(plan.recurrence);setCategory(plan.category_id);setReserveEnabled(plan.reserve_enabled);setFormOpen(true);setNotice('');
  }
  function changeKind(next:'income'|'expense'){
    setKind(next);setCategory(next==='income'?'salary':'other');if(next==='income')setReserveEnabled(false);
  }
  async function savePlan(e:FormEvent){
    e.preventDefault();
    const value=minor(amount);if(!name.trim()||value<=0)return;
    setSaving('plan');
    try{
      const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
      const payload={kind,name:name.trim(),amount_minor:value,category_id:category,due_date:dueDate,recurrence,reserve_enabled:kind==='expense'&&reserveEnabled,updated_at:new Date().toISOString()};
      const{error}=editing
        ?await s.from('future_plans').update(payload).eq('id',editing.id).eq('user_id',user.id)
        :await s.from('future_plans').insert({user_id:user.id,...payload});
      if(error){setNotice(t('common.errorSave'));return}
      setFormOpen(false);setEditing(null);setNotice(t('future.saved'));
      notifyFinanceUpdated();await load();
    }finally{setSaving('')}
  }
  async function pause(plan:FuturePlan){
    if(!confirm(t(plan.kind==='income'?'future.cancelIncomeConfirm':'future.pauseConfirm')))return;
    setSaving('pause:'+plan.id);
    try{
      const s=createClient();const{error}=await s.from('future_plans').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',plan.id);
      if(error){setNotice(t('common.errorUpdate'));return}
      notifyFinanceUpdated();await load();
    }finally{setSaving('')}
  }
  async function reactivate(plan:FuturePlan){
    setSaving('resume:'+plan.id);
    try{
      const s=createClient();const{error}=await s.from('future_plans').update({is_active:true,updated_at:new Date().toISOString()}).eq('id',plan.id);
      if(error){setNotice(t('common.errorUpdate'));return}
      notifyFinanceUpdated();await load();
    }finally{setSaving('')}
  }
  function openSettlement(plan:FuturePlan){
    const due=nextPendingOccurrence(plan,activeSettlements,today);if(!due)return;
    setSettling({plan,due});setSettledAmount(String(Number(plan.amount_minor)/100).replace('.',','));setSettledOn(today);setNotice('');
  }
  async function confirmSettlement(e:FormEvent){
    e.preventDefault();if(!settling)return;
    const value=minor(settledAmount);if(value<=0)return;
    setSaving('settle');
    try{
      const s=createClient();
      const{error}=await s.rpc('settle_future_plan',{p_plan_id:settling.plan.id,p_due_date:settling.due,p_amount_minor:value,p_settled_on:settledOn});
      if(error){setNotice(t('common.errorSave'));return}
      setSettling(null);setNotice(t(settling.plan.kind==='income'?'future.receivedSaved':'future.paidSaved'));
      notifyFinanceUpdated();await load();
    }finally{setSaving('')}
  }
  async function reserveInstallment(plan:FuturePlan){
    const need=reserveNeed(plan,activeSettlements,reserveEntries,today);if(need.monthly<=0)return;
    const value=Math.min(need.remaining,need.monthly);
    setSaving('reserve:'+plan.id);
    try{
      const s=createClient();const{error}=await s.rpc('record_future_plan_reserve',{p_plan_id:plan.id,p_amount_minor:value,p_occurred_on:today});
      if(error){setNotice(t('common.errorSave'));return}
      setNotice(t('future.reserveSaved'));notifyFinanceUpdated();await load();
    }finally{setSaving('')}
  }
  async function reopen(item:Settlement){
    if(!confirm(t('future.reopenConfirm')))return;
    setSaving('reopen:'+item.id);
    try{
      if(item.future_plans?.kind==='income'&&isAutoFutureIncomeEnabled())ignoreAutomaticFutureIncome(item.plan_id,item.due_date);
      const s=createClient();const{error}=await s.rpc('reopen_future_plan_settlement',{p_settlement_id:item.id});
      if(error){setNotice(t('common.errorUpdate'));return}
      setNotice(t('future.reopened'));notifyFinanceUpdated();await load();
    }finally{setSaving('')}
  }

  const renderPlan=(plan:FuturePlan)=>{
    const due=nextPendingOccurrence(plan,activeSettlements,today);
    const need=reserveNeed(plan,activeSettlements,reserveEntries,today);
    const isOpen=openIds[plan.id]!==false;
    const overdue=!!due&&due<today;
    const awaitingReceipt=plan.kind==='income'&&!!due&&due<=today;
    const lateReceipt=awaitingReceipt&&due<today;
    return <article className={'futurePlanCard '+plan.kind+(overdue?' overdue':'')+(awaitingReceipt?' awaitingReceipt':'')+(!isOpen?' collapsed':'')} key={plan.id}>
      <button type="button" className="futurePlanHead" onClick={()=>setOpenIds(current=>({...current,[plan.id]:!isOpen}))} aria-expanded={isOpen}>
        <span className="futurePlanIcon">{plan.kind==='income'?'＋':'−'}</span>
        <div><small>{t(plan.kind==='income'?'future.income':'future.expense')}</small><h3>{plan.name}</h3>{awaitingReceipt&&<span className={'futureReceiptStatus '+(lateReceipt?'late':'waiting')}>{t(lateReceipt?'future.receiptLate':'future.awaitingReceipt')}</span>}</div>
        <strong className={plan.kind==='income'?'positive':''}>{currency(Number(plan.amount_minor))}</strong>
        <i>{isOpen?'⌃':'⌄'}</i>
      </button>
      {isOpen&&<div className="futurePlanBody">
        <div className="futurePlanFacts">
          <span><small>{t(awaitingReceipt?'future.plannedDate':'future.nextDate')}</small><b>{due?date(due,{day:'2-digit',month:'short',year:'numeric'}):t('future.noNext')}</b></span>
          <span><small>{t('future.recurrence')}</small><b>{t('future.recurrence.'+plan.recurrence)}</b></span>
          {plan.kind==='expense'&&plan.reserve_enabled&&<><span><small>{t('future.reserved')}</small><b>{currency(need.committed)}</b></span><span><small>{t('future.perMonth')}</small><b>{currency(need.monthly)}</b></span></>}
        </div>
        {awaitingReceipt&&<div className={'futureReceiptNotice '+(lateReceipt?'late':'waiting')}><b>{t(lateReceipt?'future.receiptLate':'future.awaitingReceipt')}</b><span>{t('future.awaitingReceiptHelp')}</span></div>}
        {plan.kind==='expense'&&plan.reserve_enabled&&need.due&&<div className="futureReserveProgress">
          <div><span>{t('future.reserveProgress')}</span><b>{currency(need.committed)} / {currency(Number(plan.amount_minor))}</b></div>
          <div className="bar"><i style={{width:Math.min(100,Math.round(need.committed/Math.max(1,Number(plan.amount_minor))*100))+'%'}}/></div>
          <small>{need.remaining>0?t('future.reserveExplain'):t('future.reserveCovered')}</small>
        </div>}
        <div className="futurePlanActions">
          {due&&<button className="primary" type="button" onClick={()=>openSettlement(plan)}>{plan.kind==='income'?t('future.confirmReceived'):t('future.confirmPaid')}</button>}
          {plan.kind==='expense'&&plan.reserve_enabled&&need.monthly>0&&<button className="goldOutline" type="button" disabled={saving==='reserve:'+plan.id} onClick={()=>reserveInstallment(plan)}>{saving==='reserve:'+plan.id?<span className="buttonSpinner"/>:'◇'} {t('future.reserveInstallment')} {currency(Math.min(need.remaining,need.monthly))}</button>}
          <button className="textButton" type="button" onClick={()=>openEdit(plan)}>{t('common.edit')}</button>
          <button className="textButton dangerText" type="button" onClick={()=>pause(plan)}>{t(plan.kind==='income'?'future.cancelIncome':'future.pause')}</button>
        </div>
      </div>}
    </article>;
  };

  return <section className={'panel futurePlanningPanel '+(!expanded?'isCollapsed':'')}>
    <div className="futurePlanningHead">
      <div><small>{t('future.eyebrow')}</small><h2>{t('future.title')}</h2><p>{t('future.lead')}</p></div>
      <button className="collapseToggle" type="button" onClick={toggle} aria-expanded={expanded}>{expanded?t('common.collapseSection'):t('common.expandSection')} <i>{expanded?'⌃':'⌄'}</i></button>
    </div>

    {!expanded&&<div className="futureCollapsedSummary"><span>{t('future.monthlyToReserve')}</span><b>{currency(summary.monthlyNeed)}</b><small>{t('future.expected30')}: {currency(summary.expectedIncome)}</small></div>}

    {expanded&&<div className="collapsibleBody futurePlanningBody">
      <div className="futureSummaryGrid">
        <article><small>{t('future.expected30')}</small><b className="positive">{currency(summary.expectedIncome)}</b></article>
        <article><small>{t('future.monthlyToReserve')}</small><b>{currency(summary.monthlyNeed)}</b></article>
        <article><small>{t('future.committedReserve')}</small><b>{currency(summary.committed)}</b></article>
        <article><small>{t('future.nextExpense')}</small><b>{summary.nextExpense?date(summary.nextExpense,{day:'2-digit',month:'short'}):'—'}</b></article>
      </div>

      <div className="futureCreateActions"><button className="primary" type="button" onClick={()=>openNew('income')}>＋ {t('future.addIncome')}</button><button className="goldOutline" type="button" onClick={()=>openNew('expense')}>− {t('future.addExpense')}</button></div>

      {notice&&<div className="authMessage">{notice}</div>}

      <div className="futurePlanColumns">
        <section><div className="futureGroupTitle"><small>{t('future.incomes')}</small><span>{active.filter(p=>p.kind==='income').length}</span></div>{active.filter(p=>p.kind==='income').length?active.filter(p=>p.kind==='income').map(renderPlan):<div className="futureEmpty">{t('future.noIncome')}</div>}</section>
        <section><div className="futureGroupTitle"><small>{t('future.expenses')}</small><span>{active.filter(p=>p.kind==='expense').length}</span></div>{active.filter(p=>p.kind==='expense').length?active.filter(p=>p.kind==='expense').map(renderPlan):<div className="futureEmpty">{t('future.noExpense')}</div>}</section>
      </div>

      {pausedPlans.length>0&&<div className="futurePaused"><small>{t('future.paused')}</small>{pausedPlans.map(p=><button type="button" key={p.id} disabled={saving==='resume:'+p.id} onClick={()=>reactivate(p)}><span>{p.name}</span><b>{t('future.reactivate')}</b></button>)}</div>}

      <section className="futureHistory">
        <div className="sectionTitleRow"><div><small>{t('common.history').toUpperCase()}</small><h3>{t('future.history')}</h3></div><span>{settlements.length}</span></div>
        {settlements.length===0?<div className="futureEmpty">{t('future.noHistory')}</div>:settlements.slice(0,20).map(item=><article key={item.id}>
          <span className={item.future_plans?.kind==='income'?'positive':'negative'}>{item.future_plans?.kind==='income'?'＋':'−'}</span>
          <div><b>{item.future_plans?.name||t('future.title')}</b><small>{date(item.settled_on,{day:'2-digit',month:'short',year:'numeric'})} · {t('future.plannedFor')} {date(item.due_date,{day:'2-digit',month:'short'})}</small></div>
          <strong>{currency(Number(item.amount_minor))}</strong>
          <button className="textButton" type="button" disabled={saving==='reopen:'+item.id} onClick={()=>reopen(item)}>{t(item.future_plans?.kind==='income'?'future.notReceived':'future.reopen')}</button>
        </article>)}
      </section>
    </div>}

    {formOpen&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><form className="modalCard futurePlanForm" onSubmit={savePlan}>
      <div className="modalHead"><h2>{editing?t('future.editPlan'):t('future.newPlan')}</h2><button type="button" onClick={()=>setFormOpen(false)}>×</button></div>
      <div className="futureKindTabs"><button type="button" className={kind==='income'?'active':''} onClick={()=>changeKind('income')}>＋ {t('future.income')}</button><button type="button" className={kind==='expense'?'active':''} onClick={()=>changeKind('expense')}>− {t('future.expense')}</button></div>
      <label>{t('future.name')}<input value={name} onChange={e=>setName(e.target.value)} required maxLength={120} placeholder={kind==='income'?t('future.incomePlaceholder'):t('future.expensePlaceholder')}/></label>
      <label>{t('common.value')}<input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('future.category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{categoryOptions(kind,custom,t).map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
      <label>{t('future.firstDate')}<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></label>
      <label>{t('future.recurrence')}<select value={recurrence} onChange={e=>setRecurrence(e.target.value as FutureRecurrence)}><option value="once">{t('future.recurrence.once')}</option><option value="monthly">{t('future.recurrence.monthly')}</option><option value="annual">{t('future.recurrence.annual')}</option></select></label>
      {kind==='expense'&&<label className="switchRow"><input type="checkbox" checked={reserveEnabled} onChange={e=>setReserveEnabled(e.target.checked)}/><span><b>{t('future.prepareReserve')}</b><small>{t('future.prepareReserveHelp')}</small></span></label>}
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setFormOpen(false)}>{t('common.cancel')}</button><button className="primary" disabled={saving==='plan'} aria-busy={saving==='plan'}>{saving==='plan'?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.save')}</button></div>
    </form></div>}

    {settling&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSettling(null)}}><form className="modalCard" onSubmit={confirmSettlement}>
      <div className="modalHead"><h2>{settling.plan.kind==='income'?t('future.confirmReceived'):t('future.confirmPaid')}</h2><button type="button" onClick={()=>setSettling(null)}>×</button></div>
      <div className="settingsNote"><b>{settling.plan.name}</b><span>{t('future.plannedFor')} {date(settling.due,{day:'2-digit',month:'long',year:'numeric'})}</span></div>
      <label>{t('common.value')}<input value={settledAmount} onChange={e=>setSettledAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('common.date')}<input type="date" value={settledOn} onChange={e=>setSettledOn(e.target.value)} required/><small>{t('future.earlyHelp')}</small></label>
      {settling.plan.kind==='expense'&&settling.plan.reserve_enabled&&<div className="settingsNote"><b>{t('future.usesCommittedReserve')}</b><span>{t('future.usesCommittedReserveHelp')}</span></div>}
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setSettling(null)}>{t('common.cancel')}</button><button className="primary" disabled={saving==='settle'} aria-busy={saving==='settle'}>{saving==='settle'?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.confirm')}</button></div>
    </form></div>}
  </section>;
}
