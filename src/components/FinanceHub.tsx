'use client';

import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import {createClient} from '@/lib/supabase/client';
import {DashboardOverview} from './DashboardOverview';
import {QuickCapture} from './QuickCapture';
import {LanguageMenu} from './LanguageMenu';
import {IntegrationBootstrap} from './IntegrationBootstrap';
import {SubscriptionPanel} from './SubscriptionPanel';
import {BrandLogo} from './BrandLogo';
import {ProCalculator} from './CalculatorPro';
import {SUPPORTED_CURRENCIES,type CurrencyCode,useI18n} from '@/i18n/provider';
import {settleAutomaticFutureIncome} from '@/lib/auto-future-income';
import {notifyFinanceUpdated} from '@/lib/finance-events';

function LazySectionFallback(){return <section className="panel dashboardLoading"><span className="loader"/></section>}
const MovementCenter=dynamic(()=>import('./MovementCenter').then(module=>module.MovementCenter),{loading:LazySectionFallback});
const WorkManager=dynamic(()=>import('./WorkManager').then(module=>module.WorkManager),{loading:LazySectionFallback});
const GoalManager=dynamic(()=>import('./GoalManager').then(module=>module.GoalManager),{loading:LazySectionFallback});
const FuturePlanningManager=dynamic(()=>import('./FuturePlanningManager').then(module=>module.FuturePlanningManager),{loading:LazySectionFallback});
const CardManager=dynamic(()=>import('./CardManager').then(module=>module.CardManager),{loading:LazySectionFallback});
const RecurringManager=dynamic(()=>import('./RecurringManager').then(module=>module.RecurringManager),{loading:LazySectionFallback});
const ReserveManager=dynamic(()=>import('./ReserveManager').then(module=>module.ReserveManager),{loading:LazySectionFallback});
const ReportManager=dynamic(()=>import('./ReportManager').then(module=>module.ReportManager),{loading:LazySectionFallback});
const SpendCheck=dynamic(()=>import('./SpendCheck').then(module=>module.SpendCheck),{loading:LazySectionFallback});
const CategoryManager=dynamic(()=>import('./CategoryManager').then(module=>module.CategoryManager),{loading:LazySectionFallback});
const PreferencesManager=dynamic(()=>import('./PreferencesManager').then(module=>module.PreferencesManager),{loading:LazySectionFallback});
const AdminMaster=dynamic(()=>import('./AdminMaster').then(module=>module.AdminMaster),{loading:LazySectionFallback});

type Section='home'|'movements'|'work'|'plan'|'more'|'cards'|'bills'|'reserves'|'reports'|'spend'|'categories'|'settings'|'master';
type CaptureMode='income'|'expense';
type CaptureRequest={id:number;mode:CaptureMode};
type Access={is_admin:boolean;allowed:boolean;status:string;source:string;expires_at:string|null;subscription_required:boolean;checkout_url:string|null};

function checkoutForLocale(url:string,locale:string){
  if(locale==='pt-BR'||/([?&])region=intl(?:&|$)/.test(url))return url;
  return url+(url.includes('?')?'&':'?')+'region=intl';
}

