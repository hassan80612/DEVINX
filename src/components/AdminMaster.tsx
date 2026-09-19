'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';

type Funnel={total_customers:number;total_accounts:number;onboarded:number;signed_in_7d:number;active_access:number;blocked_access:number;pending_signup:number;kiwify_customers:number;manual_grants:number;no_access:number};
type Customer={email:string;user_id:string|null;account_exists:boolean;created_at:string|null;last_sign_in_at:string|null;onboarded_at:string|null;access_status:string;access_source:string;expires_at:string|null;is_admin:boolean;manual_grant:boolean;kiwify_customer:boolean;kiwify_status:string|null;plan_name:string|null;amount_minor:number|null;currency_code:string|null;last_event_at:string|null};
type Diagnostic={email:string;user_id:string|null;account_exists:boolean;onboarded_at:string|null;last_sign_in_at:string|null;access_status:string;access_source:string;expires_at:string|null;manual_grant:boolean;kiwify_customer:boolean;kiwify_status:string|null;plan_name:string|null;transactions_count:number;work_sessions_count:number;cards_count:number;recurring_bills_count:number;debts_count:number;last_financial_activity:string|null};
type Settings={subscription_required:boolean;checkout_url:string|null};

export function AdminMaster(){
  const{t,date,locale}=useI18n();
  const[funnel,setFunnel]=useState<Funnel|null>(null);
  const[customers,setCustomers]=useState<Customer[]>([]);
  const[search,setSearch]=useState('');
  const[filter,setFilter]=useState<'all'|'active'|'blocked'|'pending'|'kiwify'|'manual'>('all');
  const[notice,setNotice]=useState('');
  const[loading,setLoading]=useState(true);
  const[diag,setDiag]=useState<Diagnostic|null>(null);
  const[diagOpen,setDiagOpen]=useState(false);
  const[checkout,setCheckout]=useState('');
  const[subscriptionRequired,setSubscriptionRequired]=useState(false);
  const[grantEmail,setGrantEmail]=useState('');
  const[grantNote,setGrantNote]=useState('');
  const[grantExpiry,setGrantExpiry]=useState('');

  function money(minor:number|null,code:string|null){
    if(minor==null)return '';
    return new Intl.NumberFormat(locale,{style:'currency',currency:code||'BRL'}).format(Number(minor)/100);
  }

  async function load(){
    const s=createClient();
    const[f,cfg,list]=await Promise.all([
      s.rpc('admin_get_devinx_customer_funnel'),
      s.rpc('admin_get_devinx_settings'),
      s.rpc('admin_list_devinx_customers')
    ]);
    if(f.error||cfg.error||list.error){setNotice('Acesso Master não autorizado.');setLoading(false);return}
    const fr=Array.isArray(f.data)?f.data[0]:f.data;
    const cr=Array.isArray(cfg.data)?cfg.data[0]:cfg.data;
    setFunnel(fr as Funnel);
    setCustomers((list.data||[]) as Customer[]);
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
    return true;
  }),[customers,search,filter]);

  async function grantByEmail(e:FormEvent){
    e.preventDefault();
    const email=grantEmail.trim().toLowerCase();
    if(!email)return;
    const s=createClient();
    const expires=grantExpiry?new Date(grantExpiry+'T23:59:59').toISOString():null;
    const{error}=await s.rpc('admin_set_devinx_access_by_email',{p_email:email,p_allowed:true,p_note:grantNote.trim()||'Liberado pelo Master',p_expires_at:expires});
    if(error){setNotice('Não foi possível liberar este e-mail.');return}
    setNotice('Acesso manual liberado. Se a conta ainda não existir, ficará reservado para este e-mail.');
    setGrantEmail('');setGrantNote('');setGrantExpiry('');
    await load();
  }

  async function setAccess(customer:Customer,allowed:boolean){
    const s=createClient();
    const{error}=await s.rpc('admin_set_devinx_access_by_email',{p_email:customer.email,p_allowed:allowed,p_note:'Alterado pelo Master Devinx',p_expires_at:null});
    if(error){setNotice('Não foi possível alterar o acesso.');return}
    setNotice(allowed?'Acesso liberado.':'Acesso bloqueado.');
    await load();
  }

  async function clearManual(customer:Customer){
    if(!confirm('Remover a exceção manual deste e-mail e voltar a obedecer à assinatura Kiwify?'))return;
    const s=createClient();
    const{error}=await s.rpc('admin_clear_devinx_manual_access_by_email',{p_email:customer.email});
    if(error){setNotice('Não foi possível remover o acesso manual.');return}
    setNotice('Exceção manual removida.');
    await load();
  }

  async function saveSettings(){
    const s=createClient();
    const{error}=await s.rpc('admin_update_devinx_settings',{p_subscription_required:subscriptionRequired,p_checkout_url:checkout.trim()||null});
    if(error){setNotice('Não foi possível salvar o controle.');return}
    setNotice('Controle de assinatura atualizado.');
    await load();
  }

  async function openDiagnostic(customer:Customer){
    const s=createClient();
    const{data,error}=await s.rpc('admin_get_devinx_customer_diagnostic',{p_email:customer.email});
    if(error){setNotice('Não foi possível abrir o diagnóstico.');return}
    setDiag((Array.isArray(data)?data[0]:data) as Diagnostic);
    setDiagOpen(true);
  }

  async function deleteAccount(customer:Customer){
    if(!customer.user_id||!customer.account_exists)return;
    const typed=prompt(t('master.deletePrompt')+'\n\n'+customer.email);
    if(!typed)return;
    const s=createClient();
    const{error}=await s.rpc('admin_delete_devinx_user',{p_user_id:customer.user_id,p_confirm_email:typed});
    if(error){setNotice('Exclusão cancelada ou não autorizada.');return}
    setNotice('Conta do cliente excluída.');
    await load();
  }

  if(loading)return <section className="panel"><span className="loader"/></section>;

  return <div className="masterPage">
    <section className="masterHero"><div><span className="goldPill">{t('master.admin')}</span><h2>{t('master.title')}</h2><p>Clientes, assinaturas, acessos manuais, funil e diagnóstico em um só lugar.</p></div><span className="masterLock">◆</span></section>

    {funnel&&<div className="masterMetrics">
      <article><small>Clientes</small><b>{funnel.total_customers}</b></article>
      <article><small>Contas criadas</small><b>{funnel.total_accounts}</b></article>
      <article><small>Acesso ativo</small><b>{funnel.active_access}</b></article>
      <article><small>Kiwify</small><b>{funnel.kiwify_customers}</b></article>
      <article><small>Manual</small><b>{funnel.manual_grants}</b></article>
      <article><small>Aguardando cadastro</small><b>{funnel.pending_signup}</b></article>
    </div>}

    <section className="panel masterGrant">
      <div className="sectionTitleRow"><div><small>ACESSO MANUAL</small><h2>Liberar por e-mail</h2></div></div>
      <p className="sectionLead">Funciona mesmo antes de a pessoa criar a conta. Quando ela se cadastrar com o mesmo e-mail, o acesso entra automaticamente.</p>
      <form className="masterGrantForm" onSubmit={grantByEmail}>
        <label>E-mail<input type="email" required value={grantEmail} onChange={e=>setGrantEmail(e.target.value)} placeholder="cliente@email.com"/></label>
        <label>Validade <small>(opcional)</small><input type="date" value={grantExpiry} onChange={e=>setGrantExpiry(e.target.value)}/></label>
        <label>Observação <small>(opcional)</small><input value={grantNote} onChange={e=>setGrantNote(e.target.value)} placeholder="Cortesia, suporte, parceiro..."/></label>
        <button className="primary goldButton">Liberar acesso</button>
      </form>
    </section>

    <section className="panel masterSettings">
      <div className="sectionTitleRow"><div><small>KIWIFY / ACCESS</small><h2>{t('master.subscriptionGate')}</h2></div></div>
      <label className="switchRow"><span><b>{t('master.subscriptionGate')}</b><small>{t('master.subscriptionReady')}</small></span><input type="checkbox" checked={subscriptionRequired} onChange={e=>setSubscriptionRequired(e.target.checked)}/></label>
      <label>{t('master.checkout')}<input value={checkout} onChange={e=>setCheckout(e.target.value)} placeholder="https://pay.kiwify.com.br/..."/></label>
      <button className="primary goldButton" onClick={saveSettings}>{t('master.saveSettings')}</button>
      <p className="securityNote">{t('master.security')}</p>
    </section>

    {notice&&<div className="authMessage">{notice}</div>}

    <section className="panel masterUsers">
      <div className="sectionTitleRow"><div><small>BASE ÚNICA</small><h2>Clientes e acessos</h2></div><span>{visible.length}</span></div>
      <div className="masterFilters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por e-mail"/><div className="filterRow">
        <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todos</button>
        <button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Ativos</button>
        <button className={filter==='blocked'?'active':''} onClick={()=>setFilter('blocked')}>Bloqueados</button>
        <button className={filter==='pending'?'active':''} onClick={()=>setFilter('pending')}>Sem conta</button>
        <button className={filter==='kiwify'?'active':''} onClick={()=>setFilter('kiwify')}>Kiwify</button>
        <button className={filter==='manual'?'active':''} onClick={()=>setFilter('manual')}>Manual</button>
      </div></div>

      <div className="adminUserList">{visible.length===0?<div className="empty"><b>Nenhum cliente encontrado.</b></div>:visible.map(c=><article key={c.email} className={c.is_admin?'adminUser masterSelf':'adminUser'}>
        <div className="adminIdentity"><b>{c.email}</b><small>{c.is_admin?'MASTER':c.account_exists?(c.onboarded_at?'Conta ativa':'Onboarding pendente'):'Aguardando criação da conta'}</small></div>
        <div className="adminMeta">
          <span>Acesso: <b className={c.access_status==='active'?'positive':c.access_status==='blocked'?'negative':''}>{c.access_status}</b> · {c.access_source}</span>
          <span>Origem: {c.kiwify_customer?'Kiwify':''}{c.kiwify_customer&&c.manual_grant?' + ':''}{c.manual_grant?'Manual':(!c.kiwify_customer?'Conta':'')}</span>
          {c.kiwify_status&&<span>Assinatura: {c.kiwify_status}</span>}
          {c.plan_name&&<span>Plano: {c.plan_name}{c.amount_minor!=null?' · '+money(c.amount_minor,c.currency_code):''}</span>}
          <span>Último acesso: {c.last_sign_in_at?date(c.last_sign_in_at,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</span>
          {c.expires_at&&<span>Validade: {date(c.expires_at,{day:'2-digit',month:'short',year:'numeric'})}</span>}
        </div>
        <div className="adminActions">
          <button onClick={()=>openDiagnostic(c)}>Diagnóstico</button>
          {!c.is_admin&&<>{c.access_status==='active'?<button className="dangerText" onClick={()=>setAccess(c,false)}>Bloquear</button>:<button className="positiveAction" onClick={()=>setAccess(c,true)}>Liberar</button>}
          {c.manual_grant&&<button onClick={()=>clearManual(c)}>Remover manual</button>}
          {c.account_exists&&<button className="dangerText" onClick={()=>deleteAccount(c)}>Excluir conta</button>}</>}
        </div>
      </article>)}</div>
    </section>

    {diagOpen&&diag&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDiagOpen(false)}}><section className="modalCard diagnosticCard">
      <div className="modalHead"><h2>Diagnóstico do cliente</h2><button onClick={()=>setDiagOpen(false)}>×</button></div>
      <b className="diagEmail">{diag.email}</b>
      <div className="diagDetails">
        <span>Conta: {diag.account_exists?'Criada':'Ainda não criada'}</span>
        <span>Acesso: {diag.access_status} · {diag.access_source}</span>
        <span>Kiwify: {diag.kiwify_customer?(diag.kiwify_status||'registrado'):'não'}</span>
        <span>Manual: {diag.manual_grant?'sim':'não'}</span>
        <span>Onboarding: {diag.onboarded_at?'OK':'Pendente'}</span>
        <span>Último login: {diag.last_sign_in_at?date(diag.last_sign_in_at,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</span>
      </div>
      <div className="diagGrid">
        <article><small>Movimentos</small><b>{diag.transactions_count}</b></article>
        <article><small>Jornadas</small><b>{diag.work_sessions_count}</b></article>
        <article><small>Cartões</small><b>{diag.cards_count}</b></article>
        <article><small>Contas</small><b>{diag.recurring_bills_count}</b></article>
        <article><small>Dívidas</small><b>{diag.debts_count}</b></article>
        <article><small>Última atividade</small><b>{diag.last_financial_activity?date(diag.last_financial_activity,{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></article>
      </div>
    </section></div>}
  </div>;
}
