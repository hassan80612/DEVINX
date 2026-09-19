'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';

type Funnel={total_accounts:number;onboarded:number;signed_in_7d:number;active_access:number;blocked_access:number;no_entitlement:number};
type UserRow={user_id:string;email:string;created_at:string;last_sign_in_at:string|null;access_status:string;access_source:string;plan_name:string|null;amount_minor:number|null;currency_code:string|null;expires_at:string|null;is_admin:boolean;onboarded_at:string|null};
type Diagnostic={email:string;onboarded_at:string|null;last_sign_in_at:string|null;access_status:string;access_source:string;plan_name:string|null;expires_at:string|null;transactions_count:number;work_sessions_count:number;cards_count:number;recurring_bills_count:number;debts_count:number;last_financial_activity:string|null};
type Settings={subscription_required:boolean;checkout_url:string|null};

export function AdminMaster(){
  const{t,currency,date}=useI18n();
  const[funnel,setFunnel]=useState<Funnel|null>(null);const[users,setUsers]=useState<UserRow[]>([]);const[settings,setSettings]=useState<Settings>({subscription_required:false,checkout_url:null});const[search,setSearch]=useState('');const[filter,setFilter]=useState<'all'|'active'|'blocked'|'none'>('all');const[notice,setNotice]=useState('');const[loading,setLoading]=useState(true);const[diag,setDiag]=useState<Diagnostic|null>(null);const[diagOpen,setDiagOpen]=useState(false);const[checkout,setCheckout]=useState('');const[subscriptionRequired,setSubscriptionRequired]=useState(false);

  async function load(){
    const s=createClient();
    const[f,u,c]=await Promise.all([s.rpc('admin_get_devinx_funnel'),s.rpc('admin_list_devinx_users'),s.rpc('admin_get_devinx_settings')]);
    if(f.error||u.error||c.error){setNotice('Acesso Master não autorizado.');setLoading(false);return}
    const fr=Array.isArray(f.data)?f.data[0]:f.data;const cr=Array.isArray(c.data)?c.data[0]:c.data;
    setFunnel(fr as Funnel);setUsers((u.data||[]) as UserRow[]);setSettings(cr as Settings);setSubscriptionRequired(!!cr?.subscription_required);setCheckout(cr?.checkout_url||'');setLoading(false);
  }
  useEffect(()=>{load()},[]);

  const visible=useMemo(()=>users.filter(u=>{
    const q=search.trim().toLowerCase();if(q&&!u.email.toLowerCase().includes(q))return false;
    if(filter==='active'&&u.access_status!=='active')return false;if(filter==='blocked'&&u.access_status!=='blocked')return false;if(filter==='none'&&u.access_status!=='none')return false;return true;
  }),[users,search,filter]);

  async function setAccess(user:UserRow,allowed:boolean){
    const s=createClient();const{error}=await s.rpc('admin_set_devinx_access',{p_user_id:user.user_id,p_allowed:allowed,p_source:'manual',p_note:'Master Devinx',p_expires_at:null});
    if(error){setNotice('Não foi possível alterar o acesso.');return}setNotice(allowed?'Acesso liberado.':'Acesso bloqueado.');await load();
  }
  async function saveSettings(){
    const s=createClient();const{error}=await s.rpc('admin_update_devinx_settings',{p_subscription_required:subscriptionRequired,p_checkout_url:checkout.trim()||null});if(error){setNotice('Não foi possível salvar o controle.');return}setNotice('Controle de assinatura atualizado.');await load();
  }
  async function openDiagnostic(user:UserRow){
    const s=createClient();const{data,error}=await s.rpc('admin_get_devinx_user_diagnostic',{p_user_id:user.user_id});if(error){setNotice('Não foi possível abrir o diagnóstico.');return}setDiag((Array.isArray(data)?data[0]:data) as Diagnostic);setDiagOpen(true);
  }
  async function deleteUser(user:UserRow){
    const typed=prompt(t('master.deletePrompt')+'\n\n'+user.email);if(!typed)return;const s=createClient();const{error}=await s.rpc('admin_delete_devinx_user',{p_user_id:user.user_id,p_confirm_email:typed});if(error){setNotice('Exclusão cancelada ou não autorizada.');return}setNotice('Cliente excluído.');await load();
  }

  if(loading)return <section className="panel"><span className="loader"/></section>;
  return <div className="masterPage">
    <section className="masterHero"><div><span className="goldPill">{t('master.admin')}</span><h2>{t('master.title')}</h2><p>{t('master.lead')}</p></div><span className="masterLock">◆</span></section>
    {funnel&&<div className="masterMetrics"><article><small>{t('master.accounts')}</small><b>{funnel.total_accounts}</b></article><article><small>{t('master.onboarded')}</small><b>{funnel.onboarded}</b></article><article><small>{t('master.active7')}</small><b>{funnel.signed_in_7d}</b></article><article><small>{t('master.activeAccess')}</small><b>{funnel.active_access}</b></article><article><small>{t('master.blocked')}</small><b>{funnel.blocked_access}</b></article><article><small>{t('master.noEntitlement')}</small><b>{funnel.no_entitlement}</b></article></div>}

    <section className="panel masterSettings"><div className="sectionTitleRow"><div><small>KIWIFY / ACCESS</small><h2>{t('master.subscriptionGate')}</h2></div></div><label className="switchRow"><span><b>{t('master.subscriptionGate')}</b><small>{t('master.subscriptionReady')}</small></span><input type="checkbox" checked={subscriptionRequired} onChange={e=>setSubscriptionRequired(e.target.checked)}/></label><label>{t('master.checkout')}<input value={checkout} onChange={e=>setCheckout(e.target.value)} placeholder="https://..."/></label><button className="primary goldButton" onClick={saveSettings}>{t('master.saveSettings')}</button><p className="securityNote">{t('master.security')}</p></section>

    {notice&&<div className="authMessage">{notice}</div>}

    <section className="panel masterUsers"><div className="sectionTitleRow"><div><small>{t('master.users').toUpperCase()}</small><h2>{t('master.users')}</h2></div><span>{visible.length}</span></div><div className="masterFilters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('master.search')}/><div className="filterRow"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('common.all')}</button><button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>{t('common.active')}</button><button className={filter==='blocked'?'active':''} onClick={()=>setFilter('blocked')}>{t('common.blocked')}</button><button className={filter==='none'?'active':''} onClick={()=>setFilter('none')}>{t('master.noEntitlement')}</button></div></div>
      <div className="adminUserList">{visible.length===0?<div className="empty"><b>{t('master.noUsers')}</b></div>:visible.map(u=><article key={u.user_id} className={u.is_admin?'adminUser masterSelf':'adminUser'}><div className="adminIdentity"><b>{u.email}</b><small>{u.is_admin?t('master.admin'):(u.onboarded_at?t('master.onboarded'):'Onboarding pendente')}</small></div><div className="adminMeta"><span>{t('master.created')}: {date(u.created_at,{day:'2-digit',month:'short',year:'numeric'})}</span><span>{t('master.lastLogin')}: {u.last_sign_in_at?date(u.last_sign_in_at,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</span><span>{t('master.access')}: <b className={u.access_status==='active'?'positive':u.access_status==='blocked'?'negative':''}>{u.access_status}</b> · {u.access_source}</span>{u.plan_name&&<span>{t('master.plan')}: {u.plan_name}{u.amount_minor? ' · '+currency(Number(u.amount_minor)):''}</span>}</div><div className="adminActions"><button onClick={()=>openDiagnostic(u)}>{t('master.diagnostic')}</button>{!u.is_admin&&<>{u.access_status==='active'?<button className="dangerText" onClick={()=>setAccess(u,false)}>{t('master.block')}</button>:<button className="positiveAction" onClick={()=>setAccess(u,true)}>{t('master.grant')}</button>}<button className="dangerText" onClick={()=>deleteUser(u)}>{t('master.delete')}</button></>}</div></article>)}</div>
    </section>

    {diagOpen&&diag&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDiagOpen(false)}}><section className="modalCard diagnosticCard"><div className="modalHead"><h2>{t('master.diagnostic')}</h2><button onClick={()=>setDiagOpen(false)}>×</button></div><b className="diagEmail">{diag.email}</b><div className="diagGrid"><article><small>{t('master.tx')}</small><b>{diag.transactions_count}</b></article><article><small>{t('master.work')}</small><b>{diag.work_sessions_count}</b></article><article><small>{t('master.cards')}</small><b>{diag.cards_count}</b></article><article><small>{t('master.bills')}</small><b>{diag.recurring_bills_count}</b></article><article><small>{t('master.debts')}</small><b>{diag.debts_count}</b></article><article><small>{t('master.lastActivity')}</small><b>{diag.last_financial_activity?date(diag.last_financial_activity,{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></article></div><div className="diagDetails"><span>{t('master.access')}: {diag.access_status} · {diag.access_source}</span><span>{t('master.plan')}: {diag.plan_name||'—'}</span><span>Onboarding: {diag.onboarded_at?'OK':'Pendente'}</span><span>{t('master.lastLogin')}: {diag.last_sign_in_at?date(diag.last_sign_in_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</span></div></section></div>}
  </div>;
}
