'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {DashboardOverview} from './DashboardOverview';
import {MovementCenter} from './MovementCenter';
import {WorkManager} from './WorkManager';
import {GoalManager} from './GoalManager';
import {CardManager} from './CardManager';
import {DebtManager} from './DebtManager';
import {RecurringManager} from './RecurringManager';
import {ReportManager} from './ReportManager';
import {SpendCheck} from './SpendCheck';
import {CategoryManager} from './CategoryManager';
import {PreferencesManager} from './PreferencesManager';
import {AdminMaster} from './AdminMaster';
import {QuickCapture} from './QuickCapture';
import {LanguageMenu} from './LanguageMenu';
import {IntegrationBootstrap} from './IntegrationBootstrap';
import {SubscriptionPanel} from './SubscriptionPanel';
import {useI18n} from '@/i18n/provider';

type Section='home'|'movements'|'work'|'plan'|'more'|'cards'|'debts'|'bills'|'reports'|'spend'|'categories'|'settings'|'master';
type CaptureMode='income'|'expense';
type CaptureRequest={id:number;mode:CaptureMode};
type Access={is_admin:boolean;allowed:boolean;status:string;source:string;expires_at:string|null;subscription_required:boolean;checkout_url:string|null};

function checkoutForLocale(url:string,locale:string){
  if(locale==='pt-BR'||/([?&])region=intl(?:&|$)/.test(url))return url;
  return url+(url.includes('?')?'&':'?')+'region=intl';
}

