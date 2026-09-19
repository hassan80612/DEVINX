'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

export function PreferencesManager(){
  const[currency,setCurrency]=useState('BRL');const[timezone,setTimezone]=useState('America/Sao_Paulo');const[retention,setRetention]=useState(12);const[notice,setNotice]=useState('');const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}const{data}=await s.from('profiles').select('currency_code,timezone,retention_months').eq('id',user.id).single();if(data){setCurrency(data.currency_code||'BRL');setTimezone(data.timezone||'America/Sao_Paulo');setRetention(data.retention_months||12)}setLoading(false)})()},[]);

  async function save(){const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;const{error}=await s.from('profiles').update({currency_code:currency,timezone}).eq('id',user.id);setNotice(error?'Não foi possível salvar agora.':'Preferências salvas.')}
  async function signOut(){const s=createClient();await s.auth.signOut();location.href='/'}

  if(loading)return <section className="panel"><b>Carregando...</b></section>;
  return <>
    <section className="panel settingsForm">
      <div className="settingsNote"><b>Idiomas preparados sem duplicar telas.</b><span>O app usa uma camada única de textos. Novos idiomas entram pelo catálogo, não criando outra versão do sistema.</span></div>
      <label>Moeda<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="BRL">Real brasileiro (BRL)</option></select></label>
      <label>Fuso horário<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Sao_Paulo">Brasília / São Paulo</option></select></label>
      <label>Histórico atual<input value={String(retention)+' meses'} disabled/></label>
      <button className="primary" onClick={save}>Salvar preferências</button>
      {notice&&<div className="authMessage">{notice}</div>}
    </section>
    <section className="panel dangerZone"><h2>Conta</h2><button className="secondary" onClick={signOut}>Sair da conta</button></section>
  </>;
}
