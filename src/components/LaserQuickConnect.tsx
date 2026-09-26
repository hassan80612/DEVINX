'use client';

import {useState} from 'react';
import Link from 'next/link';
import styles from './LaserQuickConnect.module.css';

export function LaserQuickConnect({code,deviceName}:{code:string;deviceName:string}){
  const[pending,setPending]=useState(false);
  const[done,setDone]=useState(false);
  const[message,setMessage]=useState('');

  async function connect(){
    if(pending||done)return;
    setPending(true);
    setMessage('');
    try{
      const response=await fetch('/api/laser-control/master/claim',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pairingCode:code,displayName:deviceName})
      });
      const data=await response.json();
      if(!response.ok||!data?.claimed){
        setMessage(data?.reason==='not_found_or_expired'
          ?'A solicitação expirou. Feche esta página e abra o Agent novamente.'
          :'Não foi possível vincular este PC.');
        return;
      }
      setDone(true);
      setMessage('PC vinculado com sucesso. Você já pode voltar ao Laser Control.');
    }catch{
      setMessage('Falha de conexão. Tente novamente.');
    }finally{
      setPending(false);
    }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <span className={styles.badge}>DEVINX LASER CONTROL</span>
      <h1>{done?'PC conectado':'Vincular este PC?'}</h1>
      <p>{done
        ?'O Agent recebeu autorização da sua conta Master.'
        :'O DevinX encontrou uma solicitação do Agent neste computador.'}</p>

      <div className={styles.device}>
        <small>COMPUTADOR</small>
        <strong>{deviceName}</strong>
        <span>O acesso pode ser revogado depois pela sua Master.</span>
      </div>

      {!done&&<button className={styles.primary} type="button" onClick={()=>void connect()} disabled={pending}>
        {pending?'Vinculando…':'Vincular este PC'}
      </button>}

      {message&&<div className={done?styles.success:styles.error}>{message}</div>}
      <Link className={styles.link} href="/laser-control">Abrir painel Laser Control</Link>
      <small className={styles.safe}>SAFE MODE · comandos físicos continuam desligados</small>
    </section>
  </main>;
}
