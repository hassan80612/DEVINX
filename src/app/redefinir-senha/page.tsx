'use client';

import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {LanguageMenu} from '@/components/LanguageMenu';

export default function RedefinirSenhaPage(){
  const{t}=useI18n();const[password,setPassword]=useState('');const[confirmPassword,setConfirmPassword]=useState('');const[show,setShow]=useState(false);const[notice,setNotice]=useState('');const[saving,setSaving]=useState(false);
  async function save(e:FormEvent){e.preventDefault();setNotice('');if(password.length<6){setNotice(t('auth.errorPassword'));return}if(password!==confirmPassword){setNotice(t('auth.errorMatch'));return}setSaving(true);const s=createClient();const{error}=await s.auth.updateUser({password});setSaving(false);if(error){setNotice(t('auth.errorExpired'));return}window.location.replace('/painel')}
  return <main className="authPage"><header className="authTop"><Link className="brand" href="/"><span className="mark">D</span><b>DEVINX</b></Link><LanguageMenu/></header><section className="authCard"><div className="authIntro"><span className="goldPill">DEVINX</span><h1>{t('auth.newPassword')}</h1><p>{t('auth.newPasswordDesc')}</p></div><form className="authForm" onSubmit={save}><label>{t('auth.password')}<div className="passwordField"><input type={show?'text':'password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="button" onClick={()=>setShow(v=>!v)}>{show?t('auth.hide'):t('auth.show')}</button></div></label><label>{t('auth.confirmPassword')}<input type={show?'text':'password'} minLength={6} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password"/></label><button className="primary goldButton" disabled={saving}>{saving?t('common.saving'):t('common.save')}</button></form>{notice&&<div className="authMessage error">{notice}</div>}<Link className="authLinkButton" href="/entrar">{t('auth.backLogin')}</Link></section></main>;
}
