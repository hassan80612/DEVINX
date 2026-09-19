'use client';

import {useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO} from '@/lib/date';
import {CustomCategory} from '@/domain/categories';

type Mode='expense'|'income';
type Preset={label:string;category:string;description:string;icon:string};
type Request={id:number;mode:Mode};

const expensePresets:Preset[]=[
  {label:'Almoço',category:'food',description:'Almoço',icon:'🍽️'},
  {label:'Mercado',category:'groceries',description:'Mercado',icon:'🛒'},
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

function toMinor(raw:string){const normalized=raw.replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'');return Math.round((Number(normalized)||0)*100)}

export function QuickCapture({request,onNavigate}:{request?:Request;onNavigate?:(target:string)=>void}){
  const[open,setOpen]=useState(false);const[mode,setMode]=useState<Mode>('expense');const[category,setCategory]=useState('food');const[description,setDescription]=useState('Almoço');const[amount,setAmount]=useState('');const[payment,setPayment]=useState('pix');const[avoidable,setAvoidable]=useState(false);const[saving,setSaving]=useState(false);const[message,setMessage]=useState('');const[custom,setCustom]=useState<CustomCategory[]>([]);const amountRef=useRef<HTMLInputElement>(null);
  const basePresets=mode==='expense'?expensePresets:incomePresets;
  const customPresets:Preset[]=custom.filter(c=>c.kind===mode&&c.is_active&&c.show_in_quick).map(c=>({label:c.name,category:c.id,description:c.name,icon:c.icon||'•'}));
  const presets=[...basePresets,...customPresets];

  async function loadCategories(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{data}=await s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('is_active',true).order('created_at');setCustom((data||[]) as CustomCategory[])}
  useEffect(()=>{if(open){loadCategories();setTimeout(()=>amountRef.current?.focus(),80)}},[open]);
  useEffect(()=>{if(request&&request.id>0){changeMode(request.mode);setOpen(true)}},[request?.id]);

  function selectPreset(preset:Preset){setCategory(preset.category);setDescription(preset.description);setTimeout(()=>amountRef.current?.focus(),20)}
  function changeMode(next:Mode){setMode(next);const first=next==='expense'?expensePresets[0]:incomePresets[0];setCategory(first.category);setDescription(first.description);setAmount('');setAvoidable(false);setMessage('')}
  function go(target:string){setOpen(false);onNavigate?.(target)}

  async function save(){const value=toMinor(amount);if(value<=0){setMessage('Informe o valor.');amountRef.current?.focus();return}setSaving(true);setMessage('');const supabase=createClient();const{data:{user}}=await supabase.auth.getUser();if(!user){setSaving(false);location.href='/entrar';return}const{error}=await supabase.from('transactions').insert({user_id:user.id,type:mode,category_id:category,description:description.trim()||null,amount_minor:value,occurred_on:localDateISO(),payment_method:mode==='expense'?payment:null,is_avoidable:mode==='expense'?avoidable:false,is_recurring:false});setSaving(false);if(error){setMessage('Não foi possível salvar agora.');return}setAmount('');setAvoidable(false);setMessage(mode==='expense'?'Gasto salvo.':'Entrada salva.');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));setTimeout(()=>{setOpen(false);setMessage('')},420)}

  return <>
    <button type="button" className="quickCaptureFab" onClick={()=>{setOpen(true);setMessage('')}} aria-label="Registro rápido"><span>+</span><b>Rápido</b></button>
    {open&&<div className="quickCaptureBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="quickCaptureSheet" role="dialog" aria-modal="true" aria-label="Registro rápido">
      <div className="quickCaptureHandle"/><div className="quickCaptureHead"><div><small>REGISTRO RÁPIDO</small><h2>Fez agora? Salve agora.</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Fechar">×</button></div>
      <div className="quickCaptureTabs"><button type="button" className={mode==='expense'?'active':''} onClick={()=>changeMode('expense')}>Gasto</button><button type="button" className={mode==='income'?'active':''} onClick={()=>changeMode('income')}>Entrada</button><button type="button" onClick={()=>go('work')}>Jornada</button></div>
      <div className="quickPresetGrid">{presets.map(preset=><button type="button" key={preset.category+'-'+preset.label} className={category===preset.category&&description===preset.description?'selected':''} onClick={()=>selectPreset(preset)}><span>{preset.icon}</span><b>{preset.label}</b></button>)}</div>
      <div className="quickAmountRow"><label><span>Valor</span><div className="quickMoney"><b>R$</b><input ref={amountRef} value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" onKeyDown={e=>{if(e.key==='Enter')save()}}/></div></label></div>
      <label className="quickDescription"><span>Descrição <em>opcional</em></span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: almoço com cliente"/></label>
      {mode==='expense'&&<><div className="quickPayment"><button type="button" className={payment==='pix'?'selected':''} onClick={()=>setPayment('pix')}>Pix</button><button type="button" className={payment==='cash'?'selected':''} onClick={()=>setPayment('cash')}>Dinheiro</button><button type="button" className={payment==='debit'?'selected':''} onClick={()=>setPayment('debit')}>Débito</button></div><button type="button" className={'quickAvoidable '+(avoidable?'selected':'')} onClick={()=>setAvoidable(v=>!v)}>{avoidable?'✓ Evitável':'Marcar como evitável'}</button></>}
      {message&&<div className="quickCaptureMessage">{message}</div>}<button type="button" className="quickSave" onClick={save} disabled={saving}>{saving?'Salvando...':mode==='expense'?'Salvar gasto':'Salvar entrada'}</button>
      {mode==='expense'&&<div className="quickCaptureRoutes"><span>Outro tipo de compromisso?</span><button type="button" onClick={()=>go('cards')}>Cartão</button><button type="button" onClick={()=>go('recurring')}>Conta mensal</button></div>}
    </section></div>}
  </>;
}
