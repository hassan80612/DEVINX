'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CategoryKind,CustomCategory,systemCategories} from '@/domain/categories';

const icons=['•','🍽️','🛒','🚗','🏠','✚','🎓','⚡','☕','★','💼','💰'];

export function CategoryManager(){
  const[kind,setKind]=useState<CategoryKind>('expense');
  const[categories,setCategories]=useState<CustomCategory[]>([]);
  const[name,setName]=useState('');
  const[icon,setIcon]=useState('•');
  const[showQuick,setShowQuick]=useState(true);
  const[editingId,setEditingId]=useState<string|null>(null);
  const[editingName,setEditingName]=useState('');
  const[notice,setNotice]=useState('');
  const[saving,setSaving]=useState(false);

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const{data}=await s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).order('created_at');
    setCategories((data||[]) as CustomCategory[]);
  }
  useEffect(()=>{load()},[]);

  async function add(e:FormEvent){
    e.preventDefault();
    const value=name.trim();
    if(!value){setNotice('Digite o nome da categoria.');return}
    setSaving(true);setNotice('');
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){setSaving(false);location.href='/entrar';return}
    const{error}=await s.from('finance_categories').insert({user_id:user.id,kind,name:value,icon,show_in_quick:showQuick});
    setSaving(false);
    if(error){setNotice(error.code==='23505'?'Essa categoria já existe.':'Não foi possível criar a categoria.');return}
    setName('');setIcon('•');setShowQuick(true);setNotice('Categoria criada. Ela já aparece nos lançamentos.');
    window.dispatchEvent(new CustomEvent('devinx:categories-updated'));
    await load();
  }

  async function toggle(category:CustomCategory,field:'is_active'|'show_in_quick'){
    const s=createClient();
    const{error}=await s.from('finance_categories').update({[field]:!category[field]}).eq('id',category.id);
    if(error){setNotice('Não foi possível atualizar a categoria.');return}
    window.dispatchEvent(new CustomEvent('devinx:categories-updated'));
    await load();
  }

  async function rename(category:CustomCategory){
    const value=editingName.trim();
    if(!value){setEditingId(null);return}
    const s=createClient();
    const{error}=await s.from('finance_categories').update({name:value}).eq('id',category.id);
    if(error){setNotice(error.code==='23505'?'Já existe uma categoria com esse nome.':'Não foi possível renomear.');return}
    setEditingId(null);setEditingName('');
    window.dispatchEvent(new CustomEvent('devinx:categories-updated'));
    await load();
  }

  const custom=categories.filter(c=>c.kind===kind);
  const system=systemCategories(kind);

  return <div className="dashboardStack">
    <section className="panel">
      <div className="sectionTitleRow"><div><small>ORGANIZAÇÃO</small><h2>Suas categorias</h2></div></div>
      <p className="lead">As categorias padrão continuam disponíveis. Crie as suas para adaptar o Devinx à sua rotina.</p>
      <div className="quickCaptureTabs"><button type="button" className={kind==='expense'?'active':''} onClick={()=>setKind('expense')}>Gastos</button><button type="button" className={kind==='income'?'active':''} onClick={()=>setKind('income')}>Rendas</button></div>
    </section>

    <section className="panel">
      <h2>Nova categoria</h2>
      <form className="entryForm" onSubmit={add}>
        <label>Nome<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder={kind==='expense'?'Ex.: Pedágio, manutenção, estacionamento':'Ex.: Freelance, gorjeta, aluguel recebido'} /></label>
        <label>Ícone<div className="tagRow">{icons.map(value=><button type="button" key={value} className={icon===value?'selected':''} onClick={()=>setIcon(value)}>{value}</button>)}</div></label>
        <label className="checkOnly"><input type="checkbox" checked={showQuick} onChange={e=>setShowQuick(e.target.checked)}/> Mostrar também no botão + Rápido</label>
        <button className="primary" disabled={saving}>{saving?'Salvando...':'Criar categoria'}</button>
      </form>
      {notice&&<div className="authMessage">{notice}</div>}
    </section>

    <section className="panel">
      <div className="sectionTitleRow"><div><small>PERSONALIZADAS</small><h2>Minhas categorias</h2></div></div>
      {custom.length===0?<div className="empty"><b>Nenhuma categoria personalizada</b><p>As categorias que você criar aparecerão aqui e nos formulários do Devinx.</p></div>:<div className="menuList">{custom.map(category=><article className="menuItem" key={category.id}><span>{category.icon||'•'}</span><div>{editingId===category.id?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename(category);if(e.key==='Escape')setEditingId(null)}}/>:<><b>{category.name}</b><small>{category.is_active?(category.show_in_quick?'Ativa · aparece no + Rápido':'Ativa · formulário completo'):'Desativada · mantida no histórico'}</small></>}</div><div className="toolbar">{editingId===category.id?<button type="button" className="secondary" onClick={()=>rename(category)}>Salvar</button>:<button type="button" className="textButton" onClick={()=>{setEditingId(category.id);setEditingName(category.name)}}>Renomear</button>}<button type="button" className="textButton" onClick={()=>toggle(category,'show_in_quick')} disabled={!category.is_active}>{category.show_in_quick?'Tirar do Rápido':'Pôr no Rápido'}</button><button type="button" className="textButton" onClick={()=>toggle(category,'is_active')}>{category.is_active?'Desativar':'Ativar'}</button></div></article>)}</div>}
    </section>

    <section className="panel">
      <div className="sectionTitleRow"><div><small>PADRÃO DEVINX</small><h2>Categorias prontas</h2></div></div>
      <div className="tagRow">{system.map(category=><span key={category.id} className="paidButton">{category.icon} {category.name}</span>)}</div>
      <p className="lead">As categorias padrão não podem ser apagadas porque mantêm relatórios e histórico consistentes.</p>
    </section>
  </div>;
}
