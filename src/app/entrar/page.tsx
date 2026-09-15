'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

type Mode='entrar'|'criar'|'recuperar';

type AuthResponse={ok:boolean;destination?:string;message?:string;requiresConfirmation?:boolean};

export default function EntrarPage(){
  const[email,setEmail]=useState('');
  const[senha,setSenha]=useState('');
  const[confirmarSenha,setConfirmarSenha]=useState('');
  const[mostrarSenha,setMostrarSenha]=useState(false);
  const[modo,setModo]=useState<Mode>('entrar');
  const[aviso,setAviso]=useState('');
  const[carregando,setCarregando]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('erro')==='link-invalido'){
      setModo('recuperar');
      setAviso('Esse link de recuperação é inválido ou expirou. Solicite um novo.');
    }
  },[]);

  async function enviar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setAviso('');
    const normalizedEmail=email.trim().toLowerCase();
    if(!normalizedEmail){setAviso('Informe seu e-mail.');return}
    if(modo==='criar'&&senha!==confirmarSenha){setAviso('As senhas não coincidem.');return}
    setCarregando(true);

    if(modo==='recuperar'){
      const supabase=createClient();
      const callback=`${window.location.origin}/auth/confirm?next=/redefinir-senha`;
      const{error}=await supabase.auth.resetPasswordForEmail(normalizedEmail,{redirectTo:callback});
      setCarregando(false);
      if(error){setAviso('Não foi possível enviar o link de recuperação agora.');return}
      setAviso('Se este e-mail estiver cadastrado, você receberá um link seguro para criar uma nova senha.');
      return;
    }

    try{
      const next=new URLSearchParams(window.location.search).get('next');
      const response=await fetch('/api/auth/password',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify({action:modo==='entrar'?'login':'signup',email:normalizedEmail,password:senha,next})
      });
      const data=await response.json() as AuthResponse;
      setCarregando(false);
      if(!response.ok||!data.ok){setAviso(data.message||'Não foi possível concluir o acesso.');return}
      window.location.replace(data.destination||'/painel');
    }catch{
      setCarregando(false);
      setAviso('A conexão falhou. Tente novamente.');
    }
  }

  function trocarModo(novo:Mode){setModo(novo);setAviso('');setSenha('');setConfirmarSenha('');setMostrarSenha(false)}
  const titulo=modo==='entrar'?'Bem-vindo de volta':modo==='criar'?'Crie sua conta':'Recuperar senha';
  const descricao=modo==='entrar'?'Entre para continuar organizando sua vida financeira.':modo==='criar'?'Crie sua conta em poucos segundos.':'Informe seu e-mail e enviaremos um link seguro para criar uma nova senha.';

  return <main className="authPage">
    <Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link>
    <section className="authCard premiumAuthCard">
      <small>SEU DINHEIRO, MAIS CLARO</small>
      <h1>{titulo}</h1>
      <p>{descricao}</p>
      <form onSubmit={enviar} noValidate>
        <label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" inputMode="email"/></label>
        {modo!=='recuperar'&&<label>Senha<div className="passwordField"><input type={mostrarSenha?'text':'password'} minLength={6} required value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={modo==='entrar'?'current-password':'new-password'}/><button type="button" aria-label={mostrarSenha?'Ocultar senha':'Mostrar senha'} onClick={()=>setMostrarSenha(v=>!v)}>{mostrarSenha?'Ocultar':'Mostrar'}</button></div></label>}
        {modo==='criar'&&<label>Confirmar senha<input type={mostrarSenha?'text':'password'} minLength={6} required value={confirmarSenha} onChange={e=>setConfirmarSenha(e.target.value)} placeholder="Digite a senha novamente" autoComplete="new-password"/></label>}
        <button className="primary authSubmit" disabled={carregando}>{carregando?'Aguarde...':modo==='entrar'?'Entrar':modo==='criar'?'Criar conta':'Enviar link de recuperação'}</button>
      </form>
      {aviso&&<div className="authMessage" role="status">{aviso}</div>}
      {modo==='entrar'&&<button className="authSwitch" type="button" onClick={()=>trocarModo('recuperar')}>Esqueci minha senha</button>}
      <button className="authSwitch" type="button" onClick={()=>trocarModo(modo==='criar'?'entrar':modo==='entrar'?'criar':'entrar')}>{modo==='criar'?'Já tenho uma conta':modo==='entrar'?'Ainda não tenho conta':'Voltar para entrar'}</button>
    </section>
  </main>
}
