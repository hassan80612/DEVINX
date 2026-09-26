'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import dynamic from 'next/dynamic';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {MasterLivePresence} from './LivePresence';

const LaserControlMasterPanel=dynamic(()=>import('./LaserControlMasterPanel').then(module=>module.LaserControlMasterPanel),{loading:()=>null});

type Funnel={total_customers:number;total_accounts:number;onboarded:number;signed_in_7d:number;active_access:number;blocked_access:number;pending_signup:number;kiwify_customers:number;manual_grants:number;no_access:number};
type Customer={email:string;user_id:string|null;account_exists:boolean;created_at:string|null;last_sign_in_at:string|null;onboarded_at:string|null;access_status:string;access_source:string;expires_at:string|null;is_admin:boolean;manual_grant:boolean;kiwify_customer:boolean;kiwify_status:string|null;plan_name:string|null;amount_minor:number|null;currency_code:string|null;last_event_at:string|null};
type Diagnostic={email:string;user_id:string|null;account_exists:boolean;onboarded_at:string|null;last_sign_in_at:string|null;access_status:string;access_source:string;expires_at:string|null;manual_grant:boolean;kiwify_customer:boolean;kiwify_status:string|null;plan_name:string|null;transactions_count:number;work_sessions_count:number;cards_count:number;recurring_bills_count:number;debts_count:number;last_financial_activity:string|null};
type KiwifyEvent={event_type:string|null;subscription_status:string|null;has_access:boolean;access_until:string|null;plan_name:string|null;amount_minor:number|null;currency_code:string|null;subscription_id:string|null;order_id:string|null;received_at:string};
type WebhookAttempt={outcome:'received'|'accepted'|'ignored'|'error';event_type:string|null;product_id:string|null;note:string|null;received_at:string};
type Settings={subscription_required:boolean;checkout_url:string|null};

function statusKey(status:string){
  if(status==='active')return 'common.active';
  if(status==='blocked')return 'common.blocked';
  return 'common.none';
}

