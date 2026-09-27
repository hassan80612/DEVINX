'use client';

import {useState} from 'react';
import Link from 'next/link';
import styles from './LaserQuickConnect.module.css';
import {useI18n} from '@/i18n/provider';

export function LaserQuickConnect({code,deviceName}:{code:string;deviceName:string}){
  const{t}=useI18n();
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
          ?t('laser.mentorExpired')
          :t('laser.commandFail'));
        return;
      }
      setDone(true);
      setMessage(t('laser.pcLinked'));
    }catch{
      setMessage(t('laser.commandFail'));
    }finally{
      setPending(false);
    }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <span className={styles.badge}>{t('laser.eyebrow')}</span>
      <h1>{done?t('laser.pcLinked'):t('laser.pair')}</h1>
      <p>{t('laser.permanentDesc')}</p>

      <div className={styles.device}>
        <small>PC</small>
        <strong>{deviceName}</strong>
        <span>{t('laser.agentSafety')}</span>
      </div>

      {!done&&<button className={styles.primary} type="button" onClick={()=>void connect()} disabled={pending}>
        {pending?t('laser.pairing'):t('laser.pair')}
      </button>}

      {message&&<div className={done?styles.success:styles.error}>{message}</div>}
      <Link className={styles.link} href="/laser-control">{t('laser.title')}</Link>
      <small className={styles.safe}>SAFE MODE · {t('laser.commandSafety')}</small>
    </section>
  </main>;
}
