'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthKey} from '@/lib/date';
import {categoryName,categoryOptions,CustomCategory} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

type Period='7'|'30'|'month'|'1'|'3'|'6'|'12'|'24'|'custom';
type Flow='all'|'income'|'expense';
type Origin='transactions'|'work'|'bills'|'cards';

type Tx={id:string;type:'income'|'expense';amount_minor:number;occurred_on:string;is_avoidable:boolean;category_id:string;description:string|null;payment_method:string|null;source_type:string|null;source_id:string|null};
type Work={id:string;vehicle_id:string|null;income_source_id:string|null;gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;worked_on:string;minutes_worked:number;distance_km:number;income_sources:{name:string;kind:string}|null;vehicles:{name:string;energy_type:string;efficiency:number|null;unit_price_minor:number|null;default_fuel_percent:number|null}|null};
type BillPay={id:string;amount_minor:number;paid_on:string;recurring_bills:{name:string;category_id:string;is_avoidable:boolean}|null};
type CardPay={id:string;card_id:string;statement_month:string;amount_minor:number;paid_on:string;credit_cards:{name:string}|null};
type Inst={amount_minor:number;billing_month:string;card_purchases:{card_id:string;category_id:string;is_avoidable:boolean}|null};
type EditableRaw=Tx|Work|BillPay|CardPay;
type ReportRow={
  id:string;
  sign:1|-1;
  amount:number;
  date:string;
  title:string;
  subtitle:string;
  kind:'income'|'expense';
  categoryId:string;
  categoryKey:string;
  categoryLabel:string;
  sourceKey:string;
  sourceLabel:string;
  origin:Origin;
  avoidable:boolean;
  rawId:string;
  raw:EditableRaw;
};

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
const dec=(raw:string)=>Number(raw.replace(',','.'))||0;
function monthKey(value:string){return value.slice(0,7)}
function daysAgo(days:number){const today=localDateISO();const d=new Date(today+'T12:00:00');d.setDate(d.getDate()-days);return localDateISO(d)}
function monthRangeStart(months:number){const today=new Date(localDateISO()+'T12:00:00');today.setDate(1);today.setMonth(today.getMonth()-(months-1));return localDateISO(today)}
function periodBounds(period:Period,from:string,to:string){
  const today=localDateISO();
  if(period==='7')return{start:daysAgo(6),end:today};
  if(period==='30')return{start:daysAgo(29),end:today};
  if(period==='month'||period==='1')return{start:localMonthKey()+'-01',end:today};
  if(period==='3')return{start:monthRangeStart(3),end:today};
  if(period==='6')return{start:monthRangeStart(6),end:today};
  if(period==='12')return{start:monthRangeStart(12),end:today};
  if(period==='24')return{start:monthRangeStart(24),end:today};
  return from<=to?{start:from,end:to}:{start:to,end:from};
}
function monthKeysBetween(start:string,end:string){
  const out:string[]=[];
  const cursor=new Date(start.slice(0,7)+'-01T12:00:00');
  const last=new Date(end.slice(0,7)+'-01T12:00:00');
  let guard=0;
  while(cursor<=last&&guard<240){out.push(localMonthKey(cursor));cursor.setMonth(cursor.getMonth()+1);guard+=1}
  return out;
}

