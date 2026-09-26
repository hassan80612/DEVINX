'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import styles from './SiteVisibilityAdminCard.module.css';

export function SiteVisibilityAdminCard(){
  const[laser,setLaser]=useState(false);
  const[finance,setFinance]=useState(true);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState<string|null>(null);
  const[notice,setNotice]=useState('');

  async function load(){
    setLoading(true);
    const supabase=createClient();
    const{data,error}=await supabase.rpc('admin_get_site_visibility');
    if(!error){
      const row=Array.isArray(data)?data[0]:data;
      setLaser(Boolean(row?.laser_public_visible));
      setFinance(row?.finance_public_visible!==false);
    }
    setLoading(false);
  }

  useEffect(()=>{void load()},[]);

  async function update(kind:'laser'|'finance',value:boolean){
    setSaving(kind);
    setNotice('');
    const supabase=createClient();
    const{error}=await supabase.rpc('admin_update_site_visibility',{
      p_laser_public_visible:kind==='laser'?value:null,
      p_finance_public_visible:kind==='finance'?value:null
    });

    if(error){
      setNotice('Não foi possível alterar a visibilidade.');
    }else{
      if(kind==='laser')setLaser(value);
      else setFinance(value);
      setNotice(value?'Publicado na home.':'Oculto da home.');
    }
    setSaving(null);
  }

  return <section className={styles.card}>
    <div className={styles.head}>
      <div>
        <small>VISIBILIDADE PÚBLICA</small>
        <h3>Mostrar ou esconder sem deploy</h3>
        <p>Você pode tirar os links da home e continuar acessando tudo por aqui.</p>
      </div>
      {loading&&<span className={styles.loading}>Carregando…</span>}
    </div>

    <div className={styles.rows}>
      <article>
        <div>
          <b>Laser Control</b>
          <span>{laser?'Visível na home':'Oculto da home · acesso master continua ativo'}</span>
        </div>
        <div className={styles.actions}>
          <a href="/laser-control">Abrir Laser Control</a>
          <a href="/laser-control/guia">Abrir guia</a>
          <button
            type="button"
            disabled={saving!==null}
            className={laser?styles.hideButton:styles.showButton}
            onClick={()=>void update('laser',!laser)}
          >{saving==='laser'?'Salvando…':laser?'Esconder':'Divulgar'}</button>
        </div>
      </article>

      <article>
        <div>
          <b>DevinX Financeiro</b>
          <span>{finance?'Visível na home':'Oculto da home · seu acesso master continua ativo'}</span>
        </div>
        <div className={styles.actions}>
          <a href="/painel">Abrir Financeiro</a>
          <button
            type="button"
            disabled={saving!==null}
            className={finance?styles.hideButton:styles.showButton}
            onClick={()=>void update('finance',!finance)}
          >{saving==='finance'?'Salvando…':finance?'Esconder':'Divulgar'}</button>
        </div>
      </article>
    </div>

    {notice&&<div className={styles.notice}>{notice}</div>}
  </section>;
}
