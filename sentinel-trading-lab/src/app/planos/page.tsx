import Link from 'next/link';
import styles from '../landing.module.css';
import {LanguageSwitcher,T} from '../../components/SentinelLocale';
import {sentinelCheckoutUrl} from '../../lib/commercial';
import LocalizedPlans from './LocalizedPlans';

export default function PlansPage(){
  // Both checkouts are validated server-side. Language controls which is shown.
  const brCheckout=sentinelCheckoutUrl('BR');
  const intlCheckout=sentinelCheckoutUrl('INTL');
  return <main className={styles.page}>
    <div className={styles.ambient} aria-hidden="true"/>
    <header className={styles.nav}><Link href="/" className={styles.brand}><span className={styles.brandIcon}>S</span><span><strong>SENTINEL</strong><small>TRADING LAB</small></span></Link><LanguageSwitcher/><Link href="/login" className={styles.navLogin}><T>Entrar ↗</T></Link></header>
    <section className={styles.plansHero}>
      <span className={styles.kicker}><T>SEU SENTINEL · ACESSO POR 30 DIAS</T></span>
      <h1><T>Seu mercado. Seu analista.</T><em><T> Um único plano.</T></em></h1>
      <p><T>O Agent analisa no PC e transmite o acompanhamento ao card do Sentinel no celular. Os alertas CALL/PUT e reversões ajudam na leitura, mas não executam ordens.</T></p>
      <LocalizedPlans brCheckout={brCheckout} intlCheckout={intlCheckout}/>
      <Link href="/" className={styles.plansBack}><T>← Voltar à apresentação</T></Link>
    </section>
  </main>;
}