export function ReportManager(){
  const{t,currency,date}=useI18n();
  const[period,setPeriod]=useState<Period>('6');
  const[flow,setFlow]=useState<Flow>('all');
  const[from,setFrom]=useState(daysAgo(29));
  const[to,setTo]=useState(localDateISO());
  const[categoryFilter,setCategoryFilter]=useState('all');
  const[sourceFilter,setSourceFilter]=useState('all');
  const[search,setSearch]=useState('');
  const[tx,setTx]=useState<Tx[]>([]);
  const[work,setWork]=useState<Work[]>([]);
  const[billPays,setBillPays]=useState<BillPay[]>([]);
  const[cardPays,setCardPays]=useState<CardPay[]>([]);
  const[inst,setInst]=useState<Inst[]>([]);
  const[custom,setCustom]=useState<CustomCategory[]>([]);
  const[loading,setLoading]=useState(true);
  const[notice,setNotice]=useState('');
  const[editing,setEditing]=useState<ReportRow|null>(null);
  const[editAmount,setEditAmount]=useState('');
  const[editDate,setEditDate]=useState('');
  const[editDescription,setEditDescription]=useState('');
  const[editCategory,setEditCategory]=useState('other');
  const[editHours,setEditHours]=useState('');
  const[editKm,setEditKm]=useState('');
  const[editFuelPercent,setEditFuelPercent]=useState('');
  const[editExtra,setEditExtra]=useState('');

  const bounds=useMemo(()=>periodBounds(period,from,to),[period,from,to]);

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{data}=await s.from('profiles').select('retention_months').eq('id',user.id).maybeSingle();
    const months=Number((data as any)?.retention_months);
    const preferred=(months===1||months===3||months===6||months===12||months===24?String(months):'6') as Period;
    setPeriod(preferred);
    try{localStorage.setItem('devinx_history_period',String(months||6))}catch{}
  })()},[]);

  async function load(show=true){
    if(show)setLoading(true);
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const[a,b,c,d,f]=await Promise.all([
      s.from('transactions').select('id,type,amount_minor,occurred_on,is_avoidable,category_id,description,payment_method,source_type,source_id').eq('user_id',user.id).gte('occurred_on',bounds.start).lte('occurred_on',bounds.end),
      s.from('work_sessions').select('id,vehicle_id,income_source_id,gross_income_minor,energy_cost_minor,extra_work_cost_minor,worked_on,minutes_worked,distance_km,income_sources(name,kind),vehicles(name,energy_type,efficiency,unit_price_minor,default_fuel_percent)').eq('user_id',user.id).gte('worked_on',bounds.start).lte('worked_on',bounds.end),
      s.from('recurring_bill_payments').select('id,amount_minor,paid_on,recurring_bills(name,category_id,is_avoidable)').eq('user_id',user.id).gte('paid_on',bounds.start).lte('paid_on',bounds.end),
      s.from('card_bill_payments').select('id,card_id,statement_month,amount_minor,paid_on,credit_cards(name)').eq('user_id',user.id).gte('paid_on',bounds.start).lte('paid_on',bounds.end),
      s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id)
    ]);
    const cards=(d.data||[]) as unknown as CardPay[];
    const statementMonths=[...new Set(cards.map(x=>x.statement_month).filter(Boolean))];
    let installments:Inst[]=[];
    if(statementMonths.length){
      const{data}=await s.from('card_installments').select('amount_minor,billing_month,card_purchases(card_id,category_id,is_avoidable)').in('billing_month',statementMonths);
      installments=(data||[]) as unknown as Inst[];
    }
    setTx((a.data||[]) as Tx[]);
    setWork((b.data||[]) as unknown as Work[]);
    setBillPays((c.data||[]) as unknown as BillPay[]);
    setCardPays(cards);
    setInst(installments);
    setCustom((f.data||[]) as CustomCategory[]);
    setLoading(false);
  }

  useEffect(()=>{load(true);const refresh=()=>load(false);window.addEventListener('devinx:finance-updated',refresh);return()=>window.removeEventListener('devinx:finance-updated',refresh)},[bounds.start,bounds.end]);

  const allRows=useMemo<ReportRow[]>(()=>{
    const rows:ReportRow[]=[];
    const label=(kind:'income'|'expense',id:string)=>id==='work_income'?t('move.workIncome'):id==='card_payment'?t('move.cardPayment'):categoryName(kind,id,custom,t);
    tx.forEach(x=>{
      const kind=x.type;
      const isDebt=x.source_type==='debt_payment';
      const isFuture=x.source_type==='future_plan';
      const cat=isDebt?t('move.debtPayment'):label(kind,x.category_id);
      rows.push({id:'tx:'+x.id,sign:kind==='income'?1:-1,amount:Number(x.amount_minor),date:x.occurred_on,title:x.description||t(kind==='income'?'move.directIncome':'move.directExpense'),subtitle:isFuture?t('future.historySource'):cat,kind,categoryId:x.category_id,categoryKey:kind+'|'+x.category_id,categoryLabel:cat,sourceKey:isFuture?'future':'transactions',sourceLabel:isFuture?t('future.title'):t('nav.movements'),origin:'transactions',avoidable:kind==='expense'&&x.is_avoidable,rawId:x.id,raw:x});
    });
    work.forEach(x=>{
      const source=x.income_sources?.name||t('move.workIncome');
      const sourceKey='work:'+(x.income_source_id||x.income_sources?.kind||'general');
      const sourceLabel=t('nav.work')+' · '+source;
      rows.push({id:'wi:'+x.id,sign:1,amount:Number(x.gross_income_minor),date:x.worked_on,title:source,subtitle:t('move.workIncome'),kind:'income',categoryId:'work_income',categoryKey:'income|work_income',categoryLabel:t('move.workIncome'),sourceKey,sourceLabel,origin:'work',avoidable:false,rawId:x.id,raw:x});
    });
    billPays.forEach(x=>{
      const catId=x.recurring_bills?.category_id||'other';
      const cat=label('expense',catId);
      rows.push({id:'bp:'+x.id,sign:-1,amount:Number(x.amount_minor),date:x.paid_on,title:x.recurring_bills?.name||t('move.billPayment'),subtitle:cat,kind:'expense',categoryId:catId,categoryKey:'expense|'+catId,categoryLabel:cat,sourceKey:'bills',sourceLabel:t('nav.bills'),origin:'bills',avoidable:!!x.recurring_bills?.is_avoidable,rawId:x.id,raw:x});
    });
    cardPays.forEach(x=>{
      const related=inst.filter(i=>i.billing_month===x.statement_month&&i.card_purchases?.card_id===x.card_id);
      const groups=new Map<string,{categoryId:string;avoidable:boolean;weight:number}>();
      related.forEach(i=>{
        const categoryId=i.card_purchases?.category_id||'other';
        const avoidable=!!i.card_purchases?.is_avoidable;
        const key=categoryId+'|'+(avoidable?'1':'0');
        const current=groups.get(key)||{categoryId,avoidable,weight:0};
        current.weight+=Number(i.amount_minor);
        groups.set(key,current);
      });
      const grouped=[...groups.values()];
      const payment=Number(x.amount_minor);
      const weightTotal=grouped.reduce((sum,g)=>sum+g.weight,0);
      const cardName=x.credit_cards?.name||t('move.cardPayment');
      if(!grouped.length||weightTotal<=0){
        rows.push({id:'cp:'+x.id,sign:-1,amount:payment,date:x.paid_on,title:cardName,subtitle:t('move.cardPayment'),kind:'expense',categoryId:'card_payment',categoryKey:'expense|card_payment',categoryLabel:t('move.cardPayment'),sourceKey:'cards',sourceLabel:t('nav.cards'),origin:'cards',avoidable:false,rawId:x.id,raw:x});
        return;
      }
      let used=0;
      grouped.forEach((g,index)=>{
        const amount=index===grouped.length-1?payment-used:Math.round(payment*(g.weight/weightTotal));
        used+=amount;
        const cat=label('expense',g.categoryId);
        rows.push({id:'cp:'+x.id+':'+index,sign:-1,amount,date:x.paid_on,title:cardName,subtitle:t('move.cardPayment')+' · '+cat,kind:'expense',categoryId:g.categoryId,categoryKey:'expense|'+g.categoryId,categoryLabel:cat,sourceKey:'cards',sourceLabel:t('nav.cards'),origin:'cards',avoidable:g.avoidable,rawId:x.id,raw:x});
      });
    });
    return rows.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  },[tx,work,billPays,cardPays,inst,custom,t]);

  const categories=useMemo(()=>{
    const map=new Map<string,string>();
    allRows.forEach(r=>map.set(r.categoryKey,r.categoryLabel));
    return [...map.entries()].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label));
  },[allRows]);

  const sources=useMemo(()=>{
    const map=new Map<string,string>();
    allRows.forEach(r=>map.set(r.sourceKey,r.sourceLabel));
    return [...map.entries()].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label));
  },[allRows]);

  useEffect(()=>{if(categoryFilter!=='all'&&!categories.some(c=>c.key===categoryFilter))setCategoryFilter('all')},[categories,categoryFilter]);
  useEffect(()=>{if(sourceFilter!=='all'&&!sources.some(s=>s.key===sourceFilter))setSourceFilter('all')},[sources,sourceFilter]);

  const filteredRows=useMemo(()=>{
    const needle=search.trim().toLocaleLowerCase();
    return allRows.filter(r=>{
      if(flow==='income'&&r.sign<0)return false;
      if(flow==='expense'&&r.sign>0)return false;
      if(categoryFilter!=='all'&&r.categoryKey!==categoryFilter)return false;
      if(sourceFilter!=='all'&&r.sourceKey!==sourceFilter)return false;
      if(needle&&!(r.title+' '+r.subtitle+' '+r.categoryLabel+' '+r.sourceLabel).toLocaleLowerCase().includes(needle))return false;
      return true;
    });
  },[allRows,flow,categoryFilter,sourceFilter,search]);

  const report=useMemo(()=>{
    const byMonth=new Map<string,{income:number;out:number;avoidable:number;hours:number}>();
    monthKeysBetween(bounds.start,bounds.end).forEach(month=>byMonth.set(month,{income:0,out:0,avoidable:0,hours:0}));
    filteredRows.forEach(r=>{
      const row=byMonth.get(monthKey(r.date));if(!row)return;
      if(r.sign>0)row.income+=r.amount;else row.out+=r.amount;
      if(r.avoidable)row.avoidable+=r.amount;
    });
    const visibleWorkIds=new Set(filteredRows.filter(r=>r.origin==='work').map(r=>r.rawId));
    work.forEach(w=>{if(!visibleWorkIds.has(w.id))return;const row=byMonth.get(monthKey(w.worked_on));if(row)row.hours+=Number(w.minutes_worked)/60});
    const rows=[...byMonth.entries()].map(([month,v])=>({month,...v,result:v.income-v.out}));
    const totals=rows.reduce((a,r)=>({income:a.income+r.income,out:a.out+r.out,result:a.result+r.result,avoidable:a.avoidable+r.avoidable}),{income:0,out:0,result:0,avoidable:0});
    const categoryMap=new Map<string,{kind:'income'|'expense';amount:number;label:string}>();
    filteredRows.forEach(r=>{const prev=categoryMap.get(r.categoryKey)||{kind:r.kind,amount:0,label:r.categoryLabel};prev.amount+=r.amount;categoryMap.set(r.categoryKey,prev)});
    const categoryRows=[...categoryMap.entries()].map(([key,v])=>({key,...v})).sort((a,b)=>b.amount-a.amount);
    const sourceMap=new Map<string,{gross:number;hours:number}>();
    work.forEach(w=>{
      if(!visibleWorkIds.has(w.id))return;
      const name=w.income_sources?.name||t('move.workIncome');const prev=sourceMap.get(name)||{gross:0,hours:0};
      prev.gross+=Number(w.gross_income_minor);prev.hours+=Number(w.minutes_worked)/60;sourceMap.set(name,prev);
    });
    const sourceRows=[...sourceMap.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.gross-a.gross);
    return{rows,totals,categoryRows,sourceRows};
  },[filteredRows,work,bounds.start,bounds.end,t]);

  function startEdit(row:ReportRow){
    setEditing(row);setNotice('');setEditDate(row.date);
    if(row.origin==='transactions'){
      const x=row.raw as Tx;setEditAmount(String(Number(x.amount_minor)/100).replace('.',','));setEditDescription(x.description||'');setEditCategory(x.category_id||'other');
    }else if(row.origin==='bills'){
      const x=row.raw as BillPay;setEditAmount(String(Number(x.amount_minor)/100).replace('.',','));setEditDescription(x.recurring_bills?.name||'');
    }else if(row.origin==='work'){
      const x=row.raw as Work;const transport=x.income_sources?.kind==='driver'||x.income_sources?.kind==='delivery';
      setEditAmount(String(Number(x.gross_income_minor)/100).replace('.',','));setEditDescription(x.income_sources?.name||'');setEditHours(String(Number(x.minutes_worked)/60).replace('.',','));setEditKm(transport&&Number(x.distance_km)>0?String(Number(x.distance_km)).replace('.',','):'');
      const pct=transport&&Number(x.distance_km)<=0&&Number(x.gross_income_minor)>0?Number(x.energy_cost_minor)/Number(x.gross_income_minor)*100:0;
      setEditFuelPercent(pct?String(Number(pct.toFixed(2))).replace('.',','):'');setEditExtra(String(Number(x.extra_work_cost_minor)/100).replace('.',','));
    }
  }

  async function saveEdit(e:FormEvent){
    e.preventDefault();if(!editing)return;
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    let error:any=null;
    if(editing.origin==='transactions'){
      const x=editing.raw as Tx;const value=minor(editAmount);
      if(x.source_type==='debt_payment'&&x.source_id)({error}=await s.rpc('update_debt_payment',{p_payment_id:x.source_id,p_amount_minor:value,p_paid_on:editDate,p_payment_method:x.payment_method||'pix'}));
      else({error}=await s.from('transactions').update({amount_minor:value,occurred_on:editDate,description:editDescription.trim()||null,category_id:editCategory}).eq('id',x.id).eq('user_id',user.id));
    }else if(editing.origin==='bills'){
      const x=editing.raw as BillPay;({error}=await s.from('recurring_bill_payments').update({amount_minor:minor(editAmount),paid_on:editDate,paid_at:new Date(editDate+'T12:00:00').toISOString()}).eq('id',x.id).eq('user_id',user.id));
    }else if(editing.origin==='cards'){
      const x=editing.raw as CardPay;({error}=await s.rpc('update_card_bill_payment_date',{p_payment_id:x.id,p_paid_on:editDate}));
    }else{
      const x=editing.raw as Work;const gross=minor(editAmount);const transport=x.income_sources?.kind==='driver'||x.income_sources?.kind==='delivery';const km=transport?dec(editKm):0;const pct=transport?dec(editFuelPercent):0;const vehicle=x.vehicles;
      let energy=0;
      if(transport){
        if(vehicle?.energy_type==='human')energy=0;
        else if(km>0&&Number(vehicle?.efficiency)>0&&Number(vehicle?.unit_price_minor)>0)energy=Math.round((km/Number(vehicle!.efficiency))*Number(vehicle!.unit_price_minor));
        else if(pct>0)energy=Math.round(gross*(pct/100));
        else if(Number(vehicle?.default_fuel_percent)>0)energy=Math.round(gross*(Number(vehicle!.default_fuel_percent)/100));
        else{setNotice(t('work.needCalc'));return}
      }
      ({error}=await s.from('work_sessions').update({vehicle_id:transport?x.vehicle_id:null,worked_on:editDate,gross_income_minor:gross,energy_cost_minor:energy,extra_work_cost_minor:minor(editExtra),distance_km:Number(km.toFixed(2)),minutes_worked:Math.round(dec(editHours)*60)}).eq('id',x.id).eq('user_id',user.id));
    }
    if(error){setNotice(t('common.errorSave'));return}
    setEditing(null);setNotice('');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load(false);
  }

  if(loading)return <section className="panel"><span className="loader"/></section>;

  return <div className="reportsPage">
    <p className="sectionLead">{t('reports.lead')}</p>

    <div className="historyFilters">
      <div className="historyTypeFilter">
        <button className={flow==='all'?'active':''} onClick={()=>setFlow('all')}>{t('move.allMovements')}</button>
        <button className={flow==='income'?'active incomeFilter':''} onClick={()=>setFlow('income')}>{t('move.onlyIncome')}</button>
        <button className={flow==='expense'?'active expenseFilter':''} onClick={()=>setFlow('expense')}>{t('move.onlyExpenses')}</button>
      </div>
      <div className="filterRow reportPeriods">
        <button className={period==='7'?'active':''} onClick={()=>setPeriod('7')}>{t('move.range7')}</button>
        <button className={period==='30'?'active':''} onClick={()=>setPeriod('30')}>{t('move.range30')}</button>
        <button className={period==='month'?'active':''} onClick={()=>setPeriod('month')}>{t('move.thisMonth')}</button>
        <button className={period==='1'?'active':''} onClick={()=>setPeriod('1')}>{t('reports.1m')}</button>
        <button className={period==='3'?'active':''} onClick={()=>setPeriod('3')}>{t('reports.3m')}</button>
        <button className={period==='6'?'active':''} onClick={()=>setPeriod('6')}>{t('reports.6m')}</button>
        <button className={period==='12'?'active':''} onClick={()=>setPeriod('12')}>{t('reports.12m')}</button>
        <button className={period==='24'?'active':''} onClick={()=>setPeriod('24')}>{t('reports.24m')}</button>
        <button className={period==='custom'?'active':''} onClick={()=>setPeriod('custom')}>{t('move.custom')}</button>
      </div>
      {period==='custom'&&<div className="dateRange"><label>{t('common.from')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>{t('common.to')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
      <div className="dateRange">
        <label>{t('common.category')}<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">{t('common.all')}</option>{categories.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
        <label>{t('move.source')}<select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="all">{t('common.all')}</option>{sources.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
      </div>
      <label>{t('common.search')}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('common.search')}/></label>
    </div>

    <div className="metricGrid reportMetrics"><article><small>{t('reports.income')}</small><b>{currency(report.totals.income)}</b></article><article><small>{t('reports.outflow')}</small><b>{currency(report.totals.out)}</b></article><article><small>{t('reports.result')}</small><b className={report.totals.result>=0?'positive':'negative'}>{currency(report.totals.result)}</b></article><article><small>{t('reports.avoidable')}</small><b>{currency(report.totals.avoidable)}</b></article></div>

    <section className="panel workSessionList"><div className="sectionTitleRow"><h2>{t('move.history')}</h2><small>{filteredRows.length}</small></div>{filteredRows.length===0?<p>{t('reports.noData')}</p>:<div className="ledgerList">{filteredRows.map(row=><article key={row.id} className="ledgerRow"><div className={'ledgerSign '+(row.sign>0?'plus':'minus')}>{row.sign>0?'+':'−'}</div><div className="ledgerText"><b>{row.title}</b><small>{row.categoryLabel} · {row.sourceLabel} · {date(row.date,{day:'2-digit',month:'short',year:'numeric'})}</small></div><strong className={row.sign>0?'positive':'negative'}>{row.sign>0?'+ ':'− '}{currency(row.amount)}</strong><div className="ledgerActions">{row.origin==='transactions'&&(row.raw as Tx).source_type==='future_plan'?<span className="statusBadge">{t('future.historySource')}</span>:<button onClick={()=>startEdit(row)}>{t('common.edit')}</button>}</div></article>)}</div>}</section>

    <section className="panel reportTable"><div className="sectionTitleRow"><h2>{t('reports.title')}</h2></div>{report.rows.map(r=><article key={r.month}><div><b>{date(r.month+'-01',{month:'long',year:'numeric'})}</b><small>{t('reports.workHours')}: {r.hours.toFixed(1)}h</small></div><span className="positive">+ {currency(r.income)}</span><span className="negative">− {currency(r.out)}</span><strong className={r.result>=0?'positive':'negative'}>{currency(r.result)}</strong></article>)}</section>

    <div className="reportColumns"><section className="panel"><div className="sectionTitleRow"><h2>{t('reports.byCategory')}</h2></div>{report.categoryRows.length===0?<p>{t('reports.noData')}</p>:<div className="analysisList">{report.categoryRows.map(c=><article key={c.key}><span>{c.label}</span><b className={c.kind==='income'?'positive':'negative'}>{c.kind==='income'?'+ ':'− '}{currency(c.amount)}</b></article>)}</div>}</section><section className="panel"><div className="sectionTitleRow"><h2>{t('reports.bySource')}</h2></div>{report.sourceRows.length===0?<p>{t('reports.noData')}</p>:<div className="analysisList">{report.sourceRows.map(s=><article key={s.name}><div><span>{s.name}</span><small>{s.hours.toFixed(1)}h · {t('work.gross')}</small></div><b className="positive">{currency(s.gross)}</b></article>)}</div>}</section></div>

    {notice&&<div className="authMessage">{notice}</div>}

    {editing&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><form className="modalCard" onSubmit={saveEdit}><div className="modalHead"><h2>{t('move.editCash')}</h2><button type="button" onClick={()=>setEditing(null)}>×</button></div><label>{t('common.date')}<input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} required/></label>{editing.origin==='transactions'&&(()=>{const txRow=editing.raw as Tx;return <><label>{t('common.value')}<input value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('common.description')}<input value={editDescription} onChange={e=>setEditDescription(e.target.value)}/></label>{txRow.source_type!=='debt_payment'&&<label>{t('common.category')}<select value={editCategory} onChange={e=>setEditCategory(e.target.value)}>{categoryOptions(txRow.type,custom,t).map(cat=><option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}</select></label>}</>})()}{editing.origin==='bills'&&<label>{t('common.value')}<input value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal" required/></label>}{editing.origin==='work'&&(()=>{const wx=editing.raw as Work;const transport=wx.income_sources?.kind==='driver'||wx.income_sources?.kind==='delivery';return <><label>{t('work.gross')}<input value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('work.hours')}<input value={editHours} onChange={e=>setEditHours(e.target.value)} inputMode="decimal" required/></label>{transport&&<><label>{t('work.km')} <small>({t('common.optional')})</small><input value={editKm} onChange={e=>setEditKm(e.target.value)} inputMode="decimal"/></label><label>{t('work.percent')} <small>({t('common.optional')})</small><input value={editFuelPercent} onChange={e=>setEditFuelPercent(e.target.value)} inputMode="decimal"/></label></>}<label>{t('work.extra')}<input value={editExtra} onChange={e=>setEditExtra(e.target.value)} inputMode="decimal"/></label></>})()}<div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}
  </div>;
}
