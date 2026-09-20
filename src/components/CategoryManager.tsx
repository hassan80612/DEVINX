'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {notifyFinanceUpdated} from '@/lib/finance-events';
import {CategoryKind,CustomCategory,systemCategories} from '@/domain/categories';
import {useI18n} from '@/i18n/provider';

const icons=['•','🍽️','🛒','🚗','🏠','✚','🎓','⚡','☕','★','💼','💰'];

export function CategoryManager(){
  const{t}=useI18n();
  const[kind,setKind]=useState<CategoryKind>('expense');const[categories,setCategories]=useState<CustomCategory[]>([]);const[name,setName]=useState('');const[icon,setIcon]=useState('•');const[showQuick,setShowQuick]=useState(true);const[editingId,setEditingId]=useState<string|null>(null);const[editingName,setEditingName]=useState('');const[notice,setNotice]=useState('');const[saving,setSaving]=useState(false);

  async function load(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const{data}=await s.from('finance_categories').select('id,kind,name,icon,show_in_quick,is_active').eq('user_id',user.id).order('created_at');setCategories((data||[]) as CustomCategory[])}
  useEffect(()=>{load()},[]);

  async function add(e:FormEvent){
    e.preventDefault();const value=name.trim();if(!value)return;setSaving(true);const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('finance_categories').insert({user_id:user.id,kind,name:value,icon,show_in_quick:showQuick});setSaving(false);if(error){setNotice(t('common.errorSave'));return}setName('');setIcon('•');setShowQuick(true);window.dispatchEvent(new CustomEvent('devinx:categories-updated'));await load();
  }
  async function toggle(c:CustomCategory,field:'is_active'|'show_in_quick'){const s=createClient();const{error}=await s.from('finance_categories').update({[field]:!c[field]}).eq('id',c.id);if(error){setNotice(t('common.errorUpdate'));return}window.dispatchEvent(new CustomEvent('devinx:categories-updated'));await load()}
  async function rename(c:CustomCategory){const value=editingName.trim();if(!value)return;const s=createClient();const{error}=await s.from('finance_categories').update({name:value}).eq('id',c.id);if(error){setNotice(t('common.errorUpdate'));return}setEditingId(null);window.dispatchEvent(new CustomEvent('devinx:categories-updated'));await load()}
  async function remove(c:CustomCategory){
    if(!confirm(t('common.delete')+' "'+c.name+'"?'))return;
    setNotice('');
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const[txUse,billUse,cardUse]=await Promise.all([
      s.from('transactions').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('category_id',c.id),
      s.from('recurring_bills').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('category_id',c.id),
      s.from('card_purchases').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('category_id',c.id)
    ]);
    if(txUse.error||billUse.error||cardUse.error){setNotice(t('common.errorDelete'));return}
    if(Number(txUse.count||0)+Number(billUse.count||0)+Number(cardUse.count||0)>0){setNotice(t('categories.deleteUsed'));return}
    const{error}=await s.from('finance_categories').delete().eq('id',c.id).eq('user_id',user.id);
    if(error){setNotice(t('common.errorDelete'));return}
    if(editingId===c.id)setEditingId(null);
    window.dispatchEvent(new CustomEvent('devinx:categories-updated'));notifyFinanceUpdated();await load();
  }

  const custom=categories.filter(c=>c.kind===kind);const system=systemCategories(kind);

  return <div className="dashboardStack">
    <section className="panel"><div className="sectionTitleRow"><div><small>{t('nav.categories').toUpperCase()}</small><h2>{t('categories.title')}</h2></div></div><p className="lead">{t('categories.lead')}</p><div className="movementTabs"><button className={kind==='expense'?'active':''} onClick={()=>setKind('expense')}>{t('categories.expenses')}</button><button className={kind==='income'?'active':''} onClick={()=>setKind('income')}>{t('categories.incomes')}</button></div></section>
    <section className="panel"><h2>{t('categories.new')}</h2><form className="entryForm" onSubmit={add}><label>{t('categories.name')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={40}/></label><label>{t('categories.icon')}<div className="tagRow">{icons.map(v=><button type="button" key={v} className={icon===v?'selected':''} onClick={()=>setIcon(v)}>{v}</button>)}</div></label><label className="checkOnly"><input type="checkbox" checked={showQuick} onChange={e=>setShowQuick(e.target.checked)}/>{t('categories.quick')}</label><button className="primary" disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('categories.create')}</button></form>{notice&&<div className="authMessage">{notice}</div>}</section>
    <section className="panel"><div className="sectionTitleRow"><div><small>{t('categories.custom').toUpperCase()}</small><h2>{t('categories.custom')}</h2></div></div>{custom.length===0?<div className="empty"><b>{t('categories.empty')}</b></div>:<div className="categoryList">{custom.map(c=><article key={c.id}><span className="categoryIcon">{c.icon||'•'}</span><div>{editingId===c.id?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename(c);if(e.key==='Escape')setEditingId(null)}}/>:<><b>{c.name}</b><small>{c.is_active?(c.show_in_quick?t('common.active')+' · + '+t('common.add'):t('common.active')):t('categories.inHistory')}</small></>}</div><div className="categoryActions">{editingId===c.id?<button onClick={()=>rename(c)}>{t('common.save')}</button>:<button onClick={()=>{setEditingId(c.id);setEditingName(c.name)}}>{t('categories.rename')}</button>}<button disabled={!c.is_active} onClick={()=>toggle(c,'show_in_quick')}>{c.show_in_quick?t('categories.quickRemove'):t('categories.quickAdd')}</button><button onClick={()=>toggle(c,'is_active')}>{c.is_active?t('categories.disable'):t('categories.enable')}</button><button className="dangerText" onClick={()=>remove(c)}>{t('common.delete')}</button></div></article>)}</div>}</section>
    <section className="panel"><div className="sectionTitleRow"><div><small>DEVINX</small><h2>{t('categories.system')}</h2></div></div><div className="categoryChips">{system.map(c=><span key={c.id}>{c.icon} {t(c.key)}</span>)}</div></section>
  </div>;
}
