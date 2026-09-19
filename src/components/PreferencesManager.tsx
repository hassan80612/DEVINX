'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {LanguageMenu} from './LanguageMenu';

export function PreferencesManager(){
  const{t,locale,setLocale,currencyCode,setCurrencyCode,locales}=useI18n();
  const[timezone,setTimezone]=useState('America/Sao_Paulo');const[retention,setRetention]=useState(12);const[notice,setNotice]=useState('');const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const{data}=await s.from('profiles').select('locale,currency_code,timezone,retention_months').eq('id',user.id).single();if(data){if(data.currency_code==='BRL'||data.currency_code==='USD'||data.currency_code==='EUR'||data.currency_code==='PYG')setCurrencyCode(data.currency_code);setTimezone(data.timezone||'America/Sao_Paulo');setRetention(data.retention_months||12);if(data.locale&&locales.includes(data.locale as any))setLocale(data.locale as any)}setLoading(false)})()},[]);
  async function save(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('profiles').update({locale,currency_code:currencyCode,timezone}).eq('id',user.id);setNotice(error?t('common.errorSave'):t('settings.saved'))}
  if(loading)return <section className="panel"><span className="loader"/></section>;

  return <div className="settingsPage"><section className="panel settingsForm"><div className="sectionTitleRow"><div><small>DEVINX</small><h2>{t('settings.title')}</h2></div></div><label>{t('settings.language')}<LanguageMenu fullWidth/><small>{t('settings.languageHelp')}</small></label><label>{t('settings.currency')}<select value={currencyCode} onChange={e=>setCurrencyCode(e.target.value as 'BRL'|'USD'|'EUR'|'PYG')}><option value="BRL">{t('settings.brl')}</option><option value="USD">{t('settings.usd')}</option><option value="EUR">{t('settings.eur')}</option><option value="PYG">{t('settings.pyg')}</option></select></label><label>{t('settings.timezone')}<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Sao_Paulo">{t('settings.saoPaulo')}</option></select></label><label>{t('settings.history')}<input value={String(retention)+' '+t('settings.months')} disabled/></label><button className="primary" onClick={save}>{t('settings.save')}</button>{notice&&<div className="authMessage">{notice}</div>}</section></div>;
}
