'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthKey} from '@/lib/date';
import {categoryName,CustomCategory} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

type Tx={type:'income'|'expense';amount_minor:number;occurred_on:string;is_avoidable:boolean;category_id:string};
type Work={gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;worked_on:string;minutes_worked:number;income_source_id:string|null;income_sources:{name:string}|null};
type BillPay={amount_minor:number;paid_on:string;recurring_bills:{category_id:string;is_avoidable:boolean}|null};
type CardPay={card_id:string;statement_month:string;amount_minor:number;paid_on:string};
type Inst={amount_minor:number;billing_month:string;card_purchases:{card_id:string;category_id:string;is_avoidable:boolean}|null};

function monthKey(value:string){return value.slice(0,7)}

export function ReportManager(){
  const{t,currency,date}=useI18n();
  const[months,setMonths]=useState(6);const[tx,setTx]=useState<Tx[]>([]);const[work,setWork]=useState<Work[]>([]);const[billPays,setBillPays]=useState<BillPay[]>([]);const[cardPays,setCardPays]=useState<CardPay[]>([]);const[inst,setInst]=useState<Inst[]>([]);const[custom,setCustom]=useState<CustomCategory[]>([]);const[loading,setLoading]=useState(true);

  async function load(show=true){
    if(show)setLoading(true);const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const start=new Date();start.setDate(1);start.setMonth(start.getMonth()-(months-1));const from=localDateISO(start);const monthFrom=localMonthKey(start)+'-01';
    const[a,b,c,d,e,f]=await Promise.all([
      s.from('transactions').select('type,amount_minor,occurred_on,is_avoidable,category_id').eq('user_id',user.id).gte('occurred_on',from),
      s.from('work_sessions').select('gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on,minutes_worked,income_source_id,income_sources(name)').eq('user_id',user.id).gte('worked_on',from),
      s.from('recurring_bill_payments').select('amount_minor,paid_on,recurring_bills(category_id,is_avoidable)').eq('user_id',user.id).gte('paid_on',from),
      s.from('card_bill_payments').select('card_id,statement_month,amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',from),
      s.from('card_installments').select('amount_minor,billing_month,card_purchases(card_id,category_id,is_avoidable)').eq('user_id',user.id).gte('billing_month',monthFrom),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id)
    ]);
    setTx((a.data||[]) as Tx[]);setWork((b.data||[]) as unknown as Work[]);setBillPays((c.data||[]) as unknown as BillPay[]);setCardPays((d.data||[]) as CardPay[]);setInst((e.data||[]) as unknown as Inst[]);setCustom((f.data||[]) as CustomCategory[]);setLoading(false);
  }
  useEffect(()=>{load(true);const refresh=()=>load(false);window.addEventListener('devinx:finance-updated',refresh);return()=>window.removeEventListener('devinx:finance-updated',refresh)},[months]);

  const report=useMemo(()=>{
    const byMonth=new Map<string,{income:number;out:number;avoidable:number;hours:number;workCost:number}>();
    for(let n=months-1;n>=0;n--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-n);byMonth.set(localMonthKey(d),{income:0,out:0,avoidable:0,hours:0,workCost:0})}
    const categories=new Map<string,{kind:'income'|'expense';amount:number}>();
    const sources=new Map<string,{gross:number;cost:number;hours:number}>();
    const addCat=(kind:'income'|'expense',id:string,amount:number)=>{const k=kind+'|'+id;const prev=categories.get(k)||{kind,amount:0};prev.amount+=amount;categories.set(k,prev)};

    tx.forEach(x=>{const row=byMonth.get(monthKey(x.occurred_on));if(!row)return;if(x.type==='income'){row.income+=Number(x.amount_minor);addCat('income',x.category_id,Number(x.amount_minor))}else{row.out+=Number(x.amount_minor);if(x.is_avoidable)row.avoidable+=Number(x.amount_minor);addCat('expense',x.category_id,Number(x.amount_minor))}});
    work.forEach(x=>{const row=byMonth.get(monthKey(x.worked_on));if(!row)return;const gross=Number(x.gross_income_minor),cost=Number(x.energy_cost_minor)+Number(x.extra_work_cost_minor),hours=Number(x.minutes_worked)/60;row.income+=gross;row.out+=cost;row.workCost+=cost;row.hours+=hours;addCat('income','work_income',gross);if(cost>0)addCat('expense','work_cost',cost);const name=x.income_sources?.name||t('move.workIncome');const src=sources.get(name)||{gross:0,cost:0,hours:0};src.gross+=gross;src.cost+=cost;src.hours+=hours;sources.set(name,src)});
    billPays.forEach(x=>{const row=byMonth.get(monthKey(x.paid_on));if(!row)return;const amount=Number(x.amount_minor);row.out+=amount;if(x.recurring_bills?.is_avoidable)row.avoidable+=amount;addCat('expense',x.recurring_bills?.category_id||'other',amount)});
    cardPays.forEach(x=>{const row=byMonth.get(monthKey(x.paid_on));if(!row)return;const amount=Number(x.amount_minor);row.out+=amount;const related=inst.filter(i=>i.billing_month===x.statement_month&&i.card_purchases?.card_id===x.card_id);const sum=related.reduce((a,b)=>a+Number(b.amount_minor),0);if(sum>0){related.forEach(i=>{const allocated=Math.round(amount*(Number(i.amount_minor)/sum));addCat('expense',i.card_purchases?.category_id||'other',allocated);if(i.card_purchases?.is_avoidable)row.avoidable+=allocated})}else addCat('expense','card_payment',amount)});

    const rows=[...byMonth.entries()].map(([month,v])=>({month,...v,result:v.income-v.out}));
    const totals=rows.reduce((a,r)=>({income:a.income+r.income,out:a.out+r.out,result:a.result+r.result,avoidable:a.avoidable+r.avoidable,hours:a.hours+r.hours,workCost:a.workCost+r.workCost}),{income:0,out:0,result:0,avoidable:0,hours:0,workCost:0});
    const categoryRows=[...categories.entries()].map(([key,v])=>{const id=key.split('|')[1];let label=id==='work_income'?t('move.workIncome'):id==='work_cost'?t('move.workCost'):id==='card_payment'?t('move.cardPayment'):categoryName(v.kind,id,custom,t);return{...v,id,label}}).sort((a,b)=>b.amount-a.amount);
    const sourceRows=[...sources.entries()].map(([name,v])=>({name,...v,net:v.gross-v.cost})).sort((a,b)=>b.net-a.net);
    return{rows,totals,categoryRows,sourceRows};
  },[tx,work,billPays,cardPays,inst,custom,months,t]);

  if(loading)return <section className="panel"><span className="loader"/></section>;
  return <div className="reportsPage">
    <p className="sectionLead">{t('reports.lead')}</p>
    <div className="filterRow reportPeriods"><button className={months===1?'active':''} onClick={()=>setMonths(1)}>{t('reports.month')}</button><button className={months===3?'active':''} onClick={()=>setMonths(3)}>{t('reports.3m')}</button><button className={months===6?'active':''} onClick={()=>setMonths(6)}>{t('reports.6m')}</button><button className={months===12?'active':''} onClick={()=>setMonths(12)}>{t('reports.12m')}</button></div>
    <div className="metricGrid reportMetrics"><article><small>{t('reports.income')}</small><b>{currency(report.totals.income)}</b></article><article><small>{t('reports.outflow')}</small><b>{currency(report.totals.out)}</b></article><article><small>{t('reports.result')}</small><b className={report.totals.result>=0?'positive':'negative'}>{currency(report.totals.result)}</b></article><article><small>{t('reports.avoidable')}</small><b>{currency(report.totals.avoidable)}</b></article></div>
    <section className="panel reportTable"><div className="sectionTitleRow"><h2>{t('reports.title')}</h2></div>{report.rows.map(r=><article key={r.month}><div><b>{date(r.month+'-01',{month:'long',year:'numeric'})}</b><small>{t('reports.workHours')}: {r.hours.toFixed(1)}h</small></div><span className="positive">+ {currency(r.income)}</span><span className="negative">− {currency(r.out)}</span><strong className={r.result>=0?'positive':'negative'}>{currency(r.result)}</strong></article>)}</section>
    <div className="reportColumns"><section className="panel"><div className="sectionTitleRow"><h2>{t('reports.byCategory')}</h2></div>{report.categoryRows.length===0?<p>{t('reports.noData')}</p>:<div className="analysisList">{report.categoryRows.map(c=><article key={c.kind+'-'+c.id}><span>{c.label}</span><b className={c.kind==='income'?'positive':'negative'}>{c.kind==='income'?'+ ':'− '}{currency(c.amount)}</b></article>)}</div>}</section><section className="panel"><div className="sectionTitleRow"><h2>{t('reports.bySource')}</h2></div>{report.sourceRows.length===0?<p>{t('reports.noData')}</p>:<div className="analysisList">{report.sourceRows.map(s=><article key={s.name}><div><span>{s.name}</span><small>{s.hours.toFixed(1)}h · {t('reports.workCosts')} {currency(s.cost)}</small></div><b className={s.net>=0?'positive':'negative'}>{currency(s.net)}</b></article>)}</div>}</section></div>
  </div>;
}
