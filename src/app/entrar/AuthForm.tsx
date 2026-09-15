'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

type Mode='entrar'|'criar'|'recuperar';
type MessageKind='idle'|'error'|'success';

const CANONICAL_ORIGIN='https://devinx.com.br';

function safeNextPath(value:string){
  return value.startsWith('/')&&!value.startsWith('//')?value:'/painel';
}

function friendlyError(message:string){
  const lower=message.toLowerCase();
  if(lower.includes('invalid login credentials'))return'E-mail ou senha não conferem.';
  if(lower.includes('email not confirmed'))return'Seu e-mail ainda não foi confirmado.';
  if(lower.includes('user already registered'))return'Já existe uma conta com este e-mail.';
  if(lower.includes('password should be'))return'A senha não atende aos requisitos mínimos.';
  if(lower.includes('rate limit'))return'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
  return'Não foi possível concluir agora. Tente novamente.';
}

export function AuthForm({nextPath='',initialError=''}:{nextPath?:string;initialError?:string}){
  const[mode,setMode]=useState<Mode>(initialError?'recuperar':'entrar');
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[confirmPassword,setConfirmPassword]=useState('');
  const[showPassword,setShowPassword]=useState(false);
  const[message,setMessage]=useState(initialError);
  const[messageKind,setMessageKind]=useState<MessageKind>(initialError?'error':'idle');
  const[pending,setPending]=useState(false);
  const[passkeySupported,setPasskeySupported]=useState(false);
  const[platformAuthenticator,setPlatformAuthenticator]=useState(false);

  useEffect(()=>{
    let active=true;
    async function detectPasskey(){
      if(typeof window==='undefined'||!('PublicKeyCredential' in window))return;
      setPasskeySupported(true);
      try{
        const available=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if(active)setPlatformAuthenticator(available);
      }catch{}
    }
    detectPasskey();
    return()=>{active=false};
  },[]);

  function changeMode(next:Mode){
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setMessage('');
    setMessageKind('idle');
  }

  async function destinationForUser(userId:string){
    const supabase=createClient();
    const{data}=await supabase.from('profiles').select('onboarded_at').eq('id',userId).maybeSingle();
    return data?.onboarded_at?safeNextPath(nextPath):'/onboarding';
  }

  async function handleSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(pending)return;
    const normalizedEmail=email.trim().toLowerCase();
    setMessage('');
    setMessageKind('idle');

    if(!normalizedEmail){setMessage('Informe seu e-mail.');setMessageKind('error');return}
    if(mode!=='recuperar'&&password.length<6){setMessage('A senha precisa ter pelo menos 6 caracteres.');setMessageKind('error');return}
    if(mode==='criar'&&password!==confirmPassword){setMessage('As duas senhas precisam ser iguais.');setMessageKind('error');return}

    setPending(true);
    const supabase=createClient();
    try{
      if(mode==='entrar'){
        const{data,error}=await supabase.auth.signInWithPassword({email:normalizedEmail,password});
        if(error||!data.user){setMessage(friendlyError(error?.message||'auth failed'));setMessageKind('error');return}
        const destination=await destinationForUser(data.user.id);
        window.location.replace(destination);
        return;
      }

      if(mode==='criar'){
        const{data,error}=await supabase.auth.signUp({
          email:normalizedEmail,
          password,
          options:{emailRedirectTo:`${CANONICAL_ORIGIN}/auth/confirm?next=/onboarding`}
        });
        if(error||!data.user){setMessage(friendlyError(error?.message||'signup failed'));setMessageKind('error');return}
        if(data.user.identities?.length===0){
          setMessage('Este e-mail já possui uma conta. Use Entrar ou Esqueci minha senha.');
          setMessageKind('error');
          return;
        }
        if(!data.session){
          setMessage('O Supabase ainda está exigindo confirmação por e-mail. O link enviado agora volta sempre para devinx.com.br.');
          setMessageKind('error');
          return;
        }
        window.location.replace('/onboarding');
        return;
      }

      const callback=`${CANONICAL_ORIGIN}/auth/confirm?next=/redefinir-senha`;
      const{error}=await supabase.auth.resetPasswordForEmail(normalizedEmail,{redirectTo:callback});
      if(error){setMessage(friendlyError(error.message));setMessageKind('error');return}
      setMessage('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. O link abre somente no domínio oficial do Devinx.');
      setMessageKind('success');
    }catch{
      setMessage('A conexão falhou. Tente novamente.');
      setMessageKind('error');
    }finally{
      setPending(false);
    }
  }

  async function signInWithPasskey(){
    if(pending)return;
    setPending(true);setMessage('');setMessageKind('idle');
    try{
      const supabase=createClient();
      const{data,error}=await supabase.auth.signInWithPasskey();
      if(error||!data.user){
        setMessage(error?.code==='passkey_disabled'?'A entrada com digital ainda precisa ser ativada no Supabase.':'Não foi possível entrar com a digital/passkey. Tente novamente ou use sua senha.');
        setMessageKind('error');
        return;
      }
      const destination=await destinationForUser(data.user.id);
      window.location.replace(destination);
    }catch{
      setMessage('A autenticação do aparelho foi cancelada ou não pôde ser concluída.');
      setMessageKind('error');
    }finally{
      setPending(false);
    }
  }

  return <main className="authPage premiumAuthPage">
    <Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link>
    <section className="authCard premiumAuthCard authCardV2">
      <div className="authIntro"><small>SEU DINHEIRO, MAIS CLARO</small><h1>{mode==='entrar'?'Acesse sua conta':mode==='criar'?'Crie sua conta':'Recupere sua senha'}</h1><p>{mode==='entrar'?'Entre e continue exatamente de onde parou.':mode==='criar'?'Cadastro direto e simples.':'Você receberá um link seguro para definir uma nova senha.'}</p></div>
      {mode!=='recuperar'&&<div className="authTabs" role="tablist"><button type="button" className={mode==='entrar'?'active':''} onClick={()=>changeMode('entrar')}>Entrar</button><button type="button" className={mode==='criar'?'active':''} onClick={()=>changeMode('criar')}>Criar conta</button></div>}
      {mode==='entrar'&&passkeySupported&&<><button type="button" className="passkeyLoginButton" onClick={signInWithPasskey} disabled={pending}><span className="passkeyIcon" aria-hidden="true">◉</span><span><b>{pending?'Autenticando...':platformAuthenticator?'Entrar com digital / biometria':'Entrar com passkey'}</b><small>{platformAuthenticator?'Use a segurança do seu celular ou computador':'Use uma passkey salva neste aparelho'}</small></span></button><div className="authDivider"><span>ou use sua senha</span></div></>}
      <form onSubmit={handleSubmit} className="authFormV2" autoComplete="on">
        <label htmlFor="auth-email">E-mail<input id="auth-email" name="email" value={email} onChange={e=>setEmail(e.target.value)} type="email" required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="voce@email.com"/></label>
        {mode!=='recuperar'&&<label htmlFor="auth-password">Senha<div className="passwordField"><input id="auth-password" name="password" value={password} onChange={e=>setPassword(e.target.value)} type={showPassword?'text':'password'} minLength={6} required autoComplete={mode==='entrar'?'current-password':'new-password'} autoCapitalize="none" spellCheck={false} placeholder="Digite sua senha"/><button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Ocultar':'Mostrar'}</button></div></label>}
        {mode==='criar'&&<label htmlFor="auth-confirm-password">Confirmar senha<input id="auth-confirm-password" name="confirmPassword" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} type={showPassword?'text':'password'} minLength={6} required autoComplete="new-password" autoCapitalize="none" spellCheck={false} placeholder="Digite a mesma senha novamente"/></label>}
        <button className="primary authSubmit authSubmitV2" disabled={pending}>{pending?'Aguarde...':mode==='entrar'?'Entrar':mode==='criar'?'Criar conta':'Enviar link de recuperação'}</button>
      </form>
      {mode==='entrar'&&<p className="passwordManagerHint">No computador, o navegador ou gerenciador de senhas pode salvar e preencher sua senha automaticamente. O Devinx não grava sua senha no aparelho.</p>}
      {message&&<div className={`authMessage authMessageV2 ${messageKind==='success'?'success':'error'}`} role="status">{message}</div>}
      {mode==='entrar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('recuperar')}>Esqueci minha senha</button>}
      {mode==='recuperar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('entrar')}>← Voltar para entrar</button>}
    </section>
  </main>
}
