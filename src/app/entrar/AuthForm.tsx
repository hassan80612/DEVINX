'use client';

import {useActionState,useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {login,recoverPassword,signup,type AuthState} from './actions';

type Mode='entrar'|'criar'|'recuperar';
const initialAuthState:AuthState={kind:'idle',message:''};

function safeNextPath(value:string){
  return value.startsWith('/')&&!value.startsWith('//')?value:'/painel';
}

export function AuthForm({nextPath='',initialError=''}:{nextPath?:string;initialError?:string}){
  const[mode,setMode]=useState<Mode>(initialError?'recuperar':'entrar');
  const[showPassword,setShowPassword]=useState(false);
  const[localError,setLocalError]=useState(initialError);
  const[passkeySupported,setPasskeySupported]=useState(false);
  const[platformAuthenticator,setPlatformAuthenticator]=useState(false);
  const[passkeyPending,setPasskeyPending]=useState(false);
  const[loginState,loginAction,loginPending]=useActionState(login,initialAuthState);
  const[signupState,signupAction,signupPending]=useActionState(signup,initialAuthState);
  const[recoverState,recoverAction,recoverPending]=useActionState(recoverPassword,initialAuthState);

  useEffect(()=>{
    let active=true;
    async function detectPasskey(){
      if(typeof window==='undefined'||!('PublicKeyCredential' in window))return;
      if(!active)return;
      setPasskeySupported(true);
      try{
        const available=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if(active)setPlatformAuthenticator(available);
      }catch{}
    }
    detectPasskey();
    return()=>{active=false};
  },[]);

  const currentState=mode==='entrar'?loginState:mode==='criar'?signupState:recoverState;
  const pending=(mode==='entrar'?loginPending:mode==='criar'?signupPending:recoverPending)||passkeyPending;
  const action=mode==='entrar'?loginAction:mode==='criar'?signupAction:recoverAction;
  const message=localError||currentState.message;
  const messageKind=localError?'error':currentState.kind;

  function changeMode(next:Mode){setMode(next);setShowPassword(false);setLocalError('')}

  async function signInWithPasskey(){
    setPasskeyPending(true);setLocalError('');
    try{
      const supabase=createClient();
      const{error}=await supabase.auth.signInWithPasskey();
      if(error){setLocalError(error.code==='passkey_disabled'?'A entrada com digital ainda precisa ser ativada no Supabase.':'Não foi possível entrar com a digital/passkey. Tente novamente ou use sua senha.');return}
      window.location.assign(safeNextPath(nextPath));
    }catch{setLocalError('A autenticação do aparelho foi cancelada ou não pôde ser concluída.')}
    finally{setPasskeyPending(false)}
  }

  return <main className="authPage premiumAuthPage">
    <Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link>
    <section className="authCard premiumAuthCard authCardV2">
      <div className="authIntro"><small>SEU DINHEIRO, MAIS CLARO</small><h1>{mode==='entrar'?'Acesse sua conta':mode==='criar'?'Crie sua conta':'Recupere sua senha'}</h1><p>{mode==='entrar'?'Entre e continue exatamente de onde parou.':mode==='criar'?'Cadastro simples, sem confirmação desnecessária por e-mail.':'Você receberá um link seguro para definir uma nova senha.'}</p></div>
      {mode!=='recuperar'&&<div className="authTabs" role="tablist"><button type="button" className={mode==='entrar'?'active':''} onClick={()=>changeMode('entrar')}>Entrar</button><button type="button" className={mode==='criar'?'active':''} onClick={()=>changeMode('criar')}>Criar conta</button></div>}
      {mode==='entrar'&&passkeySupported&&<><button type="button" className="passkeyLoginButton" onClick={signInWithPasskey} disabled={passkeyPending}><span className="passkeyIcon" aria-hidden="true">◉</span><span><b>{passkeyPending?'Autenticando...':platformAuthenticator?'Entrar com digital / biometria':'Entrar com passkey'}</b><small>{platformAuthenticator?'Use a segurança do seu celular ou computador':'Use uma passkey salva neste aparelho'}</small></span></button><div className="authDivider"><span>ou use sua senha</span></div></>}
      <form action={action} className="authFormV2" autoComplete="on"><input type="hidden" name="next" value={nextPath}/><label htmlFor="auth-email">E-mail<input id="auth-email" name="email" type="email" required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="voce@email.com"/></label>{mode!=='recuperar'&&<label htmlFor="auth-password">Senha<div className="passwordField"><input id="auth-password" name="password" type={showPassword?'text':'password'} minLength={6} required autoComplete={mode==='entrar'?'current-password':'new-password'} autoCapitalize="none" spellCheck={false} placeholder="Digite sua senha"/><button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Ocultar':'Mostrar'}</button></div></label>}{mode==='criar'&&<label htmlFor="auth-confirm-password">Confirmar senha<input id="auth-confirm-password" name="confirmPassword" type={showPassword?'text':'password'} minLength={6} required autoComplete="new-password" autoCapitalize="none" spellCheck={false} placeholder="Digite a mesma senha novamente"/></label>}<button className="primary authSubmit authSubmitV2" disabled={pending}>{pending&&!passkeyPending?'Aguarde...':mode==='entrar'?'Entrar':mode==='criar'?'Criar conta':'Enviar link de recuperação'}</button></form>
      {mode==='entrar'&&<p className="passwordManagerHint">No computador, o navegador ou gerenciador de senhas pode salvar e preencher sua senha automaticamente. O Devinx não grava sua senha no aparelho.</p>}
      {message&&<div className={`authMessage authMessageV2 ${messageKind==='success'?'success':'error'}`} role="status">{message}</div>}
      {mode==='entrar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('recuperar')}>Esqueci minha senha</button>}
      {mode==='recuperar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('entrar')}>← Voltar para entrar</button>}
    </section>
  </main>
}
