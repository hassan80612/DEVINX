'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO} from '@/lib/date';

type Mode='expense'|'income';
type Preset={label:string;category:string;description:string;icon:string};

const expensePresets:Preset[]=[
  {label:'Almoço',category:'food',description:'Almoço',icon:'🍽️'},
  {label:'Mercado',category:'food',description:'Mercado',icon:'🛒'},
  {label:'Café / lanche',category:'food',description:'Café / lanche',icon:'☕'},
  {label:'Saúde',category:'health',description:'Saúde',icon:'✚'},
  {label:'Lazer',category:'leisure',description:'Lazer',icon:'◉'},
  {label:'Outro',category:'other',description:'',icon:'+'},
];

const incomePresets:Preset[]=[
  {label:'Salário',category:'salary',description:'Salário',icon:'▣'},
  {label:'Comissão',category:'commission',description:'Comissão',icon:'%'},
  {label:'Hora extra',category:'overtime',description:'Hora extra',icon:'◷'},
  {label:'Bônus',category:'bonus',description:'Bônus',icon:'★'},
  {label:'Renda extra',category:'extra',description:'Renda extra',icon:'+'},
  {label:'Outro',category:'other',description:'',icon:'…'},
];

function toMinor(raw:string){
  const normalized=raw.replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'');
  return Math.round((Number(normalized)||0)*100);
}

export function QuickCapture(){
  const[open,setOpen]=useState(false);
  const[mode,setMode]=useState<Mode>('expense');
  const[category,setCategory]=useState('food');
  const[description,setDescription]=useState('Almoço');
  const[amount,setAmount]=useState('');
  const[payment,setPayment]=useState('pix');
  const[avoidable,setAvoidable]=useState(false);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState('');
  const amountRef=useRef<HTMLInputElement>(null);

  const presets=mode==='expense'?expensePresets:incomePresets;

  useEffect(()=>{if(open)setTimeout(()=>amountRef.current?.focus(),80)},[open]);

  function selectPreset(preset:Preset){setCategory(preset.category);setDescription(preset.description);setTimeout(()=>amountRef.current?.focus(),20)}
  function changeMode(next:Mode){setMode(next);const first=next==='expense'?expensePresets[0]:incomePresets[0];setCategory(first.category);setDescription(first.description);setAmount('');setAvoidable(false);setMessage('')}

  async function save(){
    const value=toMinor(amount);
    if(value<=0){setMessage('Informe o valor.');amountRef.current?.focus();return}
    setSaving(true);setMessage('');
    const supabase=createClient();
    const{data:{user}}=await supabase.auth.getUser();
    if(!user){setSaving(false);location.href='/entrar';return}
    const{error}=await supabase.from('transactions').insert({user_id:user.id,type:mode,category_id:category,description:description.trim()||null,amount_minor:value,occurred_on:localDateISO(),payment_method:mode==='expense'?payment:null,is_avoidable:mode==='expense'?avoidable:false,is_recurring:false});
    setSaving(false);
    if(error){setMessage('Não foi possível salvar agora.');return}
    setAmount('');setAvoidable(false);setMessage(mode==='expense'?'Gasto salvo.':'Entrada salva.');
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));
    setTimeout(()=>{setOpen(false);setMessage('')},550);
  }

  return <>
    <button type="button" className="quickCaptureFab" onClick={()=>{setOpen(true);setMessage('')}} aria-label="Registro rápido"><span>+</span><b>Rápido</b></button>
    {open&&<div className="quickCaptureBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <section className="quickCaptureSheet" role="dialog" aria-modal="true" aria-label="Registro rápido">
        <div className="quickCaptureHandle"/>
        <div className="quickCaptureHead"><div><small>REGISTRO RÁPIDO</small><h2>Fez agora? Salve agora.</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Fechar">×</button></div>
        <div className="quickCaptureTabs"><button type="button" className={mode==='expense'?'active':''} onClick={()=>changeMode('expense')}>Gasto</button><button type="button" className={mode==='income'?'active':''} onClick={()=>changeMode('income')}>Entrada</button><Link href="/trabalho" onClick={()=>setOpen(false)}>Jornada</Link></div>
        <div className="quickPresetGrid">{presets.map(preset=><button type="button" key={preset.label} className={category===preset.category&&description===preset.description?'selected':''} onClick={()=>selectPreset(preset)}><span>{preset.icon}</span><b>{preset.label}</b></button>)}</div>
        <div className="quickAmountRow"><label><span>Valor</span><div className="quickMoney"><b>R$</b><input ref={amountRef} value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" onKeyDown={e=>{if(e.key==='Enter')save()}}/></div></label></div>
        <label className="quickDescription"><span>Descrição <em>opcional</em></span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: almoço com cliente"/></label>
        {mode==='expense'&&<><div className="quickPayment"><button type="button" className={payment==='pix'?'selected':''} onClick={()=>setPayment('pix')}>Pix</button><button type="button" className={payment==='cash'?'selected':''} onClick={()=>setPayment('cash')}>Dinheiro</button><button type="button" className={payment==='debit'?'selected':''} onClick={()=>setPayment('debit')}>Débito</button></div><button type="button" className={`quickAvoidable ${avoidable?'selected':''}`} onClick={()=>setAvoidable(v=>!v)}>{avoidable?'✓ Evitável':'Marcar como evitável'}</button></>}
        {message&&<div className="quickCaptureMessage">{message}</div>}
        <button type="button" className="quickSave" onClick={save} disabled={saving}>{saving?'Salvando...':mode==='expense'?'Salvar gasto':'Salvar entrada'}</button>
        {mode==='expense'&&<div className="quickCaptureRoutes"><span>Foi no cartão ou é uma conta fixa?</span><Link href="/cartoes" onClick={()=>setOpen(false)}>Compra no cartão</Link><Link href="/recorrentes" onClick={()=>setOpen(false)}>Conta recorrente</Link></div>}
      </section>
    </div>}
  </>;
}
