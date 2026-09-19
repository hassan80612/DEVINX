'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO,localMonthStartISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';
import {categoryName,CustomCategory} from '@/domain/categories';
import {RecurringBillLike,RecurringOverrideLike,billAppliesToMonth,billDueDay,billRemaining,dueDateForMonth,installmentNumber} from '@/domain/recurring';

type View='today'|'history'|'pending';
type Tx={id:string;type:'income'|'expense';category_id:string;description:string|null;amount_minor:number;occurred_on:string;payment_method:string|null;is_avoidable:boolean;source_type:string|null;source_id:string|null};
type Work={id:string;vehicle_id:string|null;income_source_id:string|null;worked_on:string;gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;distance_km:number;minutes_worked:number;income_sources:{name:string;kind:string}|null;vehicles:{name:string;energy_type:string;efficiency:number|null;unit_price_minor:number|null;default_fuel_percent:number|null}|null};
type RecPay={id:string;recurring_bill_id:string;amount_minor:number;paid_on:string;due_month:string;recurring_bills:{name:string;category_id:string;payment_method:string|null}|null};
type CardPay={id:string;card_id:string;statement_month:string;amount_minor:number;paid_on:string;credit_cards:{name:string}|null};
type Bill=RecurringBillLike&{name:string;created_at:string;category_id:string;payment_method:string|null;is_avoidable:boolean};
type BillOverride=RecurringOverrideLike;
type Purchase={id:string;card_id:string;category_id:string;description:string|null;total_minor:number;purchased_on:string;installment_count:number;is_avoidable:boolean;credit_cards:{name:string;due_day:number|null}|null;card_installments:{id:string;installment_number:number;amount_minor:number;billing_month:string;due_date:string|null;paid_at:string|null}[]};
type Debt={id:string;name:string;outstanding_minor:number;installment_minor:number|null;installments_remaining:number|null;due_day:number|null;created_at:string};
type DebtPay={debt_id:string;amount_minor:number;paid_on:string};
type ReserveEntry={id:string;kind:'deposit'|'withdraw';amount_minor:number;occurred_on:string;note:string|null};
type CashRow={id:string;kind:'tx'|'work-income'|'work-cost'|'bill-payment'|'card-payment'|'reserve-transfer';sign:1|-1;amount:number;date:string;title:string;subtitle:string;groupKey:string;groupLabel:string;raw:Tx|Work|RecPay|CardPay|ReserveEntry};

const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
const dec=(raw:string)=>Number(raw.replace(',','.'))||0;
function monthKey(date:string){return date.slice(0,7)}
function monthStart(date:string){return date.slice(0,7)+'-01'}
function addMonths(iso:string,count:number){const d=new Date(iso+'T12:00:00');d.setMonth(d.getMonth()+count);return localDateISO(new Date(d.getFullYear(),d.getMonth(),1))}
function daysAgo(days:number){const d=new Date();d.setDate(d.getDate()-days);return localDateISO(d)}
function cardDueDate(month:string,dueDay:number|null){
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  const max=new Date(y,m,0).getDate();
  const day=Math.min(Math.max(Number(dueDay||1),1),max);
  return month.slice(0,8)+String(day).padStart(2,'0');
}

