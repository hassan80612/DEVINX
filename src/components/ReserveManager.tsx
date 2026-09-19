'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

type ReserveEntry={
  id:string;
  kind:'deposit'|'use';
  amount_minor:number;
  occurred_on:string;
  target_date:string|null;
  note:string|null;
  created_at:string;
};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

function monthEndISO(){
  const m=new Date(localMonthStartISO()+'T12:00:00');
  return localDateISO(new Date(m.getFullYear(),m.getMonth()+1,0));
}

export function ReserveManager(){
  const{t,currency,date}=useI18n();
  const[entries,setEntries]=useState<ReserveEntry[]>([]);
  const[horizon,setHorizon]=useState('');
  const[mode,setMode]=useState<'deposit'|'use'|'none'>('none');
  const[amount,setAmount]=useState('');
  const[occurredOn,setOccurredOn]=useState(localDateISO());
  const[targetDate,setTargetDate]=useState(monthEndISO());
  const[note,setNote]=useState('');
  const[notice,setNotice]=useState('');
  const[saving,setSaving]=useState(false);

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const[e,p]=await Promise.all([
      s.from('reserve_entries').select('id,kind,amount_minor,occurred_on,target_date,note,created_at').eq('user_id',user.id).order('occurred_on',{ascending:false}).order('created_at',{ascending:false}),
      s.from('profiles').select('daily_goal_target_date').eq('id',user.id).maybeSingle()
    ]);
    setEntries((e.data||[]) as ReserveEntry[]);
    const saved=(p.data as any)?.daily_goal_target_date||'';
    setHorizon(saved);
    if(mode!=='use')setTargetDate(saved||monthEndISO());
  }

  useEffect(()=>{
    load();
    const refresh=()=>load();
    window.addEventListener('devinx:finance-updated',refresh);
    return()=>window.removeEventListener('devinx:finance-updated',refresh);
  },[]);

  const balance=useMemo(
    ()=>entries.reduce((sum,e)=>sum+(e.kind==='deposit'?Number(e.amount_minor):-Number(e.amount_minor)),0),
    [entries]
  );
  const activeCoverage=useMemo(
    ()=>entries.filter(e=>e.kind==='use'&&!!e.target_date&&e.target_date>=localDateISO()).reduce((s,e)=>s+Number(e.amount_minor),0),
    [entries]
  );

  function open(next:'deposit'|'use'){
    setMode(next);
    setAmount('');
    setOccurredOn(localDateISO());
    setTargetDate(horizon||monthEndISO());
    setNote('');
    setNotice('');
  }

  async function save(e:FormEvent){
    e.preventDefault();
    const value=minor(amount);
    if(value<=0||mode==='none')return;
    if(mode==='use'&&value>balance){setNotice(t('reserves.insufficient'));return}
    setSaving(true);
    const s=createClient();
    const{error}=await s.rpc('record_reserve_entry',{
      p_kind:mode,
      p_amount_minor:value,
      p_occurred_on:occurredOn,
      p_target_date:mode==='use'?targetDate:null,
      p_note:note.trim()||null
    });
    setSaving(false);
    if(error){setNotice(t('common.errorSave'));return}
    setMode('none');setAmount('');setNote('');
    setNotice(mode==='deposit'?t('reserves.saved'):t('reserves.applied'));
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    await load();
  }

  return <div className="reservePage">
    <section className="reserveHero panel">
      <div><small>{t('reserves.eyebrow')}</small><h1>{t('reserves.title')}</h1><p>{t('reserves.lead')}</p></div>
      <div className="reserveBalance"><small>{t('reserves.available')}</small><strong>{currency(balance)}</strong><span>{activeCoverage>0?t('reserves.coverageActive')+' '+currency(activeCoverage):t('reserves.ignored')}</span></div>
    </section>

    <div className="reserveActions">
      <button className="primary" onClick={()=>open('deposit')}>＋ {t('reserves.add')}</button>
      <button className="goldOutline" disabled={balance<=0} onClick={()=>open('use')}>{t('reserves.use')}</button>
    </div>

    <section className="panel reserveRule">
      <div><small>{t('reserves.howEyebrow')}</small><h2>{t('reserves.howTitle')}</h2></div>
      <p>{t('reserves.howText')}</p>
    </section>

    {notice&&<div className="authMessage">{notice}</div>}

    <section className="reserveHistory">
      <div className="sectionTitleRow"><div><small>{t('common.history').toUpperCase()}</small><h2>{t('reserves.history')}</h2></div><span>{entries.length}</span></div>
      {entries.length===0?<div className="empty"><b>{t('reserves.empty')}</b><p>{t('reserves.emptyText')}</p></div>:entries.map(entry=><article className={'reserveRow '+entry.kind} key={entry.id}>
        <span>{entry.kind==='deposit'?'＋':'↘'}</span>
        <div><b>{entry.kind==='deposit'?t('reserves.deposit'):t('reserves.use')}</b><small>{date(entry.occurred_on,{day:'2-digit',month:'short',year:'numeric'})}{entry.note?' · '+entry.note:''}</small>{entry.kind==='use'&&entry.target_date&&<small>{t('reserves.coverUntil')} {date(entry.target_date,{day:'2-digit',month:'short',year:'numeric'})}</small>}</div>
        <strong className={entry.kind==='deposit'?'positive':'reserveUse'}>{entry.kind==='deposit'?'+ ':'− '}{currency(Number(entry.amount_minor))}</strong>
      </article>)}
    </section>

    {mode!=='none'&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMode('none')}}><form className="modalCard" onSubmit={save}>
      <div className="modalHead"><h2>{mode==='deposit'?t('reserves.add'):t('reserves.use')}</h2><button type="button" onClick={()=>setMode('none')}>×</button></div>
      <label>{t('common.value')}<input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" required/></label>
      <label>{t('common.date')}<input type="date" value={occurredOn} onChange={e=>setOccurredOn(e.target.value)} required/></label>
      {mode==='use'&&<label>{t('reserves.coverUntil')}<input type="date" min={localDateISO()} value={targetDate} onChange={e=>setTargetDate(e.target.value)} required/><small>{t('reserves.useHelp')}</small></label>}
      <label>{t('reserves.note')} <small>({t('common.optional')})</small><input value={note} onChange={e=>setNote(e.target.value)}/></label>
      {mode==='use'&&<div className="settingsNote"><b>{t('reserves.available')}: {currency(balance)}</b><span>{t('reserves.distributionHelp')}</span></div>}
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setMode('none')}>{t('common.cancel')}</button><button className="primary" disabled={saving}>{saving?t('common.saving'):t('common.confirm')}</button></div>
    </form></div>}
  </div>;
}
