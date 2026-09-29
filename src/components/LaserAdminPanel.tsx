'use client';

import {FormEvent,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import styles from './LaserAdminPanel.module.css';

type Summary={
  known_customers:number;
  active_access:number;
  mentor_plans:number;
  manual_grants:number;
  linked_pcs:number;
  active_mentor_sessions:number;
};

type Customer={
  email:string;
  user_id:string|null;
  account_exists:boolean;
  is_admin:boolean;
  access_status:string;
  access_source:string;
  plan_id:string|null;
  expires_at:string|null;
  max_pcs:number;
  mentor_credits:number;
  manual_grant:boolean;
  device_count:number;
  active_mentor_sessions:number;
  last_seen_at:string|null;
};

export function LaserAdminPanel(){
  const[open,setOpen]=useState(false);
  const[loaded,setLoaded]=useState(false);
  const[loading,setLoading]=useState(false);
  const[summary,setSummary]=useState<Summary|null>(null);
  const[customers,setCustomers]=useState<Customer[]>([]);
  const[search,setSearch]=useState('');
  const[notice,setNotice]=useState('');
  const[email,setEmail]=useState('');
  const[plan,setPlan]=useState<'control'|'mentor'>('control');
  const[maxPcs,setMaxPcs]=useState(1);
  const[expiry,setExpiry]=useState('');
  const[note,setNote]=useState('');
  const[actionEmail,setActionEmail]=useState<string|null>(null);

  async function load(){
    setLoading(true);
    setNotice('');
    const s=createClient();
    const[sum,list]=await Promise.all([
      s.rpc('admin_get_laser_summary'),
      s.rpc('admin_list_laser_customers')
    ]);
    if(sum.error||list.error){
      setNotice('Não foi possível carregar o Master do Laser.');
      setLoading(false);
      return;
    }
    const sr=Array.isArray(sum.data)?sum.data[0]:sum.data;
    setSummary((sr||null) as Summary|null);
    setCustomers((list.data||[]) as Customer[]);
    setLoaded(true);
    setLoading(false);
  }

  async function toggle(){
    const next=!open;
    setOpen(next);
    if(next&&!loaded)await load();
  }

  async function grant(event:FormEvent){
    event.preventDefault();
    const normalized=email.trim().toLowerCase();
    if(!normalized)return;
    setActionEmail(normalized);
    setNotice('');
    const s=createClient();
    const expires=expiry?new Date(expiry+'T23:59:59').toISOString():null;
    const{data,error}=await s.rpc('admin_set_laser_access_by_email',{
      p_email:normalized,
      p_plan_id:plan,
      p_allowed:true,
      p_expires_at:expires,
      p_max_pcs:maxPcs,
      p_note:note.trim()||null
    });
    if(error){
      setNotice('Não foi possível conceder o acesso.');
    }else{
      const row=data as {account_exists?:boolean}|null;
      setNotice(row?.account_exists===false
        ?'Acesso salvo. O e-mail ainda não tem conta; será aplicado quando a conta DevinX for criada.'
        :'Acesso do Laser concedido.');
      setEmail('');setExpiry('');setNote('');setMaxPcs(1);setPlan('control');
      await load();
    }
    setActionEmail(null);
  }

  async function setAccess(customer:Customer,allowed:boolean){
    if(customer.is_admin)return;
    setActionEmail(customer.email);
    setNotice('');
    const s=createClient();
    const{error}=await s.rpc('admin_set_laser_access_by_email',{
      p_email:customer.email,
      p_plan_id:customer.plan_id==='mentor'?'mentor':'control',
      p_allowed:allowed,
      p_expires_at:allowed?null:customer.expires_at,
      p_max_pcs:Math.max(customer.max_pcs||1,1),
      p_note:allowed?'Liberado pelo Master Laser':'Bloqueado pelo Master Laser'
    });
    setNotice(error
      ?'Não foi possível alterar o acesso.'
      :allowed?'Acesso manual liberado.':'Acesso do Laser bloqueado.');
    await load();
    setActionEmail(null);
  }

  async function clearManual(customer:Customer){
    if(!customer.manual_grant||customer.is_admin)return;
    if(!confirm('Remover a concessão manual de '+customer.email+'? Se houver compra válida, ela volta a valer automaticamente.'))return;
    setActionEmail(customer.email);
    const s=createClient();
    const{error}=await s.rpc('admin_clear_laser_manual_access_by_email',{p_email:customer.email});
    setNotice(error?'Não foi possível remover a concessão manual.':'Concessão manual removida.');
    await load();
    setActionEmail(null);
  }

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return customers;
    return customers.filter(c=>c.email.toLowerCase().includes(q));
  },[customers,search]);

  const date=(value:string|null)=>{
    if(!value)return 'Sem vencimento';
    try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}
    catch{return value}
  };

  return <section className={styles.shell}>
    <button type="button" className={styles.masterButton} onClick={()=>void toggle()}>
      <span>◆</span>
      <b>MASTER LASER</b>
      <em>{open?'Fechar':'Abrir'}</em>
    </button>

    {open&&<div className={styles.panel}>
      <div className={styles.head}>
        <div>
          <small>ADMINISTRAÇÃO · LASER CONTROL</small>
          <h2>Master Laser Control</h2>
          <p>Gerencie acessos do Laser sem alterar Financeiro ou Loja.</p>
        </div>
        <button type="button" onClick={()=>void load()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>
      </div>

      {summary&&<div className={styles.metrics}>
        <article><small>CLIENTES LASER</small><b>{summary.known_customers}</b></article>
        <article><small>ACESSOS ATIVOS</small><b>{summary.active_access}</b></article>
        <article><small>MENTOR</small><b>{summary.mentor_plans}</b></article>
        <article><small>MANUAIS</small><b>{summary.manual_grants}</b></article>
        <article><small>PCS VINCULADOS</small><b>{summary.linked_pcs}</b></article>
        <article><small>MENTORIAS ATIVAS</small><b>{summary.active_mentor_sessions}</b></article>
      </div>}

      <form className={styles.grant} onSubmit={grant}>
        <div className={styles.sectionTitle}>
          <small>ACESSO MANUAL</small>
          <h3>Conceder acesso por e-mail</h3>
          <p>Funciona também se o cliente ainda não terminou de criar a conta.</p>
        </div>
        <label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@email.com"/></label>
        <label>Plano<select value={plan} onChange={e=>setPlan(e.target.value as 'control'|'mentor')}>
          <option value="control">Control</option>
          <option value="mentor">Mentor · 10 sessões</option>
        </select></label>
        <label>Limite de PCs<input type="number" min={1} max={25} value={maxPcs} onChange={e=>setMaxPcs(Math.max(1,Math.min(25,Number(e.target.value)||1)))}/></label>
        <label>Válido até <small>(opcional)</small><input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
        <label className={styles.note}>Observação <small>(opcional)</small><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: cortesia, suporte, teste interno"/></label>
        <button className={styles.grantButton} disabled={actionEmail!==null}>{actionEmail?'Aplicando…':'Conceder acesso'}</button>
      </form>

      {notice&&<div className={styles.notice}>{notice}</div>}

      <div className={styles.usersHead}>
        <div><small>USUÁRIOS DO LASER</small><h3>Acessos e uso</h3></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por e-mail"/>
      </div>

      <div className={styles.users}>
        {!loading&&visible.length===0&&<div className={styles.empty}>Nenhum cliente do Laser encontrado.</div>}
        {visible.map(customer=><article className={styles.user} key={customer.email}>
          <div className={styles.identity}>
            <div>
              <strong>{customer.email}</strong>
              <span>{customer.account_exists?'Conta criada':'Aguardando criação da conta'}</span>
            </div>
            <div className={styles.badges}>
              {customer.is_admin&&<b>MASTER</b>}
              {customer.manual_grant&&<b>MANUAL</b>}
              <b className={customer.access_status==='active'?styles.active:styles.blocked}>{customer.access_status==='active'?'ATIVO':'BLOQUEADO'}</b>
            </div>
          </div>
          <div className={styles.meta}>
            <span><small>Plano</small><b>{customer.plan_id||'—'}</b></span>
            <span><small>Origem</small><b>{customer.access_source||'—'}</b></span>
            <span><small>Validade</small><b>{date(customer.expires_at)}</b></span>
            <span><small>PCs</small><b>{customer.device_count}/{customer.max_pcs||0}</b></span>
            <span><small>Sessões restantes</small><b>{customer.mentor_credits<0?'∞':customer.mentor_credits}</b></span>
            <span><small>Mentoria ativa</small><b>{customer.active_mentor_sessions}</b></span>
            <span><small>Último PC online</small><b>{customer.last_seen_at?date(customer.last_seen_at):'—'}</b></span>
          </div>
          {!customer.is_admin&&<div className={styles.actions}>
            {customer.access_status==='active'
              ?<button type="button" className={styles.danger} disabled={actionEmail===customer.email} onClick={()=>void setAccess(customer,false)}>Bloquear Laser</button>
              :<button type="button" disabled={actionEmail===customer.email} onClick={()=>void setAccess(customer,true)}>Liberar manualmente</button>}
            {customer.manual_grant&&<button type="button" className={styles.secondary} disabled={actionEmail===customer.email} onClick={()=>void clearManual(customer)}>Remover manual</button>}
          </div>}
        </article>)}
      </div>
    </div>}
  </section>;
}
