'use client';

import {type ReactNode,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {SUPPORTED_CURRENCIES,type CurrencyCode,useI18n} from '@/i18n/provider';
import {LanguageMenu} from './LanguageMenu';
import {CalculatorModePreference,ProCalculator} from './CalculatorPro';

const HISTORY_PERIODS=[1,3,6,12,24] as const;
const TIMEZONES=[
  {value:'auto',label:'Automático'},
  {value:'America/Sao_Paulo',label:'São Paulo / Brasília'},
  {value:'America/Argentina/Buenos_Aires',label:'Buenos Aires'},
  {value:'America/Asuncion',label:'Asunción'},
  {value:'America/Montevideo',label:'Montevideo'},
  {value:'America/Santiago',label:'Santiago'},
  {value:'America/Bogota',label:'Bogotá'},
  {value:'America/Lima',label:'Lima'},
  {value:'America/Mexico_City',label:'Cidade do México'},
  {value:'America/New_York',label:'Nova York'},
  {value:'America/Chicago',label:'Chicago'},
  {value:'America/Denver',label:'Denver'},
  {value:'America/Los_Angeles',label:'Los Angeles'},
  {value:'Europe/London',label:'Londres'},
  {value:'Europe/Madrid',label:'Madri'},
  {value:'Europe/Paris',label:'Paris'},
  {value:'Europe/Berlin',label:'Berlim'},
  {value:'Asia/Dubai',label:'Dubai'},
  {value:'Asia/Riyadh',label:'Riad'},
  {value:'Asia/Kolkata',label:'Índia'},
  {value:'Asia/Shanghai',label:'Xangai'},
  {value:'Asia/Tokyo',label:'Tóquio'},
  {value:'Australia/Sydney',label:'Sydney'}
] as const;

function deviceTimezone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo'}catch{return 'America/Sao_Paulo'}
}
function timezoneOffset(zone:string){
  try{
    const resolved=zone==='auto'?deviceTimezone():zone;
    return new Intl.DateTimeFormat('en',{timeZone:resolved,timeZoneName:'shortOffset',hour:'2-digit'})
      .formatToParts(new Date()).find(part=>part.type==='timeZoneName')?.value||'';
  }catch{return ''}
}

function SettingsFoldCard({id,eyebrow,title,summary,children}:{id:string;eyebrow:string;title:string;summary?:string;children:ReactNode}){
  const{t}=useI18n();
  const[expanded,setExpanded]=useState(true);
  useEffect(()=>{try{const saved=localStorage.getItem('devinx_settings_fold_'+id);if(saved!==null)setExpanded(saved==='1')}catch{}},[id]);
  function toggle(){
    setExpanded(current=>{
      const next=!current;
      try{localStorage.setItem('devinx_settings_fold_'+id,next?'1':'0')}catch{}
      return next;
    });
  }
  return <section className={'panel settingsFoldCard '+(!expanded?'isCollapsed':'')}>
    <div className="settingsFoldHead">
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
      <button type="button" className="collapseToggle" onClick={toggle} aria-expanded={expanded}>{expanded?t('common.collapseSection'):t('common.expandSection')} <i>{expanded?'⌃':'⌄'}</i></button>
    </div>
    {!expanded&&summary&&<div className="settingsFoldSummary">{summary}</div>}
    {expanded&&<div className="settingsFoldBody">{children}</div>}
  </section>;
}

