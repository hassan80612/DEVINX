"use client";

import {useI18n} from "@/i18n/provider";
import styles from "./LaserHomeCard.module.css";

const BR={
  eyebrow:"DEVINX LASER CONTROL · CONTROLE REMOTO LIGHTBURN",
  title:"Controle seu LightBurn de onde quiser.",
  text:"Tela ao vivo, comandos remotos e mentoria em um ambiente criado para quem trabalha com laser. Use no celular, tablet ou em outro computador.",
  primary:"Conhecer Laser Control",secondary:"Já tenho acesso",guide:"Guia completo",
  featureTitle:"LASER CONTROL · CONTROLE, MENTORIA E FERRAMENTAS",
  features:["Tela do LightBurn ao vivo","Controle por celular ou computador","Toque, mouse e teclado DevinX","Frame, Iniciar, Pausar e Parar","Zoom, tela cheia e orientação","Salvar, Desfazer, Refazer e Importar","Preview e ferramentas de imagem","Rotativo e comandos do LightBurn","Mentoria professor e aluno","Código temporário de sessão","Agent Windows com inicialização automática","Sessão remota com controle de acesso"]
} as const;
const INTL={
  eyebrow:"DEVINX LASER CONTROL · REMOTE LIGHTBURN",
  title:"Control your LightBurn from anywhere.",
  text:"Live view, remote commands and mentoring in one workspace built for laser professionals. Use it from your phone, tablet or another computer.",
  primary:"Explore Laser Control",secondary:"I already have access",guide:"Complete guide",
  featureTitle:"LASER CONTROL · REMOTE CONTROL, MENTORING & TOOLS",
  features:["Live LightBurn screen","Control from phone or computer","Touch, mouse and DevinX keyboard","Frame, Start, Pause and Stop","Zoom, fullscreen and orientation","Save, Undo, Redo and Import","Preview and image tools","Rotary and LightBurn commands","Teacher-to-student mentoring","Temporary session code","Windows Agent with auto-start","Server-controlled remote access"]
} as const;

export function LaserHomeCard(){
  const{locale}=useI18n();
  const c=locale==="pt-BR"?BR:INTL;
  return <section id="laser-control" className={styles.shell} lang={locale==="pt-BR"?"pt-BR":"en"} aria-label="DevinX Laser Control">
    <div className={styles.glow} aria-hidden="true"/>
    <div className={styles.independent}>
      <b>{locale==="pt-BR"?"PRODUTO INDEPENDENTE":"INDEPENDENT PRODUCT"}</b>
      <span>{locale==="pt-BR"?"Controle remoto + mentoria":"Remote control + mentoring"}</span>
    </div>
    <div className={styles.copy}>
      <span className={styles.tag}><i></i>{c.eyebrow}</span>
      <h2>{c.title}</h2>
      <p>{c.text}</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="/laser-control/conhecer" aria-label={c.primary}>{c.primary}</a>
        <a className={styles.secondary} href="/entrar?next=/laser-control">{c.secondary}</a>
      </div>
      <a className={styles.accessButton} href="/laser-control/guia">{c.guide} →</a>
    </div>
    <section className={styles.featureSection}>
      <div className={styles.featureTitle}>{c.featureTitle}</div>
      <div className={styles.featureGrid}>
        {c.features.map(item=><div className={styles.featureLine} key={item}><i aria-hidden="true"></i><strong>{item}</strong></div>)}
      </div>
    </section>
  </section>;
}
