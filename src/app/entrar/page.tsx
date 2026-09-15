'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

export default function EntrarPage(){
  const[email,setEmail]=useState('');
  const[senha,setSenha]=useState('');
  const[confirmarSenha,setConfirmarSenha]=useState('');
  const[modo,setModo]=useState<'entrar'|'criar'|'recuperar'>('entrar');
  const[aviso,setAviso]=useState('');
  const[carregando,setCarregando]=useState(false);

  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('erro')==='link-invalido')setAviso('Esse link de recuperação é inválido ou expirou. Solicite um novo abaixo.')},[]);

  async function destinoAposLogin(userId:string){
    const supabase=createClient();
    const{data}=await supabase.from('profiles').select('onboarded_at').eq('id',userId).single();
    const next=new URLSearchParams(window.location.search).get('next');
    const safeNext=next&&next.startsWith('/')&&!next.startsWith('//')?next:null;
    if(!data?.onboarded_at)return'/onboarding';
    return safeNext||'/painel';
  }

  async function enviar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setAviso('');
    if(modo==='criar'&&senha!==confirmarSenha){setAviso('As senhas não coincidem.');return}
    setCarregando(true);
    const supabase=createClient();

    if(modo==='recuperar'){
      const callback=`${window.location.origin}/auth/confirm?next=/redefinir-senha`;
      const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:callback});
      setCarregando(false);
      if(error){setAviso('Não foi possível enviar o link de recuperação. Tente novamente.');return}
      setAviso('Se este e-mail estiver cadastrado, você receberá um link seguro para criar uma nova senha.');
      return;
    }

    const resposta=modo==='entrar'?await supabase.auth.signInWithPassword({email,password:senha}):await supabase.auth.signUp({email,password:senha});
    setCarregando(false);
    if(resposta.error){setAviso(resposta.error.message);return}
    const user=resposta.data.user;
    if(!user){setAviso('Não foi possível concluir o acesso.');return}
    if(modo==='criar'&&!resposta.data.session){setAviso('A conta foi criada, mas a confirmação de e-mail ainda está ativa no Supabase.');return}
    window.location.href=await destinoAposLogin(user.id);
  }

  function trocarModo(novo:'entrar'|'criar'|'recuperar'){setModo(novo);setAviso('');setSenha('');setConfirmarSenha('')}
  const titulo=modo==='entrar'?'Bem-vindo de volta':modo==='criar'?'Crie sua conta':'Recuperar senha';
  const descricao=modo==='entrar'?'Entre para continuar organizando sua vida financeira.':modo==='criar'?'Crie sua conta em poucos segundos.':'Informe seu e-mail e enviaremos um link seguro para criar uma nova senha.';

  return <main className="authPage"><Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link><section className="authCard"><small>SEU DINHEIRO, MAIS CLARO</small><h1>{titulo}</h1><p>{descricao}</p><form onSubmit={enviar}><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email"/></label>{modo!=='recuperar'&&<label>Senha<input type="password" minLength={6} required value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={modo==='entrar'?'current-password':'new-password'}/></label>}{modo==='criar'&&<label>Confirmar senha<input type="password" minLength={6} required value={confirmarSenha} onChange={e=>setConfirmarSenha(e.target.value)} placeholder="Digite a senha novamente" autoComplete="new-password"/></label>}<button className="primary authSubmit" disabled={carregando}>{carregando?'Aguarde...':modo==='entrar'?'Entrar':modo==='criar'?'Criar conta':'Enviar link de recuperação'}</button></form>{aviso&&<div className="authMessage">{aviso}</div>}{modo==='entrar'&&<button className="authSwitch" onClick={()=>trocarModo('recuperar')}>Esqueci minha senha</button>}<button className="authSwitch" onClick={()=>trocarModo(modo==='criar'?'entrar':modo==='entrar'?'criar':'entrar')}>{modo==='criar'?'Já tenho uma conta':modo==='entrar'?'Ainda não tenho conta':'Voltar para entrar'}</button></section></main>
}