export function FinanceHub(){
  const{locale,setLocale,setCurrencyCode,t}=useI18n();
  const[section,setSection]=useState<Section>('home');
  const[capture,setCapture]=useState<CaptureRequest>({id:0,mode:'expense'});
  const[access,setAccess]=useState<Access|null>(null);
  const[accessError,setAccessError]=useState('');

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.replace('/entrar');return}
    const[{data,error},{data:profile}]=await Promise.all([
      s.rpc('get_devinx_access_status'),
      s.from('profiles').select('locale,currency_code').eq('id',user.id).maybeSingle()
    ]);
    if(profile?.locale)setLocale(profile.locale as any);
    if(profile?.currency_code==='BRL'||profile?.currency_code==='USD'||profile?.currency_code==='EUR')setCurrencyCode(profile.currency_code);
    if(error){setAccessError('access');return}
    const row=Array.isArray(data)?data[0]:data;
    setAccess(row as Access);
  })()},[]);

  const month=useMemo(()=>new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(new Date()),[locale]);
  const titles:Record<Section,string>={
    home:t('nav.home'),movements:t('nav.movements'),work:t('nav.work'),plan:t('nav.plan'),more:t('nav.more'),
    cards:t('nav.cards'),debts:t('nav.debts'),bills:t('nav.bills'),reports:t('nav.reports'),spend:t('spend.title'),
    categories:t('nav.categories'),settings:t('nav.settings'),master:t('nav.master')
  };

  function openCapture(mode:CaptureMode){setCapture(current=>({id:current.id+1,mode}))}
  function navigate(target:string){
    if(target==='income'||target==='expense'){openCapture(target);return}
    const allowed:Section[]=['home','movements','work','plan','more','cards','debts','bills','reports','spend','categories','settings','master'];
    if(allowed.includes(target as Section))setSection(target as Section);
  }
  function backTarget(){return ['cards','debts','bills','reports','spend','categories','settings','master'].includes(section)?'more':'home'}
  async function signOut(){await createClient().auth.signOut();location.href='/'}

  if(accessError)return <main className="financeApp">
    <section className="centerState"><b>DEVINX</b><p>{t('common.errorAccess')}</p><button className="primary" onClick={()=>location.reload()}>{t('common.tryAgain')}</button></section></main>;
  if(!access)return <main className="financeApp"><section className="centerState"><span className="loader"/><b>{t('common.loading')}</b></section></main>;
  if(!access.allowed)return <main className="financeApp"><section className="paywallCard"><span className="goldPill">DEVINX</span><h1>{t('access.title')}</h1><p>{t('access.desc')}</p><SubscriptionPanel/><button className="secondary" onClick={signOut}>{t('access.signOut')}</button></section></main>;

  return <main className="financeApp">
    <IntegrationBootstrap enabled={access.is_admin}/>
    <header className="financeHeader">
      <button className="brand brandButton" onClick={()=>setSection('home')} type="button"><span className="mark">D</span><b>DEVINX</b></button>
      <div className="financeHeaderTools">
        <div className="financeHeaderMeta"><small>{month}</small><span>{t('header.subtitle')}</span></div>
        <LanguageMenu/>
      </div>
    </header>

    <section className="financeContent">
      {section!=='home'&&<div className="sectionTopbar"><button type="button" className="backButton" onClick={()=>setSection(backTarget())}>‹</button><div><small>DEVINX</small><h1>{titles[section]}</h1></div></div>}

      {section==='home'&&<>
        <section className="instantPanel">
          <div><small>{t('home.eyebrow')}</small><h1>{t('home.title')}</h1><p>{t('home.desc')}</p></div>
          <div className="instantActions">
            <button type="button" className="instantAction income" onClick={()=>openCapture('income')}><span>＋</span><b>{t('common.income')}</b><small>{t('home.incomeDesc')}</small></button>
            <button type="button" className="instantAction expense" onClick={()=>openCapture('expense')}><span>−</span><b>{t('quick.expense')}</b><small>{t('home.expenseDesc')}</small></button>
            <button type="button" className="instantAction work" onClick={()=>setSection('work')}><span>◷</span><b>{t('home.work')}</b><small>{t('home.workDesc')}</small></button>
            <button type="button" className="instantAction card" onClick={()=>setSection('cards')}><span>▣</span><b>{t('home.card')}</b><small>{t('home.cardDesc')}</small></button>
          </div>
        </section>
        <DashboardOverview/>
      </>}

      {section==='movements'&&<MovementCenter onNavigate={navigate}/>}
      {section==='work'&&<WorkManager/>}
      {section==='plan'&&<div className="stackSections"><section><div className="miniHeading"><small>{t('goals.title').toUpperCase()}</small><h2>{t('goals.title')}</h2></div><GoalManager/></section><section><div className="miniHeading"><small>{t('spend.beforeBuy')}</small><h2>{t('spend.title')}</h2></div><SpendCheck/></section></div>}

      {section==='more'&&<div className="moreStack">
        <SubscriptionPanel isAdmin={access.is_admin}/>
        <section className="organizeGrid">
          <button onClick={()=>setSection('cards')} type="button"><span>▣</span><div><b>{t('nav.cards')}</b><small>{t('more.cardsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('debts')} type="button"><span>↓</span><div><b>{t('nav.debts')}</b><small>{t('more.debtsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('bills')} type="button"><span>↻</span><div><b>{t('nav.bills')}</b><small>{t('more.billsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('reports')} type="button"><span>▥</span><div><b>{t('nav.reports')}</b><small>{t('more.reportsHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('categories')} type="button"><span>⌁</span><div><b>{t('nav.categories')}</b><small>{t('more.categoriesHelp')}</small></div><em>›</em></button>
          <button onClick={()=>setSection('settings')} type="button"><span>⚙</span><div><b>{t('nav.settings')}</b><small>{t('more.settingsHelp')}</small></div><em>›</em></button>
          {access.is_admin&&<button className="masterLauncher" onClick={()=>setSection('master')} type="button"><span>✦</span><div><b>{t('nav.master')}</b><small>{t('more.masterHelp')}</small></div><em>›</em></button>}
          <button className="signOutLauncher" onClick={signOut} type="button"><span>↗</span><div><b>{t('settings.signOut')}</b><small>{t('more.signOutHelp')}</small></div><em>›</em></button>
        </section>
      </div>}

      {section==='cards'&&<CardManager onNavigate={navigate}/>}
      {section==='debts'&&<DebtManager/>}
      {section==='bills'&&<RecurringManager onNavigate={navigate}/>}
      {section==='reports'&&<ReportManager/>}
      {section==='spend'&&<SpendCheck/>}
      {section==='categories'&&<CategoryManager/>}
      {section==='settings'&&<PreferencesManager/>}
      {section==='master'&&access.is_admin&&<AdminMaster/>}
    </section>

    <QuickCapture request={capture} onNavigate={navigate}/>

    <nav className="financeBottomNav" aria-label="Main navigation">
      <button type="button" className={section==='home'?'active':''} onClick={()=>setSection('home')}><span>⌂</span><b>{t('nav.home')}</b></button>
      <button type="button" className={section==='movements'?'active':''} onClick={()=>setSection('movements')}><span>↕</span><b>{t('nav.movements')}</b></button>
      <button type="button" className={section==='work'?'active':''} onClick={()=>setSection('work')}><span>◷</span><b>{t('nav.work')}</b></button>
      <button type="button" className={section==='plan'?'active':''} onClick={()=>setSection('plan')}><span>◎</span><b>{t('nav.plan')}</b></button>
      <button type="button" className={section==='more'||['cards','debts','bills','reports','spend','categories','settings','master'].includes(section)?'active':''} onClick={()=>setSection('more')}><span>•••</span><b>{t('nav.more')}</b></button>
    </nav>
  </main>;
}
