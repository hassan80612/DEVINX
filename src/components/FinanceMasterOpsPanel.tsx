'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type FinanceFilter='all'|'active'|'blocked'|'pending'|'kiwify'|'manual'|'trial';

type Funnel={
  total_customers:number;
  total_accounts:number;
  onboarded:number;
  signed_in_7d:number;
  active_access:number;
  blocked_access:number;
  pending_signup:number;
  kiwify_customers:number;
  manual_grants:number;
  no_access:number;
};

type Customer={
  email:string;
  user_id:string|null;
  account_exists:boolean;
  created_at:string|null;
  last_sign_in_at:string|null;
  onboarded_at:string|null;
  access_status:string;
  access_source:string;
  expires_at:string|null;
  is_admin:boolean;
  manual_grant:boolean;
  kiwify_customer:boolean;
};

type WebhookAttempt={
  outcome:'received'|'accepted'|'ignored'|'error';
  event_type:string|null;
  product_id:string|null;
  note:string|null;
  received_at:string;
};

type Diagnostic={
  email:string;
  transactions_count:number;
  work_sessions_count:number;
  cards_count:number;
  recurring_bills_count:number;
  debts_count:number;
  last_financial_activity:string|null;
};

type Usage={
  loading:boolean;
  scanned:number;
  failed:number;
  transactions:number;
  work:number;
  cards:number;
  bills:number;
  debts:number;
  active7d:number;
  active30d:number;
  lastActivity:string|null;
};

const EMPTY_USAGE:Usage={
  loading:true,scanned:0,failed:0,transactions:0,work:0,cards:0,bills:0,debts:0,active7d:0,active30d:0,lastActivity:null
};

function withinDays(value:string|null,days:number){
  if(!value)return false;
  const time=Date.parse(value);
  return Number.isFinite(time)&&Date.now()-time<=days*86400000;
}

function formatDateTime(value:string|null){
  if(!value)return '—';
  const time=Date.parse(value);
  if(!Number.isFinite(time))return '—';
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(time));
}

