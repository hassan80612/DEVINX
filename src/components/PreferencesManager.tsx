'use client';

import {type ReactNode,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {SUPPORTED_CURRENCIES,type CurrencyCode,useI18n} from '@/i18n/provider';
import {LanguageMenu} from './LanguageMenu';
import {CalculatorModePreference,ProCalculator} from './CalculatorPro';
import {isAutoFutureIncomeEnabled,setAutoFutureIncomeEnabled} from '@/lib/auto-future-income';
import {FINANCE_THEME_EVENT,isFinanceTheme,readFinanceTheme,writeFinanceTheme,type FinanceTheme} from '@/lib/finance-theme';

const HISTORY_PERIODS=[1,3,6,12,24] as const;
type ChartPeriod='3d'|'7d'|'1m'|'3m'|'6m'|'12m';
const CHART_PERIODS:ChartPeriod[]=['3d','7d','1m','3m','6m','12m'];
const TIMEZONES=[
  'auto',
  'America/Sao_Paulo','America/Argentina/Buenos_Aires','America/Asuncion','America/Montevideo',
  'America/Santiago','America/Bogota','America/Lima','America/Mexico_City',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'Europe/London','Europe/Madrid','Europe/Paris','Europe/Berlin',
  'Asia/Dubai','Asia/Riyadh','Asia/Kolkata','Asia/Shanghai','Asia/Tokyo',
  'Australia/Sydney'
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
function timezoneName(zone:string,locale:string){
  try{
    return new Intl.DateTimeFormat(locale,{timeZone:zone,timeZoneName:'longGeneric',hour:'2-digit'})
      .formatToParts(new Date()).find(part=>part.type==='timeZoneName')?.value
      ||zone.split('/').pop()?.replace(/_/g,' ')
      ||zone;
  }catch{return zone.split('/').pop()?.replace(/_/g,' ')||zone}
}

function SettingsFoldCard({id,eyebrow,title,summary,children}:{id:string;eyebrow:string;title:string;summary?:string;children:ReactNode}){
  const{t}=useI18n();
  const[expanded,setExpanded]=useState(()=>{
    if(typeof window==='undefined')return true;
    try{const saved=localStorage.getItem('devinx_settings_fold_'+id);return saved===null?true:saved==='1'}catch{return true}
  });
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
  const[chartPeriod,setChartPeriod]=useState<ChartPeriod>('1m');
  const[autoFutureIncome,setAutoFutureIncome]=useState(false);
  const[theme,setTheme]=useState<FinanceTheme>('dark');
  const[notice,setNotice]=useState('');
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);

  const currencyDisplay=useMemo(()=>{
    let names:Intl.DisplayNames|null=null;
    try{names=new Intl.DisplayNames(locale,{type:'currency'})}catch{}
    return Object.fromEntries(SUPPORTED_CURRENCIES.map(code=>[code,(names?.of(code)||code)+' ('+code+')'])) as Record<CurrencyCode,string>;
  },[locale]);

  const timezoneSummary=timezone==='auto'
    ?t('settings.timezoneAuto')+' · '+timezoneName(deviceTimezone(),locale)
    :timezoneName(timezone,locale)+(timezoneOffset(timezone)?' · '+timezoneOffset(timezone):'');

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    setAutoFutureIncome(isAutoFutureIncomeEnabled());
    setTheme(readFinanceTheme());
    const{data}=await s.from('profiles').select('locale,currency_code,timezone,retention_months,dashboard_chart_period').eq('id',user.id).single();
    if(data){
      if(SUPPORTED_CURRENCIES.includes(data.currency_code as CurrencyCode))setCurrencyCode(data.currency_code as CurrencyCode);
      setTimezone(data.timezone||'auto');
      const months=Number(data.retention_months);
      setRetention(HISTORY_PERIODS.includes(months as any)?months:12);
      if(CHART_PERIODS.includes(data.dashboard_chart_period as ChartPeriod))setChartPeriod(data.dashboard_chart_period as ChartPeriod);
      if(data.locale&&locales.includes(data.locale as any))setLocale(data.locale as any);
    }
    setLoading(false);
  })()},[]);

  useEffect(()=>{
    const onTheme=(event:Event)=>{
      const next=(event as CustomEvent<{theme?:unknown}>).detail?.theme;
      if(isFinanceTheme(next))setTheme(next);
    };
    window.addEventListener(FINANCE_THEME_EVENT,onTheme);
    return()=>window.removeEventListener(FINANCE_THEME_EVENT,onTheme);
  },[]);

  function chooseTheme(next:FinanceTheme){
    setTheme(next);
    writeFinanceTheme(next);
  }

  async function save(){
    setSaving(true);
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){setSaving(false);return}
    const{error}=await s.from('profiles').update({locale,currency_code:currencyCode,timezone,retention_months:retention,dashboard_chart_period:chartPeriod}).eq('id',user.id);
    if(!error){
      try{
        localStorage.setItem('devinx_timezone',timezone);
        localStorage.setItem('devinx_history_period',String(retention));
        localStorage.setItem('devinx_dashboard_chart_period',chartPeriod);
      }catch{}
      setAutoFutureIncomeEnabled(autoFutureIncome);
      window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
      window.dispatchEvent(new CustomEvent('devinx:preferences-updated'));
    }
    setSaving(false);
    setNotice(error?t('common.errorSave'):t('settings.saved'));
  }

  if(loading)return <section className="panel"><span className="loader"/></section>;

  const generalSummary=currencyCode+' · '+timezoneSummary+' · '+retention+' '+t('settings.months');

  return <div className="settingsPage">
    <SettingsFoldCard id="general" eyebrow="DEVINX" title={t('settings.title')} summary={generalSummary}>
      <div className="settingsForm settingsFormInner">
        <div className="themePreference" role="group" aria-label={t('settings.theme')}>
          <span><b>{t('settings.theme')}</b><small>{t('settings.themeHelp')}</small></span>
          <div className="themeChoices">
            <button type="button" className={theme==='dark'?'active':''} aria-pressed={theme==='dark'} onClick={()=>chooseTheme('dark')}><i aria-hidden="true">●</i><span>{t('settings.themeDark')}</span></button>
            <button type="button" className={theme==='light'?'active':''} aria-pressed={theme==='light'} onClick={()=>chooseTheme('light')}><i aria-hidden="true">○</i><span>{t('settings.themeLight')}</span></button>
          </div>
        </div>
        <label>{t('settings.language')}<LanguageMenu fullWidth/><small>{t('settings.languageHelp')}</small></label>
        <label>{t('settings.currency')}
          <select value={currencyCode} onChange={e=>setCurrencyCode(e.target.value as CurrencyCode)}>
            {SUPPORTED_CURRENCIES.map(code=><option key={code} value={code}>{currencyDisplay[code]}</option>)}
          </select>
          <small>{t('settings.currencyHelp')}</small>
        </label>
        <label>{t('settings.timezone')}
          <select value={timezone} onChange={e=>setTimezone(e.target.value)}>
            {TIMEZONES.map(zone=><option key={zone} value={zone}>{zone==='auto'?t('settings.timezoneAuto')+' · '+timezoneName(deviceTimezone(),locale):timezoneName(zone,locale)+(timezoneOffset(zone)?' · '+timezoneOffset(zone):'')}</option>)}
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
        <label>{t('settings.chartDefault')}
          <select value={chartPeriod} onChange={e=>setChartPeriod(e.target.value as ChartPeriod)}>
            <option value="3d">{t('dashboard.chart3d')}</option>
            <option value="7d">{t('dashboard.chart7d')}</option>
            <option value="1m">{t('dashboard.chart1m')}</option>
            <option value="3m">{t('dashboard.chart3m')}</option>
            <option value="6m">{t('dashboard.chart6m')}</option>
            <option value="12m">{t('dashboard.chart12m')}</option>
          </select>
          <small>{t('settings.chartHelp')}</small>
        </label>
        <label className="switchRow"><input type="checkbox" checked={autoFutureIncome} onChange={e=>setAutoFutureIncome(e.target.checked)}/><span><b>{t('settings.autoFutureIncome')}</b><small>{t('settings.autoFutureIncomeHelp')}</small></span></label>
        <button className="primary" onClick={save} disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('settings.save')}</button>
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
