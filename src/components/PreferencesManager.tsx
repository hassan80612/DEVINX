'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import type {Locale} from '@/i18n/config';

export function PreferencesManager(){
  const{messages:m,setLocale:setAppLocale}=useI18n();
  const[locale,setLocale]=useState<Locale>('pt-BR');
  const[currency,setCurrency]=useState('BRL');
  const[timezone,setTimezone]=useState('America/Sao_Paulo');
  const[retention,setRetention]=useState(12);
  const[notice,setNotice]=useState('');
  const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const{data}=await s.from('profiles').select('locale,currency_code,timezone,retention_months').eq('id',user.id).single();
    if(data){setLocale((data.locale||'pt-BR') as Locale);setCurrency(data.currency_code);setTimezone(data.timezone);setRetention(data.retention_months)}
    setLoading(false);
  })()},[]);

  async function save(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('profiles').update({locale,currency_code:currency,timezone}).eq('id',user.id);
    if(error){setNotice(m.preferences.saveError);return}
    setAppLocale(locale);
    setNotice(m.preferences.saved);
  }

  async function signOut(){const s=createClient();await s.auth.signOut();location.href='/'}

  if(loading)return <section className="panel"><b>{m.preferences.loading}</b></section>;
  return <>
    <section className="panel settingsForm">
      <label>{m.preferences.language}<select value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="pt-BR">{m.preferences.ptBR}</option></select><small>{m.preferences.languageHelp}</small></label>
      <label>{m.preferences.currency}<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="BRL">{m.preferences.brl}</option></select></label>
      <label>{m.preferences.timezone}<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Sao_Paulo">{m.preferences.saoPaulo}</option></select></label>
      <label>{m.preferences.history}<input value={`${retention} ${m.preferences.months}`} disabled/><small>{m.preferences.retentionHelp}</small></label>
      <button className="primary" onClick={save}>{m.preferences.save}</button>
      {notice&&<div className="authMessage">{notice}</div>}
    </section>
    <section className="panel dangerZone"><h2>{m.preferences.account}</h2><button className="secondary" onClick={signOut}>{m.preferences.signOut}</button></section>
  </>;
}
