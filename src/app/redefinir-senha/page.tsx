'use client';

import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

export default function RedefinirSenhaPage(){
  const[senha,setSenha]=useState('');
  const[confirmar,setConfirmar]=useState('');
  const[mostrar,setMostrar]=useState(false);
  const[aviso,setAviso]=useState('');
  const[carregando,setCarregando]=useState(false);

  async function salvar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setAviso('');
    if(senha.length<6){setAviso('Use pelo menos 6 caracteres.');return}
    if(senha!==confirmar){setAviso('As senhas não coincidem.');return}
    setCarregando(true);
    const supabase=createClient();
    const{error}=await supabase.auth.updateUser({password:senha});
    setCarregando(false);
    if(error){setAviso('Este link expirou ou a sessão de recuperação não é válida. Solicite um novo link.');return}
    window.location.replace('/painel');
  }

  return <main className="authPage premiumAuthPage">
    <Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link>
    <section className="authCard premiumAuthCard authCardV2">
      <div className="authIntro"><small>SEGURANÇA DA CONTA</small><h1>Crie sua nova senha</h1><p>Depois de salvar, você entra direto no Devinx.</p></div>
      <form className="authFormV2" onSubmit={salvar}>
        <label>Nova senha<div className="passwordField"><input type={mostrar?'text':'password'} minLength={6} required value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password"/><button type="button" onClick={()=>setMostrar(v=>!v)}>{mostrar?'Ocultar':'Mostrar'}</button></div></label>
        <label>Confirmar nova senha<input type={mostrar?'text':'password'} minLength={6} required value={confirmar} onChange={e=>setConfirmar(e.target.value)} placeholder="Digite a mesma senha novamente" autoComplete="new-password"/></label>
        <button className="primary authSubmit authSubmitV2" disabled={carregando}>{carregando?'Salvando...':'Salvar e continuar'}</button>
      </form>
      {aviso&&<div className="authMessage authMessageV2 error">{aviso}</div>}
      <Link className="authLinkButton" href="/entrar">Solicitar outro link</Link>
    </section>
  </main>;
}