export function PreferencesManager(){
  const{t,locale,setLocale,currencyCode,setCurrencyCode,timezone,setTimezone,locales}=useI18n();
  const[retention,setRetention]=useState(12);
  const[notice,setNotice]=useState('');
  const[loading,setLoading]=useState(true);

  const currencyDisplay=useMemo(()=>{
    let names:Intl.DisplayNames|null=null;
    try{names=new Intl.DisplayNames(locale,{type:'currency'})}catch{}
    return Object.fromEntries(SUPPORTED_CURRENCIES.map(code=>[code,(names?.of(code)||code)+' ('+code+')'])) as Record<CurrencyCode,string>;
  },[locale]);

  const selectedTimezone=TIMEZONES.find(item=>item.value===timezone);
  const timezoneSummary=timezone==='auto'
    ?t('settings.timezoneAuto')+' · '+deviceTimezone().replace(/_/g,' ')
    :(selectedTimezone?.label||timezone.replace(/_/g,' '))+(timezoneOffset(timezone)?' · '+timezoneOffset(timezone):'');

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const{data}=await s.from('profiles').select('locale,currency_code,timezone,retention_months').eq('id',user.id).single();
    if(data){
      if(SUPPORTED_CURRENCIES.includes(data.currency_code as CurrencyCode))setCurrencyCode(data.currency_code as CurrencyCode);
      setTimezone(data.timezone||'auto');
      const months=Number(data.retention_months);
      setRetention(HISTORY_PERIODS.includes(months as any)?months:12);
      if(data.locale&&locales.includes(data.locale as any))setLocale(data.locale as any);
    }
    setLoading(false);
  })()},[]);

  async function save(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('profiles').update({locale,currency_code:currencyCode,timezone,retention_months:retention}).eq('id',user.id);
    if(!error){
      try{
        localStorage.setItem('devinx_timezone',timezone);
        localStorage.setItem('devinx_history_period',String(retention));
      }catch{}
      window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
      window.dispatchEvent(new CustomEvent('devinx:preferences-updated'));
    }
    setNotice(error?t('common.errorSave'):t('settings.saved'));
  }

  if(loading)return <section className="panel"><span className="loader"/></section>;

  const generalSummary=currencyCode+' · '+timezoneSummary+' · '+retention+' '+t('settings.months');

  return <div className="settingsPage">
    <SettingsFoldCard id="general" eyebrow="DEVINX" title={t('settings.title')} summary={generalSummary}>
      <div className="settingsForm settingsFormInner">
        <label>{t('settings.language')}<LanguageMenu fullWidth/><small>{t('settings.languageHelp')}</small></label>
        <label>{t('settings.currency')}
          <select value={currencyCode} onChange={e=>setCurrencyCode(e.target.value as CurrencyCode)}>
            {SUPPORTED_CURRENCIES.map(code=><option key={code} value={code}>{currencyDisplay[code]}</option>)}
          </select>
          <small>{t('settings.currencyHelp')}</small>
        </label>
        <label>{t('settings.timezone')}
          <select value={timezone} onChange={e=>setTimezone(e.target.value)}>
            {TIMEZONES.map(item=><option key={item.value} value={item.value}>{item.value==='auto'?t('settings.timezoneAuto')+' · '+deviceTimezone().replace(/_/g,' '):item.label+(timezoneOffset(item.value)?' · '+timezoneOffset(item.value):'')}</option>)}
          </select>
          <small>{t('settings.timezoneHelp')}</small>
        </label>
        <label>{t('settings.historyDefault')}
          <select value={retention} onChange={e=>setRetention(Number(e.target.value))}>
            <option value={1}>{t('reports.1m')}</option>
            <option value={3}>{t('reports.3m')}</option>
            <option value={6}>{t('reports.6m')}</option>
            <option value={12}>{t('reports.12m')}</option>
            <option value={24}>{t('reports.24m')}</option>
          </select>
          <small>{t('settings.historyHelp')}</small>
        </label>
        <button className="primary" onClick={save}>{t('settings.save')}</button>
        {notice&&<div className="authMessage">{notice}</div>}
      </div>
    </SettingsFoldCard>

    <SettingsFoldCard id="calculator-mode" eyebrow="DEVINX · PRO" title={t('calculator.defaultMode')} summary={t('calculator.defaultModeHelp')}>
      <CalculatorModePreference/>
    </SettingsFoldCard>

    <SettingsFoldCard id="calculator-tools" eyebrow="DEVINX · PRO" title={t('settings.calculatorTools')} summary={t('calculator.subtitle')}>
      <ProCalculator variant="embedded"/>
    </SettingsFoldCard>
  </div>;
}