export function AdminMaster(){
  const{t,date,locale}=useI18n();
  const[funnel,setFunnel]=useState<Funnel|null>(null);
  const[customers,setCustomers]=useState<Customer[]>([]);
  const[search,setSearch]=useState('');
  const[filter,setFilter]=useState<'all'|'active'|'blocked'|'pending'|'kiwify'|'manual'|'trial'>('all');
  const[notice,setNotice]=useState('');
  const[loading,setLoading]=useState(true);
  const[diag,setDiag]=useState<Diagnostic|null>(null);
  const[diagOpen,setDiagOpen]=useState(false);
  const[checkout,setCheckout]=useState('');
  const[subscriptionRequired,setSubscriptionRequired]=useState(false);
  const[grantEmail,setGrantEmail]=useState('');
  const[grantNote,setGrantNote]=useState('');
  const[grantExpiry,setGrantExpiry]=useState('');
  const[expanded,setExpanded]=useState<Set<string>>(new Set());
  const[openPanels,setOpenPanels]=useState<Set<string>>(new Set(['customers']));
  const[eventMap,setEventMap]=useState<Record<string,KiwifyEvent[]>>({});
  const[eventLoading,setEventLoading]=useState<Record<string,boolean>>({});
  const[webhookAttempts,setWebhookAttempts]=useState<WebhookAttempt[]>([]);

  function money(minor:number|null,code:string|null){
    if(minor==null)return '—';
    try{return new Intl.NumberFormat(locale,{style:'currency',currency:code||'BRL'}).format(Number(minor)/100)}
    catch{return String(Number(minor)/100)}
  }

  function sourceLabel(source:string){
    if(source==='kiwify')return t('master.sourceKiwify');
    if(source==='manual')return t('master.sourceManual');
    if(source==='legacy')return t('master.sourceLegacy');
    if(source==='trial')return t('master.sourceTrial');
    return t('master.sourceAccount');
  }

  async function load(){
    setLoading(true);
    const s=createClient();
    const[f,cfg,list,attempts]=await Promise.all([
      s.rpc('admin_get_devinx_customer_funnel'),
      s.rpc('admin_get_devinx_settings'),
      s.rpc('admin_list_devinx_customers'),
      s.rpc('admin_list_kiwify_webhook_attempts')
    ]);
    if(f.error||cfg.error||list.error){setNotice(t('master.unauthorized'));setLoading(false);return}
    const fr=Array.isArray(f.data)?f.data[0]:f.data;
    const cr=Array.isArray(cfg.data)?cfg.data[0]:cfg.data;
    setFunnel(fr as Funnel);
    setCustomers((list.data||[]) as Customer[]);
    setWebhookAttempts((attempts.data||[]) as WebhookAttempt[]);
    setSubscriptionRequired(!!cr?.subscription_required);
    setCheckout(cr?.checkout_url||'');
    setLoading(false);
  }

  useEffect(()=>{load()},[]);

  const visible=useMemo(()=>customers.filter(c=>{
    const q=search.trim().toLowerCase();
    if(q&&!c.email.toLowerCase().includes(q))return false;
    if(filter==='active')return c.access_status==='active';
    if(filter==='blocked')return c.access_status==='blocked';
    if(filter==='pending')return !c.account_exists;
    if(filter==='kiwify')return c.kiwify_customer;
    if(filter==='manual')return c.manual_grant||c.access_source==='manual';
    if(filter==='trial')return c.access_source==='trial';
    return true;
  }),[customers,search,filter]);

  function togglePanel(key:string){setOpenPanels(prev=>{const next=new Set(prev);next.has(key)?next.delete(key):next.add(key);return next})}
  function toggleCustomer(email:string){setExpanded(prev=>{const next=new Set(prev);next.has(email)?next.delete(email):next.add(email);return next})}
  function toggleAllCustomers(){setExpanded(prev=>prev.size===visible.length?new Set():new Set(visible.map(c=>c.email)))}

  async function grantByEmail(e:FormEvent){
    e.preventDefault();
    const email=grantEmail.trim().toLowerCase();
    if(!email)return;
    const s=createClient();
    const expires=grantExpiry?new Date(grantExpiry+'T23:59:59').toISOString():null;
    const{error}=await s.rpc('admin_set_devinx_access_by_email',{p_email:email,p_allowed:true,p_note:grantNote.trim()||t('master.manualDefaultNote'),p_expires_at:expires});
    if(error){setNotice(t('master.accessError'));return}
    setNotice(t('master.manualGranted'));
    setGrantEmail('');setGrantNote('');setGrantExpiry('');
    await load();
  }

  async function setAccess(customer:Customer,allowed:boolean){
    const s=createClient();
    const{error}=await s.rpc('admin_set_devinx_access_by_email',{p_email:customer.email,p_allowed:allowed,p_note:t('master.changedByMaster'),p_expires_at:null});
    if(error){setNotice(t('master.accessError'));return}
    setNotice(allowed?t('master.granted'):t('master.blockedNotice'));
    await load();
  }

  async function clearManual(customer:Customer){
    if(!confirm(t('master.removeManualConfirm')))return;
    const s=createClient();
    const{error}=await s.rpc('admin_clear_devinx_manual_access_by_email',{p_email:customer.email});
    if(error){setNotice(t('master.removeManualError'));return}
    setNotice(t('master.manualRemoved'));
    await load();
  }

  async function saveSettings(){
    const s=createClient();
    const{error}=await s.rpc('admin_update_devinx_settings',{p_subscription_required:subscriptionRequired,p_checkout_url:checkout.trim()||null});
    if(error){setNotice(t('master.settingsError'));return}
    setNotice(t('master.settingsSaved'));
    await load();
  }

  async function openDiagnostic(customer:Customer){
    const s=createClient();
    const{data,error}=await s.rpc('admin_get_devinx_customer_diagnostic',{p_email:customer.email});
    if(error){setNotice(t('master.diagnosticError'));return}
    setDiag((Array.isArray(data)?data[0]:data) as Diagnostic);
    setDiagOpen(true);
  }

  async function loadEvents(email:string){
    if(eventMap[email]||eventLoading[email])return;
    setEventLoading(prev=>({...prev,[email]:true}));
    const s=createClient();
    const{data}=await s.rpc('admin_get_devinx_customer_events',{p_email:email});
    setEventMap(prev=>({...prev,[email]:(data||[]) as KiwifyEvent[]}));
    setEventLoading(prev=>({...prev,[email]:false}));
  }

  async function sendPasswordReset(customer:Customer){
    if(!customer.account_exists){setNotice(t('master.noAccountReset'));return}
    const s=createClient();
    const{error}=await s.auth.resetPasswordForEmail(customer.email,{redirectTo:'https://devinx.com.br/auth/confirm?next=/redefinir-senha'});
    setNotice(error?t('master.resetError'):t('master.resetSent'));
  }

  async function deleteAccount(customer:Customer){
    if(!customer.user_id||!customer.account_exists)return;
    const typed=prompt(t('master.deletePrompt')+'\n\n'+customer.email);
    if(!typed)return;
    const s=createClient();
    const{error}=await s.rpc('admin_delete_devinx_user',{p_user_id:customer.user_id,p_confirm_email:typed});
    if(error){setNotice(t('master.deleteError'));return}
    setNotice(t('master.deleted'));
    await load();
  }

  if(loading)return <section className="panel"><span className="loader"/></section>;

  return <div className="masterPage">
    <section className="masterHero">
      <div><span className="goldPill">{t('master.admin')}</span><h2>{t('master.title')}</h2><p>{t('master.lead')}</p></div>
      <div className="masterHeroActions"><button className="secondary compactButton" onClick={load}>{t('master.refresh')}</button><span className="masterLock">◆</span></div>
    </section>

    <MasterLivePresence/>

    <section className={'panel masterSectionCard '+(openPanels.has('laser')?'expanded':'collapsed')}>
      <button className="collapseHeader masterSectionHeader" type="button" onClick={()=>togglePanel('laser')}>
        <div><small>LASER CONTROL</small><h2>Controle remoto para LightBurn</h2></div>
        <em>{openPanels.has('laser')?'−':'＋'}</em>
      </button>
      {openPanels.has('laser')&&<div className="collapsibleBody">
        <p className="sectionLead">Área privada de teste. Pareamento, telemetria e dispositivos ficam visíveis só para o master; comandos físicos continuam bloqueados.</p>
        <LaserControlMasterPanel/>
      </div>}
    </section>


    {funnel&&<div className="masterMetrics">
      <article><small>{t('master.customersKnown')}</small><b>{funnel.total_customers}</b></article>
      <article><small>{t('master.accounts')}</small><b>{funnel.total_accounts}</b></article>
      <article><small>{t('master.activeAccess')}</small><b>{funnel.active_access}</b></article>
      <article><small>{t('master.kiwify')}</small><b>{funnel.kiwify_customers}</b></article>
      <article><small>{t('master.manual')}</small><b>{funnel.manual_grants}</b></article>
      <article><small>{t('master.pendingSignup')}</small><b>{funnel.pending_signup}</b></article>
    </div>}

    <section className={'panel masterSectionCard '+(openPanels.has('grant')?'expanded':'collapsed')}>
      <button className="collapseHeader masterSectionHeader" type="button" onClick={()=>togglePanel('grant')}><div><small>{t('master.manualAccess')}</small><h2>{t('master.grantByEmail')}</h2></div><em>{openPanels.has('grant')?'−':'＋'}</em></button>
      {openPanels.has('grant')&&<div className="collapsibleBody"><p className="sectionLead">{t('master.grantByEmailHelp')}</p><form className="masterGrantForm" onSubmit={grantByEmail}>
        <label>{t('master.email')}<input type="email" required value={grantEmail} onChange={e=>setGrantEmail(e.target.value)} placeholder="cliente@email.com"/></label>
        <label>{t('master.validUntil')} <small>({t('common.optional')})</small><input type="date" value={grantExpiry} onChange={e=>setGrantExpiry(e.target.value)}/></label>
        <label>{t('master.note')} <small>({t('common.optional')})</small><input value={grantNote} onChange={e=>setGrantNote(e.target.value)} placeholder={t('master.notePlaceholder')}/></label>
        <button className="primary goldButton">{t('master.grant')}</button>
      </form></div>}
    </section>

    <section className={'panel masterSectionCard '+(openPanels.has('subscription')?'expanded':'collapsed')}>
      <button className="collapseHeader masterSectionHeader" type="button" onClick={()=>togglePanel('subscription')}><div><small>{t('master.kiwify')}</small><h2>{t('master.subscriptionGate')}</h2></div><em>{openPanels.has('subscription')?'−':'＋'}</em></button>
      {openPanels.has('subscription')&&<div className="collapsibleBody masterSettings">
        <label className="switchRow"><span><b>{t('master.subscriptionGate')}</b><small>{t('master.subscriptionReady')}</small></span><input type="checkbox" checked={subscriptionRequired} onChange={e=>setSubscriptionRequired(e.target.checked)}/></label>
        <label>{t('master.checkout')}<input value={checkout} onChange={e=>setCheckout(e.target.value)} placeholder="https://pay.kiwify.com.br/..."/></label>
        <button className="primary goldButton" onClick={saveSettings}>{t('master.saveSettings')}</button>
        <p className="securityNote">{t('master.security')}</p>
      </div>}
    </section>

    <section className={'panel masterSectionCard '+(openPanels.has('webhook')?'expanded':'collapsed')}>
      <button className="collapseHeader masterSectionHeader" type="button" onClick={()=>togglePanel('webhook')}><div><small>KIWIFY WEBHOOK</small><h2>{t('master.webhookDiagnostics')}</h2></div><em>{openPanels.has('webhook')?'−':'＋'}</em></button>
      {openPanels.has('webhook')&&<div className="collapsibleBody">
        <p className="sectionLead">{t('master.webhookDiagnosticsHelp')}</p>
        <div className="webhookAttemptList">
          {webhookAttempts.length===0?<div className="empty"><b>{t('master.webhookNoAttempts')}</b></div>:webhookAttempts.map((w,index)=><article className={'webhookAttempt '+w.outcome} key={w.received_at+'-'+index}>
            <span className="webhookDot"/>
            <div><b>{w.outcome==='accepted'?t('master.webhookAccepted'):w.outcome==='ignored'?t('master.webhookIgnored'):w.outcome==='error'?t('master.webhookError'):t('master.webhookReceived')}</b><small>{date(w.received_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small></div>
            <div className="webhookMeta"><span>{t('master.webhookEvent')}: {w.event_type||'—'}</span><span>{t('master.webhookProduct')}: {w.product_id||'—'}</span>{w.note&&<span>{w.note}</span>}</div>
          </article>)}
        </div>
      </div>}
    </section>

    {notice&&<div className="authMessage">{notice}</div>}

    <section className="panel masterUsers">
      <div className="sectionTitleRow"><div><small>{t('master.customerBase')}</small><h2>{t('master.users')}</h2></div><div className="sectionActions"><span>{visible.length}</span><button className="ghost compactButton" onClick={toggleAllCustomers}>{expanded.size===visible.length&&visible.length>0?t('common.collapseAll'):t('common.expandAll')}</button></div></div>
      <div className="masterFilters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('master.search')}/><div className="filterRow">
        <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('common.all')}</button>
        <button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>{t('common.active')}</button>
        <button className={filter==='blocked'?'active':''} onClick={()=>setFilter('blocked')}>{t('common.blocked')}</button>
        <button className={filter==='pending'?'active':''} onClick={()=>setFilter('pending')}>{t('master.noAccount')}</button>
        <button className={filter==='kiwify'?'active':''} onClick={()=>setFilter('kiwify')}>{t('master.kiwify')}</button>
        <button className={filter==='manual'?'active':''} onClick={()=>setFilter('manual')}>{t('master.manual')}</button>
        <button className={filter==='trial'?'active':''} onClick={()=>setFilter('trial')}>{t('master.trial')}</button>
      </div></div>

      <div className="adminUserList">{visible.length===0?<div className="empty"><b>{t('master.noUsers')}</b></div>:visible.map(c=>{
        const opened=expanded.has(c.email);
        const events=eventMap[c.email]||[];
        return <article key={c.email} className={'adminUser collapsibleCustomer '+(c.is_admin?'masterSelf ':'')+(opened?'expanded':'collapsed')}>
          <button className="collapseHeader customerHeader" type="button" onClick={()=>{toggleCustomer(c.email);if(!opened&&c.kiwify_customer)loadEvents(c.email)}}>
            <div className="adminIdentity"><b>{c.email}</b><small>{c.is_admin?t('master.admin'):c.account_exists?(c.onboarded_at?t('master.accountReady'):t('master.onboardingPending')):t('master.waitingAccount')}</small></div>
            <div className="customerHeaderBadges">{c.kiwify_customer&&<span className="statusBadge">KIWIFY</span>}{(c.manual_grant||c.access_source==='manual')&&<span className="statusBadge">{t('master.manual')}</span>}<span className={'statusBadge '+(c.access_status==='blocked'?'overdue':'')}>{t(statusKey(c.access_status))}</span></div>
            <em>{opened?'−':'＋'}</em>
          </button>
          {opened&&<div className="collapsibleBody customerBody">
            <div className="adminMeta customerMeta">
              <span><small>{t('master.access')}</small><b>{t(statusKey(c.access_status))}</b></span>
              <span><small>{t('master.source')}</small><b>{sourceLabel(c.access_source)}</b></span>
              <span><small>{t('master.created')}</small><b>{c.created_at?date(c.created_at,{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></span>
              <span><small>{t('master.lastLogin')}</small><b>{c.last_sign_in_at?date(c.last_sign_in_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</b></span>
              <span><small>{t('master.onboarded')}</small><b>{c.onboarded_at?date(c.onboarded_at,{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></span>
              <span><small>{t('master.validUntil')}</small><b>{c.expires_at?date(c.expires_at,{day:'2-digit',month:'short',year:'numeric'}):t('master.noExpiry')}</b></span>
              {c.kiwify_status&&<span><small>{t('master.subscription')}</small><b>{c.kiwify_status}</b></span>}
              {c.plan_name&&<span><small>{t('master.plan')}</small><b>{c.plan_name}{c.amount_minor!=null?' · '+money(c.amount_minor,c.currency_code):''}</b></span>}
              {c.last_event_at&&<span><small>{t('master.lastKiwifyEvent')}</small><b>{date(c.last_event_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b></span>}
            </div>
            <div className="adminActions">
              <button onClick={()=>openDiagnostic(c)}>{t('master.diagnostic')}</button>
              {!c.is_admin&&<>{c.access_status==='active'?<button className="dangerText" onClick={()=>setAccess(c,false)}>{t('master.block')}</button>:<button className="positiveAction" onClick={()=>setAccess(c,true)}>{t('master.grant')}</button>}
              {(c.manual_grant||c.access_source==='manual')&&<button onClick={()=>clearManual(c)}>{t('master.removeManual')}</button>}
              {c.account_exists&&<button onClick={()=>sendPasswordReset(c)}>{t('master.resetPassword')}</button>}
              {c.account_exists&&<button className="dangerText" onClick={()=>deleteAccount(c)}>{t('master.delete')}</button>}</>}
            </div>
            {c.kiwify_customer&&<div className="kiwifyTimeline"><div className="timelineTitle"><b>{t('master.kiwifyHistory')}</b><button className="ghost compactButton" onClick={()=>loadEvents(c.email)}>{t('master.refresh')}</button></div>
              {eventLoading[c.email]?<span className="loader"/>:events.length===0?<small>{t('master.noKiwifyEvents')}</small>:events.map((ev,index)=><div className="timelineEvent" key={ev.received_at+'-'+index}><span className={ev.has_access?'timelineDot active':'timelineDot'}/><div><b>{ev.event_type||ev.subscription_status||t('master.kiwifyEvent')}</b><small>{date(ev.received_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}{ev.access_until?' · '+t('master.validUntil')+' '+date(ev.access_until,{day:'2-digit',month:'short',year:'numeric'}):''}</small></div><strong>{ev.amount_minor!=null?money(ev.amount_minor,ev.currency_code):''}</strong></div>)}
            </div>}
          </div>}
        </article>
      })}</div>
    </section>

    {diagOpen&&diag&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDiagOpen(false)}}><section className="modalCard diagnosticCard">
      <div className="modalHead"><h2>{t('master.diagnostic')}</h2><button onClick={()=>setDiagOpen(false)}>×</button></div>
      <b className="diagEmail">{diag.email}</b>
      <div className="diagDetails">
        <span>{t('master.account')}: {diag.account_exists?t('master.createdAccount'):t('master.noAccount')}</span>
        <span>{t('master.access')}: {t(statusKey(diag.access_status))} · {sourceLabel(diag.access_source)}</span>
        <span>{t('master.kiwify')}: {diag.kiwify_customer?(diag.kiwify_status||t('master.registered')):t('master.no')}</span>
        <span>{t('master.manual')}: {diag.manual_grant?t('master.yes'):t('master.no')}</span>
        <span>{t('master.onboarded')}: {diag.onboarded_at?t('master.ok'):t('master.pending')}</span>
        <span>{t('master.lastLogin')}: {diag.last_sign_in_at?date(diag.last_sign_in_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</span>
      </div>
      <div className="diagGrid">
        <article><small>{t('master.tx')}</small><b>{diag.transactions_count}</b></article>
        <article><small>{t('master.work')}</small><b>{diag.work_sessions_count}</b></article>
        <article><small>{t('master.cards')}</small><b>{diag.cards_count}</b></article>
        <article><small>{t('master.bills')}</small><b>{diag.recurring_bills_count}</b></article>
        <article><small>{t('master.debts')}</small><b>{diag.debts_count}</b></article>
        <article><small>{t('master.lastActivity')}</small><b>{diag.last_financial_activity?date(diag.last_financial_activity,{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></article>
      </div>
    </section></div>}
  </div>;
}
