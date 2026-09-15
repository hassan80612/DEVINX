'use client';

import {useActionState,useState} from 'react';
import Link from 'next/link';
import {initialAuthState,login,recoverPassword,signup} from './actions';

type Mode='entrar'|'criar'|'recuperar';

export function AuthForm({nextPath='',initialError=''}:{nextPath?:string;initialError?:string}){
  const[mode,setMode]=useState<Mode>(initialError?'recuperar':'entrar');
  const[showPassword,setShowPassword]=useState(false);
  const[localError,setLocalError]=useState(initialError);
  const[loginState,loginAction,loginPending]=useActionState(login,initialAuthState);
  const[signupState,signupAction,signupPending]=useActionState(signup,initialAuthState);
  const[recoverState,recoverAction,recoverPending]=useActionState(recoverPassword,initialAuthState);

  const currentState=mode==='entrar'?loginState:mode==='criar'?signupState:recoverState;
  const pending=mode==='entrar'?loginPending:mode==='criar'?signupPending:recoverPending;
  const action=mode==='entrar'?loginAction:mode==='criar'?signupAction:recoverAction;
  const message=localError||currentState.message;
  const messageKind=localError?'error':currentState.kind;

  function changeMode(next:Mode){
    setMode(next);
    setShowPassword(false);
    setLocalError('');
  }

  return <main className="authPage premiumAuthPage">
    <Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link>

    <section className="authCard premiumAuthCard authCardV2">
      <div className="authIntro">
        <small>SEU DINHEIRO, MAIS CLARO</small>
        <h1>{mode==='entrar'?'Acesse sua conta':mode==='criar'?'Crie sua conta':'Recupere sua senha'}</h1>
        <p>{mode==='entrar'?'Entre e continue exatamente de onde parou.':mode==='criar'?'Cadastro simples, sem confirmação desnecessária por e-mail.':'Você receberá um link seguro para definir uma nova senha.'}</p>
      </div>

      {mode!=='recuperar'&&<div className="authTabs" role="tablist">
        <button type="button" className={mode==='entrar'?'active':''} onClick={()=>changeMode('entrar')}>Entrar</button>
        <button type="button" className={mode==='criar'?'active':''} onClick={()=>changeMode('criar')}>Criar conta</button>
      </div>}

      <form action={action} className="authFormV2" autoComplete="on">
        <input type="hidden" name="next" value={nextPath}/>
        <label htmlFor="auth-email">E-mail
          <input id="auth-email" name="email" type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="voce@email.com"/>
        </label>

        {mode!=='recuperar'&&<label htmlFor="auth-password">Senha
          <div className="passwordField">
            <input id="auth-password" name="password" type={showPassword?'text':'password'} minLength={6} required autoComplete={mode==='entrar'?'current-password':'new-password'} autoCapitalize="none" spellCheck={false} placeholder="Digite sua senha"/>
            <button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Ocultar':'Mostrar'}</button>
          </div>
        </label>}

        {mode==='criar'&&<label htmlFor="auth-confirm-password">Confirmar senha
          <input id="auth-confirm-password" name="confirmPassword" type={showPassword?'text':'password'} minLength={6} required autoComplete="new-password" autoCapitalize="none" spellCheck={false} placeholder="Digite a mesma senha novamente"/>
        </label>}

        <button className="primary authSubmit authSubmitV2" disabled={pending}>
          {pending?'Aguarde...':mode==='entrar'?'Entrar':mode==='criar'?'Criar conta':'Enviar link de recuperação'}
        </button>
      </form>

      {message&&<div className={`authMessage authMessageV2 ${messageKind==='success'?'success':'error'}`} role="status">{message}</div>}

      {mode==='entrar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('recuperar')}>Esqueci minha senha</button>}
      {mode==='recuperar'&&<button className="authLinkButton" type="button" onClick={()=>changeMode('entrar')}>← Voltar para entrar</button>}
    </section>
  </main>;
}
