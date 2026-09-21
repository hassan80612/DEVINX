'use client';

import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {LanguageMenu} from '@/components/LanguageMenu';

type AuthErrorLike={code?:string;message?:string};

function recoveryErrorKey(error:AuthErrorLike){
  const code=(error.code||'').toLowerCase();
  const message=(error.message||'').toLowerCase();

  if(code.includes('rate_limit')||message.includes('rate limit')||message.includes('too many requests'))return 'auth.errorRate';
  if(code==='weak_password'||message.includes('password should be')||message.includes('weak password'))return 'auth.errorPassword';

  const expiredCodes=new Set([
    'session_not_found',
    'refresh_token_not_found',
    'refresh_token_already_used',
    'bad_jwt',
    'invalid_jwt',
    'otp_expired',
    'flow_state_not_found',
    'flow_state_expired'
  ]);
  const expiredMessage=
    message.includes('auth session missing')||
    message.includes('session missing')||
    message.includes('refresh token')||
    message.includes('jwt expired')||
    message.includes('token has expired');

  if(expiredCodes.has(code)||expiredMessage)return 'auth.errorExpired';
  return 'auth.errorGeneric';
}

export default function RedefinirSenhaPage(){
  const{t}=useI18n();const[password,setPassword]=useState('');const[confirmPassword,setConfirmPassword]=useState('');const[show,setShow]=useState(false);const[notice,setNotice]=useState('');const[saving,setSaving]=useState(false);

  async function save(e:FormEvent){
    e.preventDefault();
    setNotice('');
    if(password.length<6){setNotice(t('auth.errorPassword'));return}
    if(password!==confirmPassword){setNotice(t('auth.errorMatch'));return}

    setSaving(true);
    const s=createClient();

    try{
      const{data:userData,error:userError}=await s.auth.getUser();
      if(userError){
        setNotice(t(recoveryErrorKey(userError)));
        return;
      }
      if(!userData.user){
        setNotice(t('auth.errorExpired'));
        return;
      }

      const{error}=await s.auth.updateUser({password});
      if(error){
        setNotice(t(recoveryErrorKey(error)));
        return;
      }

      window.location.replace('/painel');
    }catch{
      setNotice(t('auth.errorGeneric'));
    }finally{
      setSaving(false);
    }
  }

  return <main className="authPage"><header className="authTop"><Link className="brand" href="/"><span className="mark">D</span><b>DEVINX</b></Link><LanguageMenu/></header><section className="authCard"><div className="authIntro"><span className="goldPill">DEVINX</span><h1>{t('auth.newPassword')}</h1><p>{t('auth.newPasswordDesc')}</p></div><form className="authForm" onSubmit={save}><label>{t('auth.password')}<div className="passwordField"><input type={show?'text':'password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="button" onClick={()=>setShow(v=>!v)}>{show?t('auth.hide'):t('auth.show')}</button></div></label><label>{t('auth.confirmPassword')}<input type={show?'text':'password'} minLength={6} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password"/></label><button className="primary goldButton" disabled={saving}>{saving?t('common.saving'):t('common.save')}</button></form>{notice&&<div className="authMessage error">{notice}</div>}<Link className="authLinkButton" href="/entrar">{t('auth.backLogin')}</Link></section></main>;
}
