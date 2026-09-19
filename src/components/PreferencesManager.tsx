'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';

export function PreferencesManager(){
  const{t,locale,setLocale,locales,languageNames}=useI18n();
  const[currency,setCurrency]=useState('BRL');const[timezone,setTimezone]=useState('America/Sao_Paulo');const[retention,setRetention]=useState(12);const[notice,setNotice]=useState('');const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const{data}=await s.from('profiles').select('locale,currency_code,timezone,retention_months').eq('id',user.id).single();if(data){setCurrency(data.currency_code||'BRL');setTimezone(data.timezone||'America/Sao_Paulo');setRetention(data.retention_months||12);if(data.locale&&locales.includes(data.locale as any))setLocale(data.locale as any)}setLoading(false)})()},[]);
  async function save(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('profiles').update({locale,currency_code:currency,timezone}).eq('id',user.id);setNotice(error?'Não foi possível salvar.':t('settings.saved'))}
  async function signOut(){const s=createClient();await s.auth.signOut();location.href='/'}
  if(loading)return <section className="panel"><span className="loader"/></section>;

  return <div className="settingsPage"><section className="panel settingsForm"><div className="sectionTitleRow"><div><small>DEVINX</small><h2>{t('settings.title')}</h2></div></div><label>{t('settings.language')}<select value={locale} onChange={e=>setLocale(e.target.value as any)}>{locales.map(item=><option key={item} value={item}>{languageNames[item]}</option>)}</select><small>{t('settings.languageHelp')}</small></label><label>{t('settings.currency')}<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="BRL">{t('settings.brl')}</option></select></label><label>{t('settings.timezone')}<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Sao_Paulo">{t('settings.saoPaulo')}</option></select></label><label>{t('settings.history')}<input value={String(retention)+' meses'} disabled/></label><button className="primary" onClick={save}>{t('settings.save')}</button>{notice&&<div className="authMessage">{notice}</div>}</section><section className="panel dangerZone"><h2>{t('settings.account')}</h2><button className="secondary" onClick={signOut}>{t('settings.signOut')}</button></section></div>;
}
