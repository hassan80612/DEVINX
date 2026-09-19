'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {LanguageMenu} from '@/components/LanguageMenu';
import {BrandLogo} from '@/components/BrandLogo';

type Mode='entrar'|'criar'|'recuperar';
type MessageKind='idle'|'error'|'success';
const CANONICAL_ORIGIN='https://devinx.com.br';
const CHECKOUT='https://pay.kiwify.com.br/pf2YM64';

function safeNextPath(value:string){return value.startsWith('/')&&!value.startsWith('//')?value:'/painel'}

export function AuthForm({nextPath='',initialError=''}:{nextPath?:string;initialError?:string}){
  const{t,locale}=useI18n();
  const[mode,setMode]=useState<Mode>(initialError?'recuperar':'entrar');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[confirmPassword,setConfirmPassword]=useState('');const[showPassword,setShowPassword]=useState(false);const[message,setMessage]=useState(initialError? t('auth.errorExpired'):'');const[messageKind,setMessageKind]=useState<MessageKind>(initialError?'error':'idle');const[pending,setPending]=useState(false);const[purchaseApproved,setPurchaseApproved]=useState(false);

  useEffect(()=>{try{setPurchaseApproved(new URLSearchParams(window.location.search).get('compra')==='aprovada')}catch{}},[]);

  function changeMode(next:Mode){setMode(next);setPassword('');setConfirmPassword('');setShowPassword(false);setMessage('');setMessageKind('idle')}
  async function destinationForUser(userId:string){const s=createClient();const{data}=await s.from('profiles').select('onboarded_at').eq('id',userId).maybeSingle();return data?.onboarded_at?safeNextPath(nextPath):'/onboarding'}
  function friendlyError(message:string){const lower=message.toLowerCase();if(lower.includes('invalid login credentials'))return t('auth.errorCredentials');if(lower.includes('email not confirmed'))return t('auth.errorUnconfirmed');if(lower.includes('user already registered'))return t('auth.errorExists');if(lower.includes('password should be'))return t('auth.errorPassword');if(lower.includes('rate limit'))return t('auth.errorRate');return t('auth.errorGeneric')}

  async function handleSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending)return;const normalizedEmail=email.trim().toLowerCase();setMessage('');setMessageKind('idle');
    if(!normalizedEmail){setMessage(t('auth.errorEmail'));setMessageKind('error');return}
    if(mode!=='recuperar'&&password.length<6){setMessage(t('auth.errorPassword'));setMessageKind('error');return}
    if(mode==='criar'&&password!==confirmPassword){setMessage(t('auth.errorMatch'));setMessageKind('error');return}
    setPending(true);const s=createClient();
    try{
      if(mode==='entrar'){const{data,error}=await s.auth.signInWithPassword({email:normalizedEmail,password});if(error||!data.user){setMessage(friendlyError(error?.message||''));setMessageKind('error');return}window.location.replace(await destinationForUser(data.user.id));return}
      if(mode==='criar'){const{data,error}=await s.auth.signUp({email:normalizedEmail,password,options:{emailRedirectTo:CANONICAL_ORIGIN+'/auth/confirm?next=/onboarding'}});if(error||!data.user){setMessage(friendlyError(error?.message||''));setMessageKind('error');return}if(data.user.identities?.length===0){setMessage(t('auth.errorExists'));setMessageKind('error');return}if(data.session){window.location.replace('/onboarding');return}setMessage(t('auth.created'));setMessageKind('success');return}
      const callback=CANONICAL_ORIGIN+'/auth/confirm?next=/redefinir-senha';const{error}=await s.auth.resetPasswordForEmail(normalizedEmail,{redirectTo:callback});if(error){setMessage(friendlyError(error.message));setMessageKind('error');return}setMessage(t('auth.resetSent'));setMessageKind('success');
    }catch{setMessage(t('auth.errorGeneric'));setMessageKind('error')}finally{setPending(false)}
  }

  return <main className="authPage">
    <header className="authTop"><Link className="brand" href="/"><BrandLogo/></Link><LanguageMenu/></header>
    {purchaseApproved&&<section className="purchaseReturnNotice"><span>✓</span><div><b>{t('auth.purchaseApprovedTitle')}</b><p>{t('auth.purchaseApprovedText')}</p></div></section>}
    <section className="authCard">
      <div className="authIntro"><span className="goldPill">DEVINX</span><h1>{mode==='entrar'?t('auth.titleLogin'):mode==='criar'?t('auth.titleCreate'):t('auth.titleRecover')}</h1><p>{mode==='entrar'?t('auth.loginDesc'):mode==='criar'?t('auth.createDesc'):t('auth.recoverDesc')}</p></div>
      {mode!=='recuperar'&&<div className="authTabs"><button type="button" className={mode==='entrar'?'active':''} onClick={()=>changeMode('entrar')}>{t('auth.login')}</button><button type="button" className={mode==='criar'?'active':''} onClick={()=>changeMode('criar')}>{t('auth.create')}</button></div>}
      <form onSubmit={handleSubmit} className="authForm">
        <label>{t('auth.email')}<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@email.com"/></label>
        {mode!=='recuperar'&&<label>{t('auth.password')}<div className="passwordField"><input value={password} onChange={e=>setPassword(e.target.value)} type={showPassword?'text':'password'} minLength={6} required autoComplete={mode==='entrar'?'current-password':'new-password'}/><button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?t('auth.hide'):t('auth.show')}</button></div></label>}
        {mode==='criar'&&<label>{t('auth.confirmPassword')}<input value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} type={showPassword?'text':'password'} minLength={6} required autoComplete="new-password"/></label>}
        <button className="primary goldButton authSubmit" disabled={pending}>{pending?t('auth.wait'):mode==='entrar'?t('auth.login'):mode==='criar'?t('auth.create'):t('auth.sendLink')}</button>
      </form>
      {message&&<div className={'authMessage '+(messageKind==='success'?'success':'error')}>{message}</div>}
      {mode==='entrar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('recuperar')}>{t('auth.forgot')}</button>}
      {mode==='recuperar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('entrar')}>{t('auth.backLogin')}</button>}
    </section>
    <aside className="authSubscription">
      <div><small>{t('subscription.label')}</small><b>{t('subscription.price')} / {t('subscription.month')}</b><span>{t('subscription.authHelp')}</span></div>
      <a className="goldOutline" href={locale==='pt-BR'?CHECKOUT:CHECKOUT+'?region=intl'}>{t('subscription.subscribe')}</a>
    </aside>
  </main>;
}
