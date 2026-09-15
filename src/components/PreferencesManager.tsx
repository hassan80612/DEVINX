'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import type {Locale} from '@/i18n/config';

type Passkey={id:string;friendly_name?:string;created_at:string;last_used_at?:string};

export function PreferencesManager(){
  const{messages:m,setLocale:setAppLocale}=useI18n();
  const[locale,setLocale]=useState<Locale>('pt-BR');
  const[currency,setCurrency]=useState('BRL');
  const[timezone,setTimezone]=useState('America/Sao_Paulo');
  const[retention,setRetention]=useState(12);
  const[notice,setNotice]=useState('');
  const[loading,setLoading]=useState(true);
  const[passkeySupported,setPasskeySupported]=useState(false);
  const[passkeys,setPasskeys]=useState<Passkey[]>([]);
  const[passkeyBusy,setPasskeyBusy]=useState(false);
  const[passkeyNotice,setPasskeyNotice]=useState('');

  async function loadPasskeys(){
    if(typeof window==='undefined'||!('PublicKeyCredential' in window))return;
    setPasskeySupported(true);
    const s=createClient();
    const{data,error}=await s.auth.passkey.list();
    if(!error)setPasskeys((data||[]) as Passkey[]);
  }

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const{data}=await s.from('profiles').select('locale,currency_code,timezone,retention_months').eq('id',user.id).single();
    if(data){setLocale((data.locale||'pt-BR') as Locale);setCurrency(data.currency_code);setTimezone(data.timezone);setRetention(data.retention_months)}
    await loadPasskeys();
    setLoading(false);
  })()},[]);

  async function save(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user)return;
    const{error}=await s.from('profiles').update({locale,currency_code:currency,timezone}).eq('id',user.id);
    if(error){setNotice(m.preferences.saveError);return}
    setAppLocale(locale);
    setNotice(m.preferences.saved);
  }

  async function registerPasskey(){
    setPasskeyBusy(true);setPasskeyNotice('');
    try{
      const s=createClient();
      const{error}=await s.auth.registerPasskey();
      if(error){
        setPasskeyNotice(error.code==='passkey_disabled'?'A entrada com digital ainda precisa ser habilitada no Supabase.':'Não foi possível ativar a digital/passkey neste aparelho.');
        return;
      }
      setPasskeyNotice('Digital/passkey ativada. Na próxima vez você poderá entrar sem digitar a senha.');
      await loadPasskeys();
    }catch{
      setPasskeyNotice('A configuração da digital/passkey foi cancelada ou não pôde ser concluída.');
    }finally{
      setPasskeyBusy(false);
    }
  }

  async function removePasskey(id:string){
    setPasskeyBusy(true);setPasskeyNotice('');
    const s=createClient();
    const{error}=await s.auth.passkey.delete({passkeyId:id});
    if(error)setPasskeyNotice('Não foi possível remover essa passkey.');
    else{setPasskeyNotice('Passkey removida.');await loadPasskeys()}
    setPasskeyBusy(false);
  }

  async function signOut(){const s=createClient();await s.auth.signOut();location.href='/'}

  if(loading)return <section className="panel"><b>{m.preferences.loading}</b></section>;
  return <>
    <section className="panel settingsForm">
      <label>{m.preferences.language}<select value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="pt-BR">{m.preferences.ptBR}</option></select><small>{m.preferences.languageHelp}</small></label>
      <label>{m.preferences.currency}<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="BRL">{m.preferences.brl}</option></select></label>
      <label>{m.preferences.timezone}<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Sao_Paulo">{m.preferences.saoPaulo}</option></select></label>
      <label>{m.preferences.history}<input value={`${retention} ${m.preferences.months}`} disabled/><small>{m.preferences.retentionHelp}</small></label>
      <button className="primary" onClick={save}>{m.preferences.save}</button>
      {notice&&<div className="authMessage">{notice}</div>}
    </section>

    <section className="panel securityPanel">
      <div className="securityPanelHead"><div><small>ACESSO RÁPIDO E SEGURO</small><h2>Digital / biometria</h2></div><span className="securityBadge">Passkey</span></div>
      <p className="lead">Use a digital, Face ID, PIN ou segurança do próprio aparelho para entrar sem digitar sua senha.</p>
      {!passkeySupported?<div className="securityUnavailable">Este navegador ou aparelho não oferece WebAuthn/passkeys.</div>:<>
        <button className="primary securityPrimary" onClick={registerPasskey} disabled={passkeyBusy}>{passkeyBusy?'Aguarde...':passkeys.length?'+ Adicionar outro aparelho':'Ativar entrada com digital'}</button>
        {passkeys.length>0&&<div className="passkeyList">{passkeys.map((item,index)=><article key={item.id}><div><b>{item.friendly_name||`Passkey ${index+1}`}</b><small>Adicionada em {new Date(item.created_at).toLocaleDateString('pt-BR')}{item.last_used_at?` · usada em ${new Date(item.last_used_at).toLocaleDateString('pt-BR')}`:''}</small></div><button type="button" className="textButton" disabled={passkeyBusy} onClick={()=>removePasskey(item.id)}>Remover</button></article>)}</div>}
      </>}
      {passkeyNotice&&<div className="authMessage">{passkeyNotice}</div>}
      <p className="securityFootnote">Sua digital não é enviada ao Devinx. O aparelho apenas confirma sua identidade e usa uma chave criptográfica protegida.</p>
    </section>

    <section className="panel dangerZone"><h2>{m.preferences.account}</h2><button className="secondary" onClick={signOut}>{m.preferences.signOut}</button></section>
  </>;
}
