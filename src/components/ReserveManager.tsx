'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

type ReserveEntry={
  id:string;
  kind:'deposit'|'withdraw';
  amount_minor:number;
  occurred_on:string;
  note:string|null;
  future_plan_id:string|null;
  created_at:string;
};
type PurchaseGoal={
  id:string;
  description:string;
  target_minor:number;
  target_date:string|null;
  is_active:boolean;
  completed_at:string|null;
  created_at:string;
};

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

function monthsUntil(target:string){
  const now=new Date();
  const end=new Date(target+'T12:00:00');
  if(end.getTime()<=now.getTime())return 1;
  return Math.max(1,(end.getFullYear()-now.getFullYear())*12+(end.getMonth()-now.getMonth())+1);
}

export function ReserveManager(){
  const{t,currency,date}=useI18n();
  const[entries,setEntries]=useState<ReserveEntry[]>([]);
  const[goal,setGoal]=useState<PurchaseGoal|null>(null);
  const[mode,setMode]=useState<'deposit'|'withdraw'|'none'>('none');
  const[amount,setAmount]=useState('');
  const[occurredOn,setOccurredOn]=useState(localDateISO());
  const[note,setNote]=useState('');
  const[notice,setNotice]=useState('');
  const[saving,setSaving]=useState(false);

  const[goalOpen,setGoalOpen]=useState(false);
  const[goalDescription,setGoalDescription]=useState('');
  const[goalTarget,setGoalTarget]=useState('');
  const[goalDate,setGoalDate]=useState('');

  const[futurePlans,setFuturePlans]=useState<{id:string;name:string;is_active:boolean;reserve_enabled:boolean}[]>([]);
  const[editingEntry,setEditingEntry]=useState<ReserveEntry|null>(null);
  const[eAmount,setEAmount]=useState('');
  const[eDate,setEDate]=useState('');
  const[eNote,setENote]=useState('');

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const[e,g,fp]=await Promise.all([
      s.from('reserve_entries').select('id,kind,amount_minor,occurred_on,note,future_plan_id,created_at').eq('user_id',user.id).order('occurred_on',{ascending:false}).order('created_at',{ascending:false}),
      s.from('reserve_purchase_goals').select('id,description,target_minor,target_date,is_active,completed_at,created_at').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1),
      s.from('future_plans').select('id,name,is_active,reserve_enabled').eq('user_id',user.id)
    ]);
    setEntries((e.data||[]) as ReserveEntry[]);
    setGoal(((g.data||[])[0]||null) as PurchaseGoal|null);
    setFuturePlans((fp.data||[]) as {id:string;name:string;is_active:boolean;reserve_enabled:boolean}[]);
  }

  useEffect(()=>{
    load();
    const refresh=()=>load();
    window.addEventListener(FINANCE_UPDATED_EVENT,refresh);
    return()=>window.removeEventListener(FINANCE_UPDATED_EVENT,refresh);
  },[]);

  const balance=useMemo(
    ()=>entries.reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0),
    [entries]
  );

  const committedBalance=useMemo(()=>{
    const activeIds=new Set(futurePlans.filter(p=>p.is_active&&p.reserve_enabled).map(p=>p.id));
    return Math.max(0,entries.filter(e=>e.future_plan_id&&activeIds.has(e.future_plan_id)).reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0));
  },[entries,futurePlans]);
  const freeBalance=Math.max(0,balance-committedBalance);

  const goalProgress=useMemo(()=>{
    if(!goal)return null;
    const target=Number(goal.target_minor);
    const covered=Math.min(balance,target);
    const missing=Math.max(0,target-covered);
    const percent=Math.min(100,Math.round(covered/Math.max(1,target)*100));
    const monthly=goal.target_date?Math.ceil(missing/monthsUntil(goal.target_date)):null;
    return{target,covered,missing,percent,monthly};
  },[goal,balance]);

  function openTransfer(next:'deposit'|'withdraw'){
    setMode(next);
    setAmount('');
    setOccurredOn(localDateISO());
    setNote('');
    setNotice('');
  }

  async function saveTransfer(e:FormEvent){
    e.preventDefault();
    const value=minor(amount);
    if(value<=0||mode==='none')return;
    if(mode==='withdraw'&&value>freeBalance){setNotice(t('future.reserveProtected'));return}
    setSaving(true);
    const s=createClient();
    const{error}=await s.rpc('record_reserve_entry',{
      p_kind:mode,
      p_amount_minor:value,
      p_occurred_on:occurredOn,
      p_note:note.trim()||null
    });
    setSaving(false);
    if(error){setNotice(t('common.errorSave'));return}
    setMode('none');setAmount('');setNote('');
    setNotice(mode==='deposit'?t('reserves.saved'):t('reserves.withdrawn'));
    notifyFinanceUpdated();
    await load();
  }

  function startGoal(){
    setGoalDescription(goal?.description||'');
    setGoalTarget(goal?String(Number(goal.target_minor)/100).replace('.',','):'');
    setGoalDate(goal?.target_date||'');
    setGoalOpen(true);
    setNotice('');
  }

  async function saveGoal(e:FormEvent){
    e.preventDefault();
    const value=minor(goalTarget);
    if(!goalDescription.trim()||value<=0)return;
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    let error:any=null;
    if(goal){
      ({error}=await s.from('reserve_purchase_goals').update({
        description:goalDescription.trim(),
        target_minor:value,
        target_date:goalDate||null,
        updated_at:new Date().toISOString()
      }).eq('id',goal.id).eq('user_id',user.id));
    }else{
      ({error}=await s.from('reserve_purchase_goals').insert({
        user_id:user.id,
        description:goalDescription.trim(),
        target_minor:value,
        target_date:goalDate||null,
        is_active:true
      }));
    }
    if(error){setNotice(t('common.errorSave'));return}
    setGoalOpen(false);
    setNotice(t('reserves.goalSaved'));
    notifyFinanceUpdated();
    await load();
  }

  async function cancelGoal(){
    if(!goal)return;
    if(!confirm(t('reserves.cancelGoalConfirm')))return;
    const s=createClient();
    const{error}=await s.from('reserve_purchase_goals').update({
      is_active:false,
      completed_at:null,
      updated_at:new Date().toISOString()
    }).eq('id',goal.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    setNotice(t('reserves.goalCancelled'));
    notifyFinanceUpdated();
    await load();
  }

  async function completeGoal(){
    if(!goal)return;
    if(!confirm(t('reserves.completeGoalConfirm')))return;
    const s=createClient();
    const{error}=await s.from('reserve_purchase_goals').update({
      is_active:false,
      completed_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq('id',goal.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    setNotice(t('reserves.goalCompleted'));
    notifyFinanceUpdated();
    await load();
  }

  function startEntryEdit(entry:ReserveEntry){
    setEditingEntry(entry);
    setEAmount(String(Number(entry.amount_minor)/100).replace('.',','));
    setEDate(entry.occurred_on);
    setENote(entry.note||'');
    setNotice('');
  }

  async function saveEntryEdit(e:FormEvent){
    e.preventDefault();
    if(!editingEntry)return;
    const value=minor(eAmount);
    if(value<=0)return;
    const hypothetical=balance
      -(editingEntry.kind==='deposit'?Number(editingEntry.amount_minor):-Number(editingEntry.amount_minor))
      +(editingEntry.kind==='deposit'?value:-value);
    if(hypothetical<0){setNotice(t('reserves.insufficientAfterEdit'));return}
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('reserve_entries').update({
      amount_minor:value,
      occurred_on:eDate,
      note:eNote.trim()||null
    }).eq('id',editingEntry.id).eq('user_id',user.id);
    if(error){setNotice(t('common.errorUpdate'));return}
    setEditingEntry(null);
    notifyFinanceUpdated();
    await load();
  }

  async function removeEntry(entry:ReserveEntry){
    const hypothetical=balance-(entry.kind==='deposit'?Number(entry.amount_minor):-Number(entry.amount_minor));
    if(hypothetical<0){setNotice(t('reserves.cannotDeleteDeposit'));return}
    if(!confirm(t('move.deleteConfirm')))return;
    const s=createClient();
    const{error}=await s.from('reserve_entries').delete().eq('id',entry.id);
    if(error){setNotice(t('common.errorDelete'));return}
    notifyFinanceUpdated();
    await load();
  }

  return <div className="reservePage">
    <section className="reserveHero panel">
      <div><small>{t('reserves.eyebrow')}</small><h1>{t('reserves.title')}</h1><p>{t('reserves.lead')}</p></div>
      <div className="reserveBalance futureReserveBalance"><small>{t('reserves.available')}</small><strong>{currency(balance)}</strong><div><span><b>{currency(committedBalance)}</b>{t('future.committedReserve')}</span><span><b>{currency(freeBalance)}</b>{t('future.freeReserve')}</span></div></div>
    </section>

    <div className="reserveActions">
      <button className="primary" onClick={()=>openTransfer('deposit')}>＋ {t('reserves.transferIn')}</button>
      <button className="goldOutline" disabled={balance<=0} onClick={()=>openTransfer('withdraw')}>↗ {t('reserves.transferOut')}</button>
      <button className="secondary" onClick={startGoal}>◎ {goal?t('reserves.editGoal'):t('reserves.wantToBuy')}</button>
    </div>

    {goal&&goalProgress&&<section className="panel reserveGoalCard">
      <div className="reserveGoalHead"><div><small>{t('reserves.purchaseGoal')}</small><h2>{goal.description}</h2></div><strong>{goalProgress.percent}%</strong></div>
      <div className="bar reserveGoalBar"><i style={{width:String(goalProgress.percent)+'%'}}/></div>
      <div className="reserveGoalStats">
        <span><small>{t('reserves.goalTotal')}</small><b>{currency(goalProgress.target)}</b></span>
        <span><small>{t('reserves.goalCovered')}</small><b className="positive">{currency(goalProgress.covered)}</b></span>
        <span><small>{t('reserves.goalMissing')}</small><b>{currency(goalProgress.missing)}</b></span>
        {goalProgress.monthly!=null&&<span><small>{t('reserves.goalPerMonth')}</small><b>{currency(goalProgress.monthly)}</b></span>}
      </div>
      <p>{goal.target_date?t('reserves.goalDate')+' '+date(goal.target_date,{day:'2-digit',month:'short',year:'numeric'}):t('reserves.goalNoDate')}</p>
      <div className="reserveGoalActions"><button className="textButton" onClick={startGoal}>{t('common.edit')}</button><button className="textButton dangerText" onClick={cancelGoal}>{t('reserves.cancelGoal')}</button>{goalProgress.percent>=100&&<button className="goldOutline" onClick={completeGoal}>{t('reserves.completeGoal')}</button>}</div>
    </section>}

    <section className="panel reserveRule">
      <div><small>{t('reserves.howEyebrow')}</small><h2>{t('reserves.howTitle')}</h2></div>
      <p>{t('reserves.howTextTransfer')}</p>
    </section>

    {notice&&<div className="authMessage">{notice}</div>}

    <section className="reserveHistory">
      <div className="sectionTitleRow"><div><small>{t('common.history').toUpperCase()}</small><h2>{t('reserves.history')}</h2></div><span>{entries.length}</span></div>
      {entries.length===0?<div className="empty"><b>{t('reserves.empty')}</b><p>{t('reserves.emptyText')}</p></div>:entries.map(entry=><article className={'reserveRow '+entry.kind} key={entry.id}>
        <span>{entry.kind==='deposit'?'＋':'↗'}</span>
        <div><b>{entry.kind==='deposit'?t('reserves.transferIn'):t('reserves.transferOut')}</b><small>{date(entry.occurred_on,{day:'2-digit',month:'short',year:'numeric'})}{entry.note?' · '+entry.note:''}{entry.future_plan_id?' · '+t('future.committed'):''}</small></div>
        <strong className={entry.kind==='deposit'?'reserveDeposit':'reserveWithdraw'}>{entry.kind==='deposit'?'− ':'+ '}{currency(Number(entry.amount_minor))}</strong>
        <div className="reserveRowActions">{entry.future_plan_id?<span className="statusBadge">{t('future.managedByPlanning')}</span>:<><button onClick={()=>startEntryEdit(entry)}>{t('common.edit')}</button><button className="dangerText" onClick={()=>removeEntry(entry)}>{t('common.delete')}</button></>}</div>
      </article>)}
    </section>

    {mode!=='none'&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMode('none')}}><form className="modalCard" onSubmit={saveTransfer}>
      <div className="modalHead"><h2>{mode==='deposit'?t('reserves.transferIn'):t('reserves.transferOut')}</h2><button type="button" onClick={()=>setMode('none')}>×</button></div>
      <p className="formHint">{mode==='deposit'?t('reserves.transferInHelp'):t('reserves.transferOutHelp')}</p>
      <label>{t('common.value')}<input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('common.date')}<input type="date" value={occurredOn} onChange={e=>setOccurredOn(e.target.value)} required/></label>
      <label>{t('reserves.note')} <small>({t('common.optional')})</small><input value={note} onChange={e=>setNote(e.target.value)}/></label>
      {mode==='withdraw'&&<div className="settingsNote"><b>{t('future.freeReserve')}: {currency(freeBalance)}</b><span>{committedBalance>0?t('future.reserveProtectedHelp'):t('reserves.withdrawAffectsGoal')}</span></div>}
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setMode('none')}>{t('common.cancel')}</button><button className="primary" disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.confirm')}</button></div>
    </form></div>}

    {goalOpen&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setGoalOpen(false)}}><form className="modalCard" onSubmit={saveGoal}>
      <div className="modalHead"><h2>{t('reserves.wantToBuy')}</h2><button type="button" onClick={()=>setGoalOpen(false)}>×</button></div>
      <label>{t('reserves.goalDescription')}<input value={goalDescription} onChange={e=>setGoalDescription(e.target.value)} required maxLength={180}/></label>
      <label>{t('reserves.goalTotal')}<input value={goalTarget} onChange={e=>setGoalTarget(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('reserves.goalDateOptional')}<input type="date" min={localDateISO()} value={goalDate} onChange={e=>setGoalDate(e.target.value)}/><small>{t('reserves.goalDateHelp')}</small></label>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setGoalOpen(false)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div>
    </form></div>}

    {editingEntry&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditingEntry(null)}}><form className="modalCard" onSubmit={saveEntryEdit}>
      <div className="modalHead"><h2>{t('common.edit')} · {editingEntry.kind==='deposit'?t('reserves.transferIn'):t('reserves.transferOut')}</h2><button type="button" onClick={()=>setEditingEntry(null)}>×</button></div>
      <label>{t('common.value')}<input value={eAmount} onChange={e=>setEAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('common.date')}<input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} required/></label>
      <label>{t('reserves.note')} <small>({t('common.optional')})</small><input value={eNote} onChange={e=>setENote(e.target.value)}/></label>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditingEntry(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div>
    </form></div>}
  </div>;
}