export function FinanceHub(){
  const{locale,setLocale,setCurrencyCode,setTimezone,date,t}=useI18n();
  const[section,setSection]=useState<Section>('home');
  const[sectionReady,setSectionReady]=useState(false);
  const[capture,setCapture]=useState<CaptureRequest>({id:0,mode:'expense'});
  const[access,setAccess]=useState<Access|null>(null);
  const[accessError,setAccessError]=useState('');

  useEffect(()=>{
    try{
      const saved=sessionStorage.getItem('devinx-active-section');
      const allowed:Section[]=['home','movements','work','plan','more','cards','bills','reserves','reports','spend','categories','settings','master'];
      if(saved&&allowed.includes(saved as Section))setSection(saved as Section);
    }catch{}
    setSectionReady(true);
  },[]);

  useEffect(()=>{
    if(!sectionReady)return;
    try{sessionStorage.setItem('devinx-active-section',section)}catch{}
  },[section,sectionReady]);

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.replace('/entrar');return}
    const[{data,error},{data:profile}]=await Promise.all([
      s.rpc('get_devinx_access_status'),
      s.from('profiles').select('locale,currency_code,timezone').eq('id',user.id).maybeSingle()
    ]);
    if(profile?.locale)setLocale(profile.locale as any);
    if(SUPPORTED_CURRENCIES.includes(profile?.currency_code as CurrencyCode))setCurrencyCode(profile!.currency_code as CurrencyCode);
    if(profile?.timezone)setTimezone(profile.timezone);
    if(error){setAccessError('access');return}
    const row=Array.isArray(data)?data[0]:data;
    setAccess(row as Access);
  })()},[]);

  useEffect(()=>{
    if(!access)return;
    if(!access.allowed){location.replace('/entrar?acesso=expirado');return}
    if(access.is_admin||!access.expires_at)return;
    const expiresAt=new Date(access.expires_at).getTime();
    let timer=0;
    const check=()=>{
      const remaining=expiresAt-Date.now();
      if(remaining<=0){location.replace('/entrar?acesso=expirado');return}
      timer=window.setTimeout(check,Math.min(remaining,60*60*1000));
    };
    check();
    return()=>{if(timer)window.clearTimeout(timer)};
  },[access]);

  useEffect(()=>{
    if(!access?.allowed)return;
    let mounted=true;
    const run=async()=>{
      const count=await settleAutomaticFutureIncome();
      if(mounted&&count>0)notifyFinanceUpdated();
    };
    run();
    const timer=window.setInterval(run,60*60*1000);
    const onPreferences=()=>run();
    window.addEventListener('devinx:preferences-updated',onPreferences);
    return()=>{mounted=false;window.clearInterval(timer);window.removeEventListener('devinx:preferences-updated',onPreferences)};
  },[access?.allowed]);

  const month=date(new Date(),{month:'long',year:'numeric'});
  const titles:Record<Section,string>={
    home:t('nav.home'),movements:t('nav.movements'),work:t('nav.work'),plan:t('nav.plan'),more:t('nav.more'),
    cards:t('nav.cards'),bills:t('nav.bills'),reserves:t('nav.reserves'),reports:t('nav.reports'),spend:t('spend.title'),
    categories:t('nav.categories'),settings:t('nav.settings'),master:t('nav.master')
  };

  function openCapture(mode:CaptureMode){setCapture(current=>({id:current.id+1,mode}))}
  function navigate(target:string){
    if(target==='income'||target==='expense'){openCapture(target);return}
    const allowed:Section[]=['home','movements','work','plan','more','cards','bills','reserves','reports','spend','categories','settings','master'];
    if(allowed.includes(target as Section))setSection(target as Section);
  }
  function backTarget(){return ['cards','bills','reserves','reports','spend','categories','settings','master'].includes(section)?'more':'home'}
  async function signOut(){try{sessionStorage.removeItem('devinx-active-section')}catch{}await createClient().auth.signOut();location.href='/'}

  if(!sectionReady)return <main className="financeApp"><section className="centerState"><span className="loader"/><b>{t('common.loading')}</b></section></main>;
  if(accessError)return <main className="financeApp">
    <section className="centerState"><b>DEVINX</b><p>{t('common.errorAccess')}</p><button className="primary" onClick={()=>location.reload()}>{t('common.tryAgain')}</button></section></main>;
  if(!access)return <main className="financeApp"><section className="centerState"><span className="loader"/><b>{t('common.loading')}</b></section></main>;
  if(!access.allowed)return <main className="financeApp"><section className="centerState"><span className="loader"/><b>{t('common.loading')}</b></section></main>;

  return <main className="financeApp">
    <IntegrationBootstrap enabled={access.is_admin}/>
    <header className="financeHeader">
      <button className="brand brandButton" onClick={()=>setSection('home')} type="button"><BrandLogo/></button>
      <div className="financeHeaderTools">
        <div className="financeHeaderMeta"><small>{month}</small><span>{t('header.subtitle')}</span></div>
        <LanguageMenu/>
      </div>
    </header>
    {access.source==='trial'&&access.expires_at&&<div className="trialAccessNotice"><b>{t('trial.active')}</b><span>{t('trial.ends')} {date(access.expires_at,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>}

    <section className="financeContent">
      {section!=='home'&&<div className="sectionTopbar"><button type="button" className="backButton" onClick={()=>setSection(backTarget())}>‹</button><div><small>DEVINX</small><h1>{titles[section]}</h1></div></div>}

      {section==='home'&&<>
        <section className="instantPanel">
          <div><small>{t('home.eyebrow')}</small><h1>{t('home.title')}</h1><p>{t('home.desc')}</p></div>
          <div className="homeActionGrid">
            <button type="button" className="homeActionCard income" onClick={()=>openCapture('income')}><span className="homeActionCardTop"><i>＋</i><b>{t('common.income')}</b></span><small>{t('home.incomeDesc')}</small></button>
            <button type="button" className="homeActionCard expense" onClick={()=>openCapture('expense')}><span className="homeActionCardTop"><i>−</i><b>{t('quick.expense')}</b></span><small>{t('home.expenseDesc')}</small></button>
            <button type="button" className="homeActionCard work" onClick={()=>setSection('work')}><span className="homeActionCardTop"><i>◷</i><b>{t('home.work')}</b></span><small>{t('home.workDesc')}</small></button>
            <button type="button" className="homeActionCard card" onClick={()=>setSection('cards')}><span className="homeActionCardTop"><i>▣</i><b>{t('home.card')}</b></span><small>{t('home.cardDesc')}</small></button>
          </div>
        </section>
        <DashboardOverview/>
      </>}

      {section==='movements'&&<MovementCenter onNavigate={navigate}/>}
      {section==='work'&&<WorkManager/>}
      {section==='plan'&&<div className="stackSections"><FuturePlanningManager/><section><div className="miniHeading"><small>{t('goals.title').toUpperCase()}</small><h2>{t('goals.title')}</h2></div><GoalManager/></section><section><div className="miniHeading"><small>{t('spend.beforeBuy')}</small><h2>{t('spend.title')}</h2></div><SpendCheck/></section></div>}

      {section==='more'&&<div className="moreStack">
        <SubscriptionPanel isAdmin={access.is_admin}/>
        <section className="organizeGrid">
          <button onClick={()=>setSection('cards')} type="button"><span>▣</span><div><b>{t('nav.cards')}</b><small>{t('more.cardsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('bills')} type="button"><span>↻</span><div><b>{t('nav.bills')}</b><small>{t('more.billsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('reserves')} type="button"><span>◇</span><div><b>{t('nav.reserves')}</b><small>{t('more.reservesHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('reports')} type="button"><span>▥</span><div><b>{t('nav.reports')}</b><small>{t('more.reportsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('categories')} type="button"><span>⌁</span><div><b>{t('nav.categories')}</b><small>{t('more.categoriesHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('settings')} type="button"><span>⚙</span><div><b>{t('nav.settings')}</b><small>{t('more.settingsHelp')}</small></div><em>›</em></button>
          {access.is_admin&&<button className="masterLauncher" onClick={()=>setSection('master')} type="button"><span>✦</span><div><b>{t('nav.master')}</b><small>{t('more.masterHelp')}</small></div><em>›</em></button>}
          <button className="signOutLauncher" onClick={signOut} type="button"><span>↗</span><div><b>{t('settings.signOut')}</b><small>{t('more.signOutHelp')}</small></div><em>›</em></button>
        </section>
      </div>}

      {section==='cards'&&<CardManager onNavigate={navigate}/>}
      {section==='bills'&&<RecurringManager onNavigate={navigate}/>} 
      {section==='reserves'&&<ReserveManager/>}
      {section==='reports'&&<ReportManager/>}
      {section==='spend'&&<SpendCheck/>}
      {section==='categories'&&<CategoryManager/>}
      {section==='settings'&&<PreferencesManager/>}
      {section==='master'&&access.is_admin&&<AdminMaster/>}
    </section>

    <ProCalculator variant="floating"/>
    <QuickCapture request={capture} onNavigate={navigate}/>

    <nav className="financeBottomNav" aria-label="Main navigation">
      <button type="button" className={section==='home'?'active':''} onClick={()=>setSection('home')}><span>⌂</span><b>{t('nav.home')}</b></button>
      <button type="button" className={section==='movements'?'active':''} onClick={()=>setSection('movements')}><span>↕</span><b>{t('nav.movements')}</b></button>
      <button type="button" className={section==='work'?'active':''} onClick={()=>setSection('work')}><span>◷</span><b>{t('nav.work')}</b></button>
      <button type="button" className={section==='plan'?'active':''} onClick={()=>setSection('plan')}><span>◎</span><b>{t('nav.plan')}</b></button>
      <button type="button" className={section==='more'||['cards','bills','reserves','reports','spend','categories','settings','master'].includes(section)?'active':''} onClick={()=>setSection('more')}><span>•••</span><b>{t('nav.more')}</b></button>
    </nav>
  </main>;
}
