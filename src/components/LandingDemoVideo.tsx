'use client';

import {useId,useRef,useState} from 'react';
import styles from './LandingDemoVideo.module.css';

const VIDEO_URL='/media/devinx-demonstracao-pt.mp4';

export function LandingDemoVideo(){
  const panelId=useId();
  const videoRef=useRef<HTMLVideoElement>(null);
  const[expanded,setExpanded]=useState(false);
  const[hasOpened,setHasOpened]=useState(false);
  const[failed,setFailed]=useState(false);

  function toggle(){
    if(expanded)videoRef.current?.pause();
    else setHasOpened(true);
    setExpanded(!expanded);
  }

  return <div className={styles.demo}>
    <button
      type="button"
      className={styles.toggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={toggle}
    >
      <span className={styles.playIcon} aria-hidden="true">▶</span>
      <span className={styles.label}>
        <strong>Ver o DevinX funcionando</strong>
        <small>Demonstração real · 2 min</small>
      </span>
      <span className={styles.action}>{expanded?'Recolher':'Expandir'}</span>
      <svg className={styles.chevron} viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <div id={panelId} className={styles.panel} hidden={!expanded}>
      {hasOpened&&<video
        ref={videoRef}
        className={styles.video}
        src={VIDEO_URL}
        poster="/media/devinx-demonstracao-pt.webp"
        width="720"
        height="1282"
        controls
        playsInline
        preload="none"
        aria-label="Demonstração do DevinX em português"
        onError={()=>setFailed(true)}
      >
        Seu navegador não reproduz este vídeo. <a href={VIDEO_URL}>Abrir demonstração</a>.
      </video>}
      {failed&&<p className={styles.fallback} role="status">Não foi possível carregar o vídeo. <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer">Abrir demonstração</a></p>}
    </div>
  </div>;
}