export function MovementCenter({onNavigate}:{onNavigate?:(target:string)=>void}){
  const{t,currency,date}=useI18n();
  const[view,setView]=useState<View>('today');
  const[range,setRange]=useState<'7'|'30'|'month'|'custom'>('7');
  const[from,setFrom]=useState(daysAgo(6));
  const[to,setTo]=useState(localDateISO());
  const[tx,setTx]=useState<Tx[]>([]);
  const[work,setWork]=useState<Work[]>([]);
  const[recPays,setRecPays]=useState<RecPay[]>([]);
  const[cardPays,setCardPays]=useState<CardPay[]>([]);
  const[bills,setBills]=useState<Bill[]>([]);
  const[purchases,setPurchases]=useState<Purchase[]>([]);
  const[debts,setDebts]=useState<Debt[]>([]);
  const[debtPays,setDebtPays]=useState<DebtPay[]>([]);
  const[billOverrides,setBillOverrides]=useState<BillOverride[]>([]);
  const[customCategories,setCustomCategories]=useState<CustomCategory[]>([]);
  const[reserveEntries,setReserveEntries]=useState<ReserveEntry[]>([]);
  const[loading,setLoading]=useState(true);
  const[notice,setNotice]=useState('');
  const[editing,setEditing]=useState<CashRow|null>(null);
  const[editAmount,setEditAmount]=useState('');
  const[editDate,setEditDate]=useState('');
  const[editDescription,setEditDescription]=useState('');
  const[editHours,setEditHours]=useState('');
  const[editKm,setEditKm]=useState('');
  const[editFuelPercent,setEditFuelPercent]=useState('');
  const[editExtra,setEditExtra]=useState('');
  const[purchaseEdit,setPurchaseEdit]=useState<Purchase|null>(null);
  const[purchaseDesc,setPurchaseDesc]=useState('');
  const[purchaseTotal,setPurchaseTotal]=useState('');
  const[purchaseCount,setPurchaseCount]=useState('1');
  const[purchaseDate,setPurchaseDate]=useState('');
  const[purchaseFirstDueDate,setPurchaseFirstDueDate]=useState('');
  const[purchaseCategory,setPurchaseCategory]=useState('other');

  function historyBounds(){
    if(range==='7')return{start:daysAgo(6),end:localDateISO()};
    if(range==='30')return{start:daysAgo(29),end:localDateISO()};
    if(range==='month')return{start:localMonthStartISO(),end:localDateISO()};
    return{start:from,end:to};
  }

  async function load(show=true){
    if(show)setLoading(true);
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const history=historyBounds();
    const start=view==='today'?localDateISO():history.start;
    const end=view==='today'?localDateISO():history.end;
    const categoriesCall=s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id);
    const cashCalls=view==='pending'?[]:[
      s.from('transactions').select('id,type,category_id,description,amount_minor,occurred_on,payment_method,is_avoidable,source_type,source_id').eq('user_id',user.id).gte('occurred_on',start).lte('occurred_on',end).order('occurred_on',{ascending:false}).order('created_at',{ascending:false}),
      s.from('work_sessions').select('id,vehicle_id,income_source_id,worked_on,gross_income_minor,energy_cost_minor,extra_work_cost_minor,distance_km,minutes_worked,income_sources(name,kind),vehicles(name,energy_type,efficiency,unit_price_minor,default_fuel_percent)').eq('user_id',user.id).gte('worked_on',start).lte('worked_on',end).order('worked_on',{ascending:false}),
      s.from('recurring_bill_payments').select('id,recurring_bill_id,amount_minor,paid_on,due_month,recurring_bills(name,category_id,payment_method)').eq('user_id',user.id).gte('paid_on',start).lte('paid_on',end).order('paid_on',{ascending:false}),
      s.from('card_bill_payments').select('id,card_id,statement_month,amount_minor,paid_on,credit_cards(name)').eq('user_id',user.id).gte('paid_on',start).lte('paid_on',end).order('paid_on',{ascending:false}),
      s.from('reserve_entries').select('id,kind,amount_minor,occurred_on,note').eq('user_id',user.id).gte('occurred_on',start).lte('occurred_on',end).order('occurred_on',{ascending:false}).order('created_at',{ascending:false})
    ];

    if(view!=='pending'){
      const[r1,r2,r3,r4,r5,cats]=await Promise.all([...(cashCalls as any),categoriesCall] as any);
      setTx((r1?.data||[]) as Tx[]);setWork((r2?.data||[]) as unknown as Work[]);setRecPays((r3?.data||[]) as unknown as RecPay[]);setCardPays((r4?.data||[]) as unknown as CardPay[]);setReserveEntries((r5?.data||[]) as ReserveEntry[]);setCustomCategories((cats?.data||[]) as CustomCategory[]);
    }else{
      const current=localMonthStartISO();
      const oldest=addMonths(current,-12);
      const[r1,r2,r3,r4,r5,cats]=await Promise.all([
        s.from('recurring_bills').select('id,name,amount_minor,due_day,start_month,installment_count,created_at,category_id,payment_method,is_avoidable').eq('user_id',user.id).eq('is_active',true).order('due_day'),
        s.from('recurring_bill_payments').select('id,recurring_bill_id,amount_minor,paid_on,due_month,recurring_bills(name,category_id,payment_method)').eq('user_id',user.id).gte('due_month',oldest),
        s.from('recurring_bill_month_overrides').select('recurring_bill_id,due_month,amount_minor,due_day').eq('user_id',user.id).gte('due_month',oldest),
        s.from('card_purchases').select('id,card_id,category_id,description,total_minor,purchased_on,installment_count,is_avoidable,credit_cards(name,due_day),card_installments(id,installment_number,amount_minor,billing_month,due_date,paid_at)').eq('user_id',user.id).order('purchased_on',{ascending:false}),
        s.from('debts').select('id,name,outstanding_minor,installment_minor,installments_remaining,due_day,created_at').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false}),
        categoriesCall
      ]);
      const{data:dp}=await s.from('debt_payments').select('debt_id,amount_minor,paid_on').eq('user_id',user.id).gte('paid_on',current);
      setBills((r1.data||[]) as Bill[]);setRecPays((r2.data||[]) as unknown as RecPay[]);setBillOverrides((r3.data||[]) as BillOverride[]);setPurchases((r4.data||[]) as unknown as Purchase[]);setDebts((r5.data||[]) as Debt[]);setDebtPays((dp||[]) as DebtPay[]);setCustomCategories((cats.data||[]) as CustomCategory[]);
    }
    setLoading(false);
  }

  useEffect(()=>{load(true);const refresh=()=>load(false);window.addEventListener('devinx:finance-updated',refresh);return()=>window.removeEventListener('devinx:finance-updated',refresh)},[view,range,from,to]);

  const cashRows=useMemo<CashRow[]>(()=>{
    const rows:CashRow[]=[];
    tx.forEach(item=>{
      const isDebt=item.source_type==='debt_payment';
      const kind=item.type==='income'?'income':'expense';
      const label=isDebt?t('nav.debts'):categoryName(kind,item.category_id,customCategories,t);
      rows.push({id:'tx:'+item.id,kind:'tx',sign:item.type==='income'?1:-1,amount:Number(item.amount_minor),date:item.occurred_on,title:item.description||t(item.type==='income'?'move.directIncome':'move.directExpense'),subtitle:isDebt?t('move.debtPayment'):t(item.type==='income'?'move.directIncome':'move.directExpense'),groupKey:isDebt?'system:debts':kind+':'+item.category_id,groupLabel:label,raw:item});
    });
    work.forEach(item=>{
      const source=item.income_sources?.name||t('move.workIncome');
      const key='work:'+(item.income_source_id||item.income_sources?.kind||'general');
      rows.push({id:'wi:'+item.id,kind:'work-income',sign:1,amount:Number(item.gross_income_minor),date:item.worked_on,title:source,subtitle:t('move.workIncome'),groupKey:key,groupLabel:t('nav.work')+' · '+source,raw:item});
      const cost=Number(item.energy_cost_minor)+Number(item.extra_work_cost_minor);
      if(cost>0)rows.push({id:'wc:'+item.id,kind:'work-cost',sign:-1,amount:cost,date:item.worked_on,title:source,subtitle:t('move.workCost'),groupKey:key,groupLabel:t('nav.work')+' · '+source,raw:item});
    });
    recPays.forEach(item=>{
      const cat=item.recurring_bills?.category_id||'other';
      rows.push({id:'rp:'+item.id,kind:'bill-payment',sign:-1,amount:Number(item.amount_minor),date:item.paid_on,title:item.recurring_bills?.name||t('move.billPayment'),subtitle:t('move.billPayment'),groupKey:'expense:'+cat,groupLabel:categoryName('expense',cat,customCategories,t),raw:item});
    });
    cardPays.forEach(item=>rows.push({id:'cp:'+item.id,kind:'card-payment',sign:-1,amount:Number(item.amount_minor),date:item.paid_on,title:item.credit_cards?.name||t('move.cardPayment'),subtitle:t('move.cardPayment')+' · '+date(item.statement_month,{month:'long',year:'numeric'}),groupKey:'system:cards',groupLabel:t('nav.cards'),raw:item}));
    reserveEntries.forEach(item=>rows.push({
      id:'rs:'+item.id,
      kind:'reserve-transfer',
      sign:item.kind==='deposit'?-1:1,
      amount:Number(item.amount_minor),
      date:item.occurred_on,
      title:item.kind==='deposit'?t('reserves.transferIn'):t('reserves.transferOut'),
      subtitle:(item.note?item.note+' · ':'')+t('reserves.internalTransfer'),
      groupKey:'system:reserves',
      groupLabel:t('nav.reserves'),
      raw:item
    }));
    return rows.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  },[tx,work,recPays,cardPays,reserveEntries,customCategories,t,date]);

  const totals=useMemo(()=>{const plus=cashRows.filter(r=>r.sign===1).reduce((a,b)=>a+b.amount,0);const minus=cashRows.filter(r=>r.sign===-1).reduce((a,b)=>a+b.amount,0);return{plus,minus,balance:plus-minus}},[cashRows]);

  const historyGroups=useMemo(()=>{
    const map=new Map<string,{key:string;label:string;rows:CashRow[];plus:number;minus:number}>();
    for(const row of cashRows){
      const current=map.get(row.groupKey)||{key:row.groupKey,label:row.groupLabel,rows:[],plus:0,minus:0};
      current.rows.push(row);
      if(row.sign>0)current.plus+=row.amount;else current.minus+=row.amount;
      map.set(row.groupKey,current);
    }
    return [...map.values()].sort((a,b)=>(b.plus+b.minus)-(a.plus+a.minus)||a.label.localeCompare(b.label));
  },[cashRows]);

  const billPending=useMemo(()=>{
    const today=localDateISO();
    const current=currentMonth();
    const rows:{key:string;bill:Bill;month:string;dueDate:string;remaining:number;overdue:boolean;installment:number|null}[]=[];
    for(const bill of bills){
      const oldest=addMonths(current,-12);
      let cursor=bill.start_month<oldest?oldest:bill.start_month;
      const maxMonths=bill.installment_count==null?36:Math.min(600,Math.max(1,bill.installment_count));
      let checked=0;
      while(checked<maxMonths){
        if(billAppliesToMonth(bill,cursor)){
          const remaining=billRemaining(bill,cursor,recPays,billOverrides);
          if(remaining>0){
            const dueDate=dueDateForMonth(cursor,billDueDay(bill,cursor,billOverrides));
            rows.push({
              key:bill.id+'|'+cursor.slice(0,7),
              bill,
              month:cursor,
              dueDate,
              remaining,
              overdue:dueDate<today,
              installment:installmentNumber(bill,cursor)
            });
            break;
          }
        }else if(bill.installment_count!=null&&cursor>addMonths(bill.start_month,bill.installment_count-1)){
          break;
        }
        cursor=addMonths(cursor,1);
        checked+=1;
      }
    }
    return rows.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.bill.name.localeCompare(b.bill.name));
  },[bills,recPays,billOverrides]);

  function currentMonth(){return localMonthStartISO()}

  const purchasePending=useMemo(()=>{
    const current=currentMonth();
    const today=localDateISO();
    return purchases.flatMap(p=>(p.card_installments||[])
      .filter(i=>!i.paid_at)
      .map(i=>{
        const dueDate=i.due_date||cardDueDate(i.billing_month,p.credit_cards?.due_day??null);
        const dueMonth=dueDate.slice(0,7)+'-01';
        const status=dueDate<today?'overdue':dueMonth>current?'future':'current';
        return{purchase:p,installment:i,status,dueDate};
      }))
      .sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.purchase.purchased_on.localeCompare(b.purchase.purchased_on));
  },[purchases]);

  const debtPending=useMemo(()=>debts.map(d=>{
    const paid=debtPays.filter(p=>p.debt_id===d.id).reduce((a,b)=>a+Number(b.amount_minor),0);
    const due=Math.min(Number(d.installment_minor||d.outstanding_minor),Number(d.outstanding_minor));
    const remaining=Math.max(0,due-paid);
    const overdue=!!d.due_day&&d.due_day<new Date().getDate()&&remaining>0;
    return{debt:d,remaining,overdue};
  }).filter(x=>x.remaining>0),[debts,debtPays]);

  function startEdit(row:CashRow){
    setEditing(row);setNotice('');
    setEditDate(row.date);
    if(row.kind==='tx'){const x=row.raw as Tx;setEditAmount(String(Number(x.amount_minor)/100).replace('.',','));setEditDescription(x.description||'')}
    if(row.kind==='bill-payment'){const x=row.raw as RecPay;setEditAmount(String(Number(x.amount_minor)/100).replace('.',','));setEditDescription(x.recurring_bills?.name||'')}
    if(row.kind==='card-payment'){const x=row.raw as CardPay;setEditAmount(String(Number(x.amount_minor)/100).replace('.',','));setEditDescription(x.credit_cards?.name||'')}
    if(row.kind==='work-income'||row.kind==='work-cost'){
      const x=row.raw as Work;const transport=x.income_sources?.kind==='driver'||x.income_sources?.kind==='delivery';
      setEditAmount(String(Number(x.gross_income_minor)/100).replace('.',','));setEditDescription(x.income_sources?.name||'');
      setEditHours(String(Number(x.minutes_worked)/60).replace('.',','));setEditKm(transport&&Number(x.distance_km)>0?String(Number(x.distance_km)).replace('.',','):'');
      const pct=transport&&Number(x.distance_km)<=0&&Number(x.gross_income_minor)>0?Number(x.energy_cost_minor)/Number(x.gross_income_minor)*100:0;
      setEditFuelPercent(pct?String(Number(pct.toFixed(2))).replace('.',','):'');setEditExtra(String(Number(x.extra_work_cost_minor)/100).replace('.',','));
    }
  }

  async function saveEdit(e:FormEvent){
    e.preventDefault();if(!editing)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    let error:any=null;
    if(editing.kind==='tx'){
      const x=editing.raw as Tx;const value=minor(editAmount);
      if(x.source_type==='debt_payment'&&x.source_id){({error}=await s.rpc('update_debt_payment',{p_payment_id:x.source_id,p_amount_minor:value,p_paid_on:editDate,p_payment_method:x.payment_method||'pix'}))}
      else({error}=await s.from('transactions').update({amount_minor:value,occurred_on:editDate,description:editDescription.trim()||null}).eq('id',x.id).eq('user_id',user.id));
    }else if(editing.kind==='bill-payment'){
      const x=editing.raw as RecPay;({error}=await s.from('recurring_bill_payments').update({amount_minor:minor(editAmount),paid_on:editDate,paid_at:new Date(editDate+'T12:00:00').toISOString()}).eq('id',x.id).eq('user_id',user.id));
    }else if(editing.kind==='card-payment'){
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

  async function removeRow(row:CashRow){
    if(!confirm(t('move.deleteConfirm')))return;
    const s=createClient();let error:any=null;
    if(row.kind==='tx'){
      const x=row.raw as Tx;
      if(x.source_type==='debt_payment'&&x.source_id)({error}=await s.rpc('delete_debt_payment',{p_payment_id:x.source_id}));
      else({error}=await s.from('transactions').delete().eq('id',x.id));
    }else if(row.kind==='bill-payment'){
      const x=row.raw as RecPay;({error}=await s.from('recurring_bill_payments').delete().eq('id',x.id));
    }else if(row.kind==='card-payment'){
      if(!confirm(t('move.reopenConfirm')))return;const x=row.raw as CardPay;({error}=await s.rpc('reopen_card_bill',{p_payment_id:x.id}));
    }else{
      const x=row.raw as Work;({error}=await s.from('work_sessions').delete().eq('id',x.id));
    }
    if(error){setNotice(t('common.errorDelete'));return}
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load(false);
  }

  function startPurchaseEdit(p:Purchase){const first=[...(p.card_installments||[])].sort((a,b)=>a.installment_number-b.installment_number)[0];setPurchaseEdit(p);setPurchaseDesc(p.description||'');setPurchaseTotal(String(Number(p.total_minor)/100).replace('.',','));setPurchaseCount(String(p.installment_count));setPurchaseDate(p.purchased_on);setPurchaseFirstDueDate(first?.due_date||'');setPurchaseCategory(p.category_id)}
  async function savePurchase(e:FormEvent){
    e.preventDefault();if(!purchaseEdit)return;const s=createClient();const{error}=await s.rpc('update_card_purchase_v2',{p_purchase_id:purchaseEdit.id,p_category_id:purchaseCategory,p_description:purchaseDesc,p_total_minor:minor(purchaseTotal),p_purchased_on:purchaseDate,p_installment_count:Number(purchaseCount),p_is_avoidable:purchaseEdit.is_avoidable,p_first_due_date:purchaseFirstDueDate||null});
    if(error){setNotice(t('move.paidPurchaseLocked'));return}
    setPurchaseEdit(null);window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load(false);
  }
  async function deletePurchase(p:Purchase){
    if(!confirm(t('move.purchaseDeleteConfirm')))return;const s=createClient();const{error}=await s.rpc('delete_card_purchase',{p_purchase_id:p.id});
    if(error){setNotice(t('move.paidPurchaseLocked'));return}
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load(false);
  }

  return <div className="movementCenter">
    <p className="sectionLead">{t('move.lead')}</p>
    <div className="movementTabs"><button className={view==='today'?'active':''} onClick={()=>setView('today')}>{t('move.today')}</button><button className={view==='history'?'active':''} onClick={()=>setView('history')}>{t('move.history')}</button><button className={view==='pending'?'active':''} onClick={()=>setView('pending')}>{t('move.pending')}</button></div>

    {view==='history'&&<div className="historyFilters"><div className="filterRow"><button className={range==='7'?'active':''} onClick={()=>setRange('7')}>{t('move.range7')}</button><button className={range==='30'?'active':''} onClick={()=>setRange('30')}>{t('move.range30')}</button><button className={range==='month'?'active':''} onClick={()=>setRange('month')}>{t('move.thisMonth')}</button><button className={range==='custom'?'active':''} onClick={()=>setRange('custom')}>{t('move.custom')}</button></div>{range==='custom'&&<div className="dateRange"><label>{t('common.from')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>{t('common.to')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}</div>}

    {view!=='pending'&&<>
      <section className="cashSummary"><article><small>{t('move.entered')}</small><strong className="positive">+ {currency(totals.plus)}</strong></article><article><small>{t('move.outflow')}</small><strong className="negative">− {currency(totals.minus)}</strong></article><article className="cashBalance"><small>{t('move.balance')}</small><strong className={totals.balance>=0?'positive':'negative'}>{currency(totals.balance)}</strong></article><p>{t('move.actualCash')}</p></section>
      {loading?<section className="panel"><span className="loader"/></section>:cashRows.length===0?<section className="empty"><b>{view==='today'?t('move.noToday'):t('move.noHistory')}</b></section>:view==='history'?<div className="historyCategoryStack">{historyGroups.map(group=><section className="panel historyCategoryGroup" key={group.key}><div className="historyCategoryHeader"><div><small>{t('common.category').toUpperCase()}</small><h2>{group.label}</h2></div><div className="historyCategoryTotals">{group.plus>0&&<span className="positive">+ {currency(group.plus)}</span>}{group.minus>0&&<span className="negative">− {currency(group.minus)}</span>}<b className={group.plus-group.minus>=0?'positive':'negative'}>{currency(group.plus-group.minus)}</b></div></div><div className="ledgerList">{group.rows.map(row=><article key={row.id} className="ledgerRow"><div className={'ledgerSign '+(row.sign>0?'plus':'minus')}>{row.sign>0?'+':'−'}</div><div className="ledgerText"><b>{row.title}</b><small>{row.subtitle} · {date(row.date,{day:'2-digit',month:'short',year:'numeric'})}</small></div><strong className={row.sign>0?'positive':'negative'}>{row.sign>0?'+ ':'− '}{currency(row.amount)}</strong><div className="ledgerActions">{row.kind==='reserve-transfer'?<button onClick={()=>onNavigate?.('reserves')}>{t('move.openModule')}</button>:<><button onClick={()=>startEdit(row)}>{t('common.edit')}</button><button className="dangerText" onClick={()=>removeRow(row)}>{row.kind==='card-payment'?t('move.reopen'):t('common.delete')}</button></>}</div></article>)}</div></section>)}</div>:<section className="ledgerList">{cashRows.map(row=><article key={row.id} className="ledgerRow"><div className={'ledgerSign '+(row.sign>0?'plus':'minus')}>{row.sign>0?'+':'−'}</div><div className="ledgerText"><b>{row.title}</b><small>{row.subtitle} · {date(row.date,{day:'2-digit',month:'short',year:'numeric'})}</small></div><strong className={row.sign>0?'positive':'negative'}>{row.sign>0?'+ ':'− '}{currency(row.amount)}</strong><div className="ledgerActions">{row.kind==='reserve-transfer'?<button onClick={()=>onNavigate?.('reserves')}>{t('move.openModule')}</button>:<><button onClick={()=>startEdit(row)}>{t('common.edit')}</button><button className="dangerText" onClick={()=>removeRow(row)}>{row.kind==='card-payment'?t('move.reopen'):t('common.delete')}</button></>}</div></article>)}</section>}
    </>}

    {view==='pending'&&<>
      {loading?<section className="panel"><span className="loader"/></section>:billPending.length+purchasePending.length+debtPending.length===0?<section className="empty"><b>{t('move.noPending')}</b></section>:<div className="pendingStack">
        {billPending.length>0&&<section className="panel pendingGroup"><div className="sectionTitleRow"><div><small>{t('nav.bills').toUpperCase()}</small><h2>{t('nav.bills')}</h2></div></div>{billPending.map(item=><article className="pendingRow" key={item.key}><div><b>{item.bill.name}</b><small>{item.bill.installment_count&&item.installment?t('bills.installment')+' '+item.installment+'/'+item.bill.installment_count+' · ':''}{t('move.dueOn')} {date(item.dueDate,{day:'2-digit',month:'2-digit',year:'numeric'})}</small></div><strong>{currency(item.remaining)}</strong><span className={item.overdue?'statusBadge overdue':'statusBadge'}>{item.overdue?t('common.overdue'):item.month>currentMonth()?t('move.future'):t('common.pending')}</span><button onClick={()=>onNavigate?.('bills')}>{t('move.openModule')}</button></article>)}</section>}
        {purchasePending.length>0&&<section className="panel pendingGroup"><div className="sectionTitleRow"><div><small>{t('nav.cards').toUpperCase()}</small><h2>{t('cards.totalOpen')}</h2></div></div>{purchasePending.map(item=><article className="pendingRow purchasePending" key={item.installment.id}><div><b>{item.purchase.description||item.purchase.credit_cards?.name||t('move.cardCommitment')}</b><small>{item.purchase.credit_cards?.name} · {item.installment.installment_number}/{item.purchase.installment_count} · {t('move.dueOn')} {date(item.dueDate,{day:'2-digit',month:'2-digit',year:'numeric'})}</small></div><strong>{currency(Number(item.installment.amount_minor))}</strong><span className={item.status==='overdue'?'statusBadge overdue':'statusBadge'}>{item.status==='overdue'?t('common.overdue'):item.status==='current'?t('move.current'):t('move.future')}</span><div className="pendingActions"><button onClick={()=>startPurchaseEdit(item.purchase)}>{t('common.edit')}</button><button className="dangerText" onClick={()=>deletePurchase(item.purchase)}>{t('common.delete')}</button></div></article>)}</section>}
        {debtPending.length>0&&<section className="panel pendingGroup"><div className="sectionTitleRow"><div><small>{t('nav.debts').toUpperCase()}</small><h2>{t('nav.debts')}</h2></div></div>{debtPending.map(item=><article className="pendingRow" key={item.debt.id}><div><b>{item.debt.name}</b><small>{item.debt.due_day?t('move.due')+' '+item.debt.due_day:''}</small></div><strong>{currency(item.remaining)}</strong><span className={item.overdue?'statusBadge overdue':'statusBadge'}>{item.overdue?t('common.overdue'):t('common.pending')}</span><button onClick={()=>onNavigate?.('debts')}>{t('move.openModule')}</button></article>)}</section>}
      </div>}
    </>}

    {notice&&<div className="authMessage">{notice}</div>}

    {editing&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><form className="modalCard" onSubmit={saveEdit}><div className="modalHead"><h2>{t('move.editCash')}</h2><button type="button" onClick={()=>setEditing(null)}>×</button></div><label>{t('common.date')}<input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} required/></label>{editing.kind==='tx'&&<><label>{t('common.value')}<input value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('common.description')}<input value={editDescription} onChange={e=>setEditDescription(e.target.value)}/></label></>}{editing.kind==='bill-payment'&&<label>{t('common.value')}<input value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal" required/></label>}{(editing.kind==='work-income'||editing.kind==='work-cost')&&(()=>{const wx=editing.raw as Work;const transport=wx.income_sources?.kind==='driver'||wx.income_sources?.kind==='delivery';return <><label>{t('work.gross')}<input value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal" required/></label><label>{t('work.hours')}<input value={editHours} onChange={e=>setEditHours(e.target.value)} inputMode="decimal" required/></label>{transport&&<><label>{t('work.km')} <small>({t('common.optional')})</small><input value={editKm} onChange={e=>setEditKm(e.target.value)} inputMode="decimal"/></label><label>{t('work.percent')} <small>({t('common.optional')})</small><input value={editFuelPercent} onChange={e=>setEditFuelPercent(e.target.value)} inputMode="decimal"/></label></>}<label>{t('work.extra')}<input value={editExtra} onChange={e=>setEditExtra(e.target.value)} inputMode="decimal"/></label></>})()}<div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}

    {purchaseEdit&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPurchaseEdit(null)}}><form className="modalCard" onSubmit={savePurchase}><div className="modalHead"><h2>{t('common.edit')} · {t('move.cardCommitment')}</h2><button type="button" onClick={()=>setPurchaseEdit(null)}>×</button></div><label>{t('common.description')}<input value={purchaseDesc} onChange={e=>setPurchaseDesc(e.target.value)}/></label><label>{t('cards.total')}<input value={purchaseTotal} onChange={e=>setPurchaseTotal(e.target.value)} inputMode="decimal" required/></label><label>{t('cards.installments')}<input type="number" min="1" max="60" value={purchaseCount} onChange={e=>setPurchaseCount(e.target.value)} required/></label><label>{t('cards.purchaseDate')}<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} required/></label><label>{t('cards.firstDueDate')} <small>({t('common.optional')})</small><input type="date" value={purchaseFirstDueDate} onChange={e=>setPurchaseFirstDueDate(e.target.value)}/><small>{t('cards.firstDueDateHelp')}</small></label><label>{t('common.category')}<input value={purchaseCategory} onChange={e=>setPurchaseCategory(e.target.value)} /></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setPurchaseEdit(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}
  </div>;
}
