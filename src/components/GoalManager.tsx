'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';

type Goal={id:string;name:string;period:'daily'|'weekly'|'monthly';basis:'gross'|'operational_net'|'savings'|'payoff';target_minor:number};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function GoalManager(){
  const{t,currency}=useI18n();
  const[goal,setGoal]=useState<Goal|null>(null);const[open,setOpen]=useState(false);const[name,setName]=useState('');const[target,setTarget]=useState('');const[period,setPeriod]=useState<Goal['period']>('monthly');const[basis,setBasis]=useState<Goal['basis']>('gross');const[notice,setNotice]=useState('');const[saving,setSaving]=useState(false);

  async function load(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const{data}=await s.from('goals').select('id,name,period,basis,target_minor').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false}).limit(1);setGoal(((data||[])[0]||null) as Goal|null)}
  useEffect(()=>{load()},[]);

  function startNew(){setName(goal?.name||'');setTarget(goal?String(Number(goal.target_minor)/100).replace('.',','):'');setPeriod(goal?.period||'monthly');setBasis(goal?.basis||'gross');setOpen(true);setNotice('')}
  async function save(e:FormEvent){
    e.preventDefault();const value=minor(target);if(value<=0)return;setSaving(true);const s=createClient();const{error}=await s.rpc('replace_active_goal',{p_name:name.trim()||t('goals.title'),p_period:period,p_basis:basis,p_target_minor:value});setSaving(false);
    if(error){setNotice('Não foi possível salvar a meta.');return}setOpen(false);window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  async function endGoal(){if(!goal)return;const s=createClient();await s.from('goals').update({is_active:false}).eq('id',goal.id);setGoal(null);window.dispatchEvent(new CustomEvent('devinx:finance-updated'))}
  const periodLabel=goal?.period==='daily'?t('goals.daily'):goal?.period==='weekly'?t('goals.weekly'):t('goals.monthly');
  const basisLabel=goal?.basis==='operational_net'?t('goals.net'):goal?.basis==='savings'?t('goals.savings'):goal?.basis==='payoff'?t('goals.payoff'):t('goals.gross');

  return <div className="goalManager">
    <div className="toolbar"><button className="primary" onClick={startNew}>{t('goals.new')}</button></div>
    {open&&<form className="panel entryForm" onSubmit={save}><label>{t('goals.name')}<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>{t('goals.value')}<input value={target} onChange={e=>setTarget(e.target.value)} inputMode="decimal" required/></label><label>{t('goals.period')}<select value={period} onChange={e=>setPeriod(e.target.value as Goal['period'])}><option value="daily">{t('goals.daily')}</option><option value="weekly">{t('goals.weekly')}</option><option value="monthly">{t('goals.monthly')}</option></select></label><label>{t('goals.type')}<select value={basis} onChange={e=>setBasis(e.target.value as Goal['basis'])}><option value="gross">{t('goals.gross')}</option><option value="operational_net">{t('goals.net')}</option><option value="savings">{t('goals.savings')}</option><option value="payoff">{t('goals.payoff')}</option></select></label><p className="formHint">{t('goals.single')}</p><div className="formActions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>{t('common.cancel')}</button><button className="primary" disabled={saving}>{saving?t('common.saving'):t('goals.save')}</button></div></form>}
    {notice&&<div className="authMessage">{notice}</div>}
    {!goal?<section className="empty"><b>{t('goals.empty')}</b><p>{t('goals.emptyText')}</p></section>:<section className="goalCard"><div><small>{periodLabel} · {basisLabel}</small><h3>{goal.name}</h3></div><strong>{currency(Number(goal.target_minor))}</strong><button className="textButton dangerText" onClick={endGoal}>{t('goals.end')}</button></section>}
  </div>;
}
