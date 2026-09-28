'use client';

import {LanguageMenu} from '@/components/LanguageMenu';
import {useI18n} from '@/i18n/provider';
import {guideCopy} from './guide-copy';
import styles from './page.module.css';

const DOWNLOAD='https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.31/DevinX-Laser-Agent-1.0.31.exe';
const SUPPORT={
  "pt-BR":"Suporte por e-mail",en:"Email support",es:"Soporte por correo",
  fr:"Support par e-mail",de:"E-Mail-Support",ar:"الدعم عبر البريد"
} as const;

export function LaserGuideContent(){
  const{locale}=useI18n();
  const c=guideCopy[locale];

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroTop}>
        <div>
          <small>{c.eyebrow}</small>
          <div className={styles.version}>{c.version}</div>
        </div>
        <div className={styles.language}>
          <span>{c.language}</span>
          <LanguageMenu/>
        </div>
      </div>

      <h1>{c.title}</h1>
      <p>{c.lead}</p>

      <div className={styles.actions}>
        <a className={styles.primary} href={DOWNLOAD} download>{c.download}</a>
        <a className={styles.secondary} href="/laser-control">{c.open}</a>
        <a className={styles.secondary} href={`mailto:vetorizeai.1@gmail.com?subject=DevinX%20Laser%20Control%20Support&body=Agent%20version:%0ALightBurn%20version:%0AWindows:%0AIssue:%0A`}>{SUPPORT[locale]}</a>
      </div>

      <div className={styles.warning}>⚠ {c.warning}</div>
    </section>

    {c.sections.map((section,index)=><section className={styles.block} key={section.title}>
      <div className={styles.blockHead}>
        <span>{String(index+1).padStart(2,'0')}</span>
        <div>
          <h2>{section.title}</h2>
          {section.lead&&<p>{section.lead}</p>}
        </div>
      </div>
      <div className={styles.grid}>
        {section.items.map((item,itemIndex)=><article key={itemIndex}>
          <b>{item.title}</b>
          <p>{item.text}</p>
        </article>)}
      </div>
    </section>)}

    <section className={styles.footerNote}>{c.footer}</section>
  </main>;
}
