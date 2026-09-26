'use client';

import {LanguageMenu} from '@/components/LanguageMenu';
import {useI18n} from '@/i18n/provider';
import {LASER_COPY} from '@/features/laser-control/content';
import {LASER_CONTROL_CONFIG,LASER_PLANS,laserPrice,type BillingCurrency} from '@/features/laser-control/config';
import styles from './LaserControlLanding.module.css';

export function LaserControlLanding(){
  const{locale}=useI18n();
  const c=LASER_COPY[locale];
  const currency:BillingCurrency=locale==='pt-BR'?'BRL':'USD';
  const format=(value:number)=>new Intl.NumberFormat(locale,{style:'currency',currency,minimumFractionDigits:2}).format(value);

  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.brand} href="/">
        <span className={styles.brandMark}>DX</span>
        <span><b>{LASER_CONTROL_CONFIG.productShortName}</b><small>by DEVINX</small></span>
      </a>
      <LanguageMenu/>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}>\n        <div className={styles.masterOnly}>MASTER ONLY · SAFE MODE · REMOTE COMMANDS OFF</div>
        <span className={styles.eyebrow}>{c.eyebrow}</span>
        <h1>{c.title}<br/><em>{c.accent}</em></h1>
        <p>{c.lead}</p>
        <div className={styles.heroActions}>
          <a className={styles.primary} href="#planos">{c.viewPlans}</a>
          <a className={styles.secondary} href="#como-funciona">{c.howItWorks}</a>
        </div>
        <div className={styles.trustRow}>
          <span>● {c.online}</span><span>Windows Agent</span><span>Mobile-first</span>
        </div>
      </div>

      <div className={styles.controllerShell} aria-label="Laser Control preview">
        <div className={styles.controllerTop}>
          <div><span className={styles.statusDot}></span><b>{c.lightburn}</b></div>
          <small>{c.online}</small>
        </div>
        <div className={styles.connectionStrip}><span>PC</span><i></i><span>{c.agent}</span></div>
        <div className={styles.jobCard}>
          <small>{c.currentFile}</small>
          <strong>copo-360.lbrn2</strong>
          <span>{c.ready}</span>
        </div>
        <div className={styles.commandGrid}>
          <button type="button" className={styles.frameButton} disabled>{c.frame}</button>
          <button type="button" className={styles.startButton} disabled>{c.start}<small> 🔒</small></button>
          <button type="button" className={styles.pauseButton} disabled>{c.pause}</button>
          <button type="button" className={styles.stopButton} disabled>{c.stop}</button>
        </div>
        <div className={styles.armNote}><b>{c.protectedStart}</b><span>{c.localArm}</span></div>
      </div>
    </section>

    <section id="como-funciona" className={styles.section}>
      <div className={styles.sectionHead}><span>01</span><div><h2>{c.architectureTitle}</h2><p>{c.architectureLead}</p></div></div>
      <div className={styles.flow}>
        {[['01',c.phone],['02',c.cloud],['03',c.pc],['04',c.machine]].map(([n,label],index)=>
          <div className={styles.flowStep} key={n}><small>{n}</small><strong>{label}</strong>{index<3&&<i>→</i>}</div>
        )}
      </div>
    </section>

    <section id="seguranca" className={styles.section}>
      <div className={styles.sectionHead}><span>02</span><div><h2>{c.securityTitle}</h2><p>{c.securityLead}</p></div></div>
      <div className={styles.securityGrid}>
        {[c.s1,c.s2,c.s3,c.s4,c.s5,c.s6].map((item,index)=><article key={item}><span>{String(index+1).padStart(2,'0')}</span><strong>{item}</strong></article>)}
      </div>
    </section>

    <section id="planos" className={styles.section}>
      <div className={styles.sectionHead}><span>03</span><div><h2>{c.pricingTitle}</h2><p>{c.pricingLead}</p></div></div>
      <div className={styles.planGrid}>
        {LASER_PLANS.map((plan,index)=>{
          const labels=[c.starter,c.pro,c.workshop];
          return <article className={index===1?styles.planFeatured:styles.plan} key={plan.id}>
            <div className={styles.planTop}><span>{labels[index]}</span>{index===0&&<small>{c.trial}</small>}</div>
            <strong className={styles.price}>{format(laserPrice(plan,currency))}<small>{c.month}</small></strong>
            <div className={styles.planSpecs}>
              <span><b>{plan.pcs}</b> {c.pcs}</span>
              <span><b>{plan.machines}</b> {c.machines}</span>
              <span><b>{plan.mobileDevices}</b> {c.phones}</span>
              <span><b>{plan.activeOperators}</b> {c.operators}</span>
            </div>
            <button type="button" disabled>{c.checkoutSoon}</button>
          </article>;
        })}
      </div>
      <p className={styles.pricingNote}>{c.note}</p>
    </section>

    <footer className={styles.footer}>{c.footer}</footer>
  </main>;
}