export function FinanceMasterOpsPanel({
  funnel,
  customers,
  webhookAttempts,
  onFilter
}:{
  funnel:Funnel|null;
  customers:Customer[];
  webhookAttempts:WebhookAttempt[];
  onFilter:(filter:FinanceFilter)=>void;
}){
  const[usage,setUsage]=useState<Usage>(EMPTY_USAGE);
  const[usageOpen,setUsageOpen]=useState(true);

  const accounts=useMemo(
    ()=>customers.filter(customer=>customer.account_exists&&!customer.is_admin&&customer.email).slice(0,80),
    [customers]
  );

  const commercial=useMemo(()=>{
    const now=Date.now();
    const trials=customers.filter(customer=>customer.access_source==='trial');
    const expiring48h=customers.filter(customer=>{
      if(customer.access_status!=='active'||!customer.expires_at)return false;
      const expires=Date.parse(customer.expires_at);
      return Number.isFinite(expires)&&expires>now&&expires-now<=48*60*60*1000;
    }).length;
    const inactive14d=customers.filter(customer=>customer.account_exists&&!customer.is_admin&&!withinDays(customer.last_sign_in_at,14)).length;
    const webhook24h=webhookAttempts.filter(item=>withinDays(item.received_at,1));
    return{
      trials:trials.length,
      expiring48h,
      inactive14d,
      webhookAccepted:webhook24h.filter(item=>item.outcome==='accepted').length,
      webhookErrors:webhook24h.filter(item=>item.outcome==='error').length
    };
  },[customers,webhookAttempts]);

  const loadUsage=useCallback(async()=>{
    setUsage(current=>({...current,loading:true,failed:0,scanned:0}));
    const s=createClient();
    const aggregate:Usage={...EMPTY_USAGE,loading:false};
    for(let i=0;i<accounts.length;i+=6){
      const batch=accounts.slice(i,i+6);
      const rows=await Promise.all(batch.map(async customer=>{
        const{data,error}=await s.rpc('admin_get_devinx_customer_diagnostic',{p_email:customer.email});
        if(error)return null;
        return (Array.isArray(data)?data[0]:data) as Diagnostic|null;
      }));
      for(const row of rows){
        if(!row){aggregate.failed+=1;continue}
        aggregate.scanned+=1;
        aggregate.transactions+=Number(row.transactions_count||0);
        aggregate.work+=Number(row.work_sessions_count||0);
        aggregate.cards+=Number(row.cards_count||0);
        aggregate.bills+=Number(row.recurring_bills_count||0);
        aggregate.debts+=Number(row.debts_count||0);
        if(withinDays(row.last_financial_activity,7))aggregate.active7d+=1;
        if(withinDays(row.last_financial_activity,30))aggregate.active30d+=1;
        if(row.last_financial_activity&&(!aggregate.lastActivity||Date.parse(row.last_financial_activity)>Date.parse(aggregate.lastActivity))){
          aggregate.lastActivity=row.last_financial_activity;
        }
      }
      setUsage({...aggregate,loading:true});
    }
    setUsage({...aggregate,loading:false});
  },[accounts]);

  useEffect(()=>{void loadUsage()},[loadUsage]);

  function show(filter:FinanceFilter){
    onFilter(filter);
    window.requestAnimationFrame(()=>document.getElementById('finance-master-users')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  const alertCount=(funnel?.blocked_access||0)+commercial.expiring48h+commercial.webhookErrors;

  return <section className="financeOpsMaster panel">
    <div className="financeOpsHead">
      <div>
        <small>ÁREA MASTER · FINANCEIRO</small>
        <h2>Central operacional do Financeiro</h2>
        <p>Acesso, atividade dos módulos e sinais comerciais em uma visão só.</p>
      </div>
      <div className="financeOpsHeadActions">
        <span className="financeOpsSafe">FINANCEIRO</span>
        <button type="button" className="secondary compactButton" onClick={()=>void loadUsage()} disabled={usage.loading}>{usage.loading?'Lendo…':'Atualizar uso'}</button>
      </div>
    </div>

    <div className="financeOpsStatusGrid">
      <button type="button" onClick={()=>show('active')}>
        <small>ACESSOS ATIVOS</small>
        <strong>{funnel?.active_access??0}</strong>
        <span>{funnel?.signed_in_7d??0} entraram nos últimos 7 dias</span>
      </button>
      <button type="button" onClick={()=>show('trial')}>
        <small>TRIALS</small>
        <strong>{commercial.trials}</strong>
        <span>{commercial.expiring48h} vencem em até 48h</span>
      </button>
      <button type="button" onClick={()=>show('kiwify')}>
        <small>KIWIFY</small>
        <strong>{funnel?.kiwify_customers??0}</strong>
        <span>{commercial.webhookAccepted} webhooks aceitos em 24h</span>
      </button>
      <button type="button" className={alertCount>0?'attention':''} onClick={()=>show('blocked')}>
        <small>ATENÇÃO</small>
        <strong>{alertCount}</strong>
        <span>{commercial.webhookErrors} erro(s) de webhook · {funnel?.blocked_access??0} bloqueado(s)</span>
      </button>
    </div>

    <div className="financeOpsToolbar">
      <div>
        <small>USO REAL DO FINANCEIRO</small>
        <b>{usage.loading?'Atualizando leitura dos clientes…':usage.scanned+' conta(s) analisada(s)'}</b>
      </div>
      <button type="button" className="ghost compactButton" onClick={()=>setUsageOpen(current=>!current)}>{usageOpen?'Recolher':'Expandir'}</button>
    </div>

    {usageOpen&&<div className="financeOpsUsage">
      <div className="financeOpsModuleGrid">
        <article><small>MOVIMENTOS</small><b>{usage.transactions}</b><span>lançamentos registrados</span></article>
        <article><small>JORNADAS</small><b>{usage.work}</b><span>sessões de trabalho</span></article>
        <article><small>CARTÕES</small><b>{usage.cards}</b><span>cartões cadastrados</span></article>
        <article><small>CONTAS</small><b>{usage.bills}</b><span>contas recorrentes</span></article>
        <article><small>DÍVIDAS</small><b>{usage.debts}</b><span>dívidas acompanhadas</span></article>
        <article><small>ATIVOS 30D</small><b>{usage.active30d}</b><span>{usage.active7d} com atividade em 7 dias</span></article>
      </div>

      <div className="financeOpsHealth">
        <div><span className={commercial.webhookErrors===0?'okDot':'warnDot'}/><p><b>Webhook financeiro</b><small>{commercial.webhookErrors===0?'Sem erros detectados nas últimas 24h':commercial.webhookErrors+' erro(s) nas últimas 24h'}</small></p></div>
        <div><span className={usage.failed===0?'okDot':'warnDot'}/><p><b>Leitura administrativa</b><small>{usage.failed===0?'Diagnósticos respondendo normalmente':usage.failed+' conta(s) não responderam ao diagnóstico'}</small></p></div>
        <div><span className="okDot"/><p><b>Última atividade financeira</b><small>{formatDateTime(usage.lastActivity)}</small></p></div>
      </div>
    </div>}

    <div className="financeOpsWatch">
      <button type="button" onClick={()=>show('pending')}><small>CADASTRO PENDENTE</small><b>{funnel?.pending_signup??0}</b></button>
      <button type="button" onClick={()=>show('manual')}><small>ACESSO MANUAL</small><b>{funnel?.manual_grants??0}</b></button>
      <button type="button" onClick={()=>show('all')}><small>SEM LOGIN HÁ 14D</small><b>{commercial.inactive14d}</b></button>
      <button type="button" onClick={()=>show('all')}><small>CLIENTES CONHECIDOS</small><b>{funnel?.total_customers??customers.length}</b></button>
    </div>
  </section>;
}
