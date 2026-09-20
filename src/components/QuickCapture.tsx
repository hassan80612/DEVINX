'use client';

import {useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated} from '@/lib/finance-events';
import {localDateISO} from '@/lib/date';
import {categoryOptions,CustomCategory} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

type Mode='expense'|'income';
type Request={id:number;mode:Mode};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);

export function QuickCapture({request,onNavigate}:{request?:Request;onNavigate?:(target:string)=>void}){
  const{t,locale,currencyCode}=useI18n();
  const[open,setOpen]=useState(false);const[mode,setMode]=useState<Mode>('expense');const[amount,setAmount]=useState('');const[reserveAmount,setReserveAmount]=useState('');const[description,setDescription]=useState('');const[category,setCategory]=useState('food');const[payment,setPayment]=useState('pix');const[avoidable,setAvoidable]=useState(false);const[saving,setSaving]=useState(false);const[message,setMessage]=useState('');const[custom,setCustom]=useState<CustomCategory[]>([]);const amountRef=useRef<HTMLInputElement>(null);
  const options=categoryOptions(mode,custom,t).filter(item=>item.showInQuick);
  const currencySymbol=new Intl.NumberFormat(locale,{style:'currency',currency:currencyCode}).formatToParts(0).find(part=>part.type==='currency')?.value||currencyCode;

  async function loadCategories(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{data}=await s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('is_active',true).order('created_at');setCustom((data||[]) as CustomCategory[])}
  useEffect(()=>{if(open){loadCategories();setTimeout(()=>amountRef.current?.focus(),80)}},[open]);
  useEffect(()=>{if(request&&request.id>0){changeMode(request.mode);setOpen(true)}},[request?.id]);

  function changeMode(next:Mode){setMode(next);const first=categoryOptions(next,custom,t)[0];setCategory(first?.id||'other');setDescription('');setAmount('');setReserveAmount('');setAvoidable(false);setMessage('')}
  function go(target:string){setOpen(false);onNavigate?.(target)}

  async function save(){
    const value=minor(amount);if(value<=0){setMessage(t('common.value'));return}
    const reserve=mode==='income'?minor(reserveAmount):0;
    if(reserve<0||reserve>value){setMessage(t('quick.reserveTooHigh'));return}
    setSaving(true);setMessage('');const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){setSaving(false);location.href='/entrar';return}
    let error:any=null;
    if(mode==='income'){
      ({error}=await s.rpc('record_quick_income_with_reserve',{
        p_category_id:category,
        p_description:description.trim()||null,
        p_amount_minor:value,
        p_occurred_on:localDateISO(),
        p_reserve_minor:reserve
      }));
    }else{
      ({error}=await s.from('transactions').insert({user_id:user.id,type:'expense',category_id:category,description:description.trim()||null,amount_minor:value,occurred_on:localDateISO(),payment_method:payment,is_avoidable:avoidable,is_recurring:false}));
    }
    setSaving(false);if(error){setMessage(t('common.errorSave'));return}
    setAmount('');setReserveAmount('');setDescription('');setAvoidable(false);setMessage(mode==='expense'?t('quick.savedExpense'):reserve>0?t('quick.savedIncomeReserve'):t('quick.savedIncome'));notifyFinanceUpdated();setTimeout(()=>{setOpen(false);setMessage('')},450);
  }

  return <>
    <button type="button" className="quickCaptureFab" onClick={()=>{setOpen(true);setMessage('')}} aria-label={t('quick.title')}><span>+</span><b>{t('common.add')}</b></button>
    {open&&<div className="quickCaptureBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="quickCaptureSheet" role="dialog" aria-modal="true">
      <div className="quickCaptureHead"><div><small>{t('quick.title').toUpperCase()}</small><h2>{t('quick.subtitle')}</h2></div><button type="button" onClick={()=>setOpen(false)}>×</button></div>
      <div className="quickCaptureTabs"><button type="button" className={mode==='expense'?'active':''} onClick={()=>changeMode('expense')}>{t('quick.expense')}</button><button type="button" className={mode==='income'?'active':''} onClick={()=>changeMode('income')}>{t('quick.income')}</button><button type="button" onClick={()=>go('work')}>{t('quick.journey')}</button></div>
      <div className="quickPresetGrid">{options.map(item=><button type="button" key={item.id} className={category===item.id?'selected':''} onClick={()=>{setCategory(item.id);if(!description)setDescription(item.name);amountRef.current?.focus()}}><span>{item.icon}</span><b>{item.name}</b></button>)}</div>
      <label className="quickAmountRow">{t('quick.amount')}<div className="quickMoney"><b>{currencySymbol}</b><input ref={amountRef} value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" onKeyDown={e=>{if(e.key==='Enter')save()}}/></div></label>
      <label>{t('quick.description')} <small>({t('quick.optional')})</small><input value={description} onChange={e=>setDescription(e.target.value)}/></label>
      {mode==='income'&&<label className="quickReserveField">{t('quick.reservePart')} <small>({t('quick.optional')})</small><input value={reserveAmount} onChange={e=>setReserveAmount(e.target.value)} inputMode="decimal" placeholder="0,00"/><small>{t('quick.reservePartHelp')}</small></label>}
      {mode==='expense'&&<><div className="quickPayment"><button type="button" className={payment==='pix'?'selected':''} onClick={()=>setPayment('pix')}>Pix</button><button type="button" className={payment==='cash'?'selected':''} onClick={()=>setPayment('cash')}>Cash</button><button type="button" className={payment==='debit'?'selected':''} onClick={()=>setPayment('debit')}>Debit</button></div><button type="button" className={'quickAvoidable '+(avoidable?'selected':'')} onClick={()=>setAvoidable(v=>!v)}>{avoidable?t('quick.avoidableOn'):t('quick.avoidable')}</button></>}
      {message&&<div className="authMessage">{message}</div>}<button type="button" className="quickSave" onClick={save} disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('common.save')}</button>
      {mode==='expense'&&<div className="quickCaptureRoutes"><span>{t('quick.otherCommitment')}</span><button type="button" onClick={()=>go('cards')}>{t('quick.card')}</button><button type="button" onClick={()=>go('bills')}>{t('quick.bill')}</button></div>}
    </section></div>}
  </>;
}
