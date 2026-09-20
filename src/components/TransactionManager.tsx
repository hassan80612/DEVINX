'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated,FINANCE_UPDATED_EVENT} from '@/lib/finance-events';
import {localDateISO} from '@/lib/date';
import {categoryName,categoryOptions,CustomCategory} from '@/domain/categories';

type Kind='income'|'expense';
type Item={id:string;description:string|null;amount_minor:number;occurred_on:string;category_id:string;is_avoidable:boolean;payment_method:string|null};

function money(minor:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100)}
function toMinor(raw:string){const normalized=raw.replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,'');return Math.round((Number(normalized)||0)*100)}
function fromMinor(value:number){return (Number(value)/100).toFixed(2).replace('.',',')}

export function TransactionManager({kind,onNavigate}:{kind:Kind;onNavigate?:(target:string)=>void}){
  const[open,setOpen]=useState(false);const[amount,setAmount]=useState('');const[description,setDescription]=useState('');const[category,setCategory]=useState(kind==='income'?'salary':'food');const[date,setDate]=useState(localDateISO());const[payment,setPayment]=useState('pix');const[avoidable,setAvoidable]=useState(false);const[items,setItems]=useState<Item[]>([]);const[customCategories,setCustomCategories]=useState<CustomCategory[]>([]);const[saving,setSaving]=useState(false);const[notice,setNotice]=useState('');
  const[editingId,setEditingId]=useState<string|null>(null);const[editAmount,setEditAmount]=useState('');const[editDescription,setEditDescription]=useState('');const[editCategory,setEditCategory]=useState('');const[editDate,setEditDate]=useState('');const[editPayment,setEditPayment]=useState('pix');const[editAvoidable,setEditAvoidable]=useState(false);const[editing,setEditing]=useState(false);
  const categories=categoryOptions(kind,customCategories);const total=useMemo(()=>items.reduce((sum,item)=>sum+Number(item.amount_minor),0),[items]);

  async function load(){const supabase=createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return;const[{data:rows},{data:custom}]=await Promise.all([supabase.from('transactions').select('id,description,amount_minor,occurred_on,category_id,is_avoidable,payment_method').eq('user_id',user.id).eq('type',kind).order('occurred_on',{ascending:false}).limit(30),supabase.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).eq('kind',kind).order('created_at')]);setItems((rows||[]) as Item[]);setCustomCategories((custom||[]) as CustomCategory[])}
  useEffect(()=>{setEditingId(null);load();const refresh=()=>load();window.addEventListener(FINANCE_UPDATED_EVENT,refresh);window.addEventListener('devinx:categories-updated',refresh);return()=>{window.removeEventListener(FINANCE_UPDATED_EVENT,refresh);window.removeEventListener('devinx:categories-updated',refresh)}},[kind]);

  async function submit(e:FormEvent){e.preventDefault();const amountMinor=toMinor(amount);if(amountMinor<=0){setNotice('Informe um valor maior que zero.');return}setSaving(true);setNotice('');const supabase=createClient();const{data:{user}}=await supabase.auth.getUser();if(!user){window.location.href='/entrar';return}const{error}=await supabase.from('transactions').insert({user_id:user.id,type:kind,category_id:category,description:description.trim()||null,amount_minor:amountMinor,occurred_on:date,payment_method:kind==='expense'?payment:null,is_avoidable:kind==='expense'?avoidable:false,is_recurring:false});setSaving(false);if(error){setNotice('Não foi possível salvar. Tente novamente.');return}setAmount('');setDescription('');setAvoidable(false);setOpen(false);setNotice('');notifyFinanceUpdated();await load()}

  function startEdit(item:Item){setEditingId(item.id);setEditAmount(fromMinor(item.amount_minor));setEditDescription(item.description||'');setEditCategory(item.category_id);setEditDate(item.occurred_on);setEditPayment(item.payment_method||'pix');setEditAvoidable(item.is_avoidable);setNotice('')}
  function cancelEdit(){setEditingId(null);setEditAmount('');setEditDescription('');setEditCategory('');setEditDate('');setEditPayment('pix');setEditAvoidable(false)}

  async function saveEdit(e:FormEvent,item:Item){
    e.preventDefault();const value=toMinor(editAmount);if(value<=0){setNotice('Informe um valor maior que zero.');return}
    setEditing(true);setNotice('');const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const{error}=await s.from('transactions').update({amount_minor:value,description:editDescription.trim()||null,category_id:editCategory,occurred_on:editDate,payment_method:kind==='expense'?editPayment:null,is_avoidable:kind==='expense'?editAvoidable:false}).eq('id',item.id).eq('user_id',user.id);
    setEditing(false);if(error){setNotice('Não foi possível atualizar o lançamento.');return}
    cancelEdit();setNotice('Lançamento atualizado.');notifyFinanceUpdated();await load()
  }

  async function remove(item:Item){
    const label=item.description||categoryName(kind,item.category_id,customCategories)||'este lançamento';
    if(!window.confirm('Excluir '+label+'? Esta ação não pode ser desfeita.'))return;
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const{error}=await s.from('transactions').delete().eq('id',item.id).eq('user_id',user.id);
    if(error){setNotice('Não foi possível excluir o lançamento.');return}
    if(editingId===item.id)cancelEdit();setNotice('Lançamento excluído.');notifyFinanceUpdated();await load()
  }

  return <>
    <section className="moduleSummary"><small>{kind==='income'?'TOTAL DE ENTRADAS DIRETAS':'TOTAL DE GASTOS DIRETOS'}</small><strong>{money(total)}</strong><span>{kind==='income'?'trabalho por corrida fica separado para não duplicar':'cartões e contas mensais ficam separados para não duplicar'}</span></section>
    <div className="toolbar"><button className="primary" onClick={()=>setOpen(v=>!v)}>{open?'Fechar':kind==='income'?'+ Nova entrada':'+ Novo gasto'}</button>{onNavigate&&<button className="secondary" type="button" onClick={()=>onNavigate('categories')}>Categorias</button>}</div>
    {open&&<form className="entryForm" onSubmit={submit}><label>Valor<input autoFocus required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" inputMode="decimal"/></label><label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} placeholder={kind==='income'?'Ex.: salário, comissão, renda extra':'Ex.: almoço, mercado, aluguel'}/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(item=><option value={item.id} key={item.id}>{item.icon} {item.name}</option>)}</select></label><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>{kind==='expense'&&<><label>Pagamento<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option></select></label><label className="checkOnly"><input type="checkbox" checked={avoidable} onChange={e=>setAvoidable(e.target.checked)}/> É um gasto evitável</label></>}<button className="primary" disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>Salvando...</>:'Salvar'}</button></form>}
    {notice&&<div className="authMessage transactionNotice">{notice}</div>}
    {onNavigate&&kind==='expense'&&<div className="flowGuard"><span>Foi no crédito?</span><button type="button" onClick={()=>onNavigate('cards')}>Cartão e parcelas</button><span>Repete todo mês?</span><button type="button" onClick={()=>onNavigate('recurring')}>Conta mensal</button></div>}
    {onNavigate&&kind==='income'&&<div className="flowGuard"><span>Uber, 99, iFood ou entregas?</span><button type="button" onClick={()=>onNavigate('work')}>Registrar jornada</button></div>}
    <section className="transactionList">{items.length===0?<div className="empty"><b>Nenhum lançamento ainda</b><p>Use o botão Rápido para registrar algo em segundos.</p></div>:items.map(item=><article key={item.id} className={editingId===item.id?'transactionEditing':''}>
      <div className="transactionMain"><div><b>{item.description||categoryName(kind,item.category_id,customCategories)||'Lançamento'}</b><small>{categoryName(kind,item.category_id,customCategories)} · {new Date(item.occurred_on+'T12:00:00').toLocaleDateString('pt-BR')}{item.is_avoidable?' · evitável':''}</small></div><strong className={kind==='income'?'positive':'negative'}>{kind==='income'?'+ ':'- '}{money(Number(item.amount_minor))}</strong></div>
      <div className="transactionActions"><button type="button" onClick={()=>editingId===item.id?cancelEdit():startEdit(item)}>{editingId===item.id?'Cancelar':'Editar'}</button><button type="button" className="dangerText" onClick={()=>remove(item)}>Excluir</button></div>
      {editingId===item.id&&<form className="transactionEditForm" onSubmit={e=>saveEdit(e,item)}>
        <label>Valor<input autoFocus required value={editAmount} onChange={e=>setEditAmount(e.target.value)} inputMode="decimal"/></label>
        <label>Descrição<input value={editDescription} onChange={e=>setEditDescription(e.target.value)} placeholder="Descrição"/></label>
        <label>Categoria<select value={editCategory} onChange={e=>setEditCategory(e.target.value)}>{categories.map(option=><option value={option.id} key={option.id}>{option.icon} {option.name}</option>)}</select></label>
        <label>Data<input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} required/></label>
        {kind==='expense'&&<><label>Pagamento<select value={editPayment} onChange={e=>setEditPayment(e.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option></select></label><label className="checkOnly"><input type="checkbox" checked={editAvoidable} onChange={e=>setEditAvoidable(e.target.checked)}/> Evitável</label></>}
        <button className="primary editSave" disabled={editing} aria-busy={editing}>{editing?<><span className="buttonSpinner"/>Salvando...</>:'Salvar alteração'}</button>
      </form>}
    </article>)}</section>
  </>;
}
