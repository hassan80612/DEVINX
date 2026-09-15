'use client';

import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';

export default function RedefinirSenhaPage(){
  const[senha,setSenha]=useState('');
  const[confirmar,setConfirmar]=useState('');
  const[aviso,setAviso]=useState('');
  const[carregando,setCarregando]=useState(false);

  async function salvar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setAviso('');
    if(senha!==confirmar){setAviso('As senhas não coincidem.');return}
    setCarregando(true);
    const supabase=createClient();
    const{error}=await supabase.auth.updateUser({password:senha});
    setCarregando(false);
    if(error){setAviso('O link expirou ou não foi possível alterar a senha. Solicite um novo link.');return}
    setAviso('Senha alterada com sucesso. Você já pode entrar.');
    setSenha('');setConfirmar('');
  }

  return <main className="authPage">
    <Link className="authBrand" href="/"><span className="mark">D</span><b>DEVINX</b></Link>
    <section className="authCard">
      <small>SEGURANÇA DA CONTA</small>
      <h1>Criar nova senha</h1>
      <p>Escolha uma nova senha para sua conta.</p>
      <form onSubmit={salvar}>
        <label>Nova senha<input type="password" minLength={6} required value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password"/></label>
        <label>Confirmar nova senha<input type="password" minLength={6} required value={confirmar} onChange={e=>setConfirmar(e.target.value)} placeholder="Digite a senha novamente" autoComplete="new-password"/></label>
        <button className="primary authSubmit" disabled={carregando}>{carregando?'Salvando...':'Salvar nova senha'}</button>
      </form>
      {aviso&&<div className="authMessage">{aviso}</div>}
      <Link className="authSwitch" href="/entrar">Voltar para entrar</Link>
    </section>
  </main>
}
