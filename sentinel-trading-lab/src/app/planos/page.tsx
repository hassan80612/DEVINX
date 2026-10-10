import Link from 'next/link';
import styles from '../landing.module.css';
import {SENTINEL_PLAN,sentinelCheckoutUrl} from '../../lib/commercial';

export const dynamic='force-dynamic';
export default function PlansPage(){
  const checkout=sentinelCheckoutUrl();
  return <main className={styles.page}>
    <div className={styles.ambient} aria-hidden="true"/>
    <header className={styles.nav}><Link href="/" className={styles.brand}><span className={styles.brandIcon}>S</span><span><strong>SENTINEL</strong><small>TRADING LAB</small></span></Link><Link href="/login" className={styles.navLogin}>Entrar ↗</Link></header>
    <section className={styles.plansHero}>
      <span className={styles.kicker}>SEU SENTINEL · ASSINATURA MENSAL</span>
      <h1>Seu mercado. Seu analista.<br/><em>Um único plano.</em></h1>
      <p>O Agent analisa no PC e transmite o acompanhamento ao card do Sentinel no celular. Os alertas CALL/PUT e reversões ajudam na leitura, mas não executam ordens.</p>
      <div className={styles.plansCard}>
        <div className={styles.plansTop}><div><span>PLANO SENTINEL</span><h2>{SENTINEL_PLAN.name}</h2></div><span className={styles.plansCycle}>RENOVAÇÃO MENSAL</span></div>
        <div className={styles.plansPrice}><strong>US$ 50</strong><span>/ mês</span></div>
        <p>Acesso ao card, às estratégias técnicas, aos alertas de reversão e ao controle remoto do Agent instalado em seu PC.</p>
        <ul><li>Leituras de mercado e alertas CALL/PUT</li><li>Reversões em teste e confirmadas com indicação visual</li><li>Card responsivo para celular e computador</li><li>Agent Windows e conexão de leitura com IQ Option / Exnova</li><li>Estratégias, conta e gerenciamento do dispositivo</li></ul>
        {checkout?<a className={styles.primary} href={checkout} rel="noopener noreferrer">Assinar na Kiwify ↗</a>:<div className={styles.plansPending} role="status"><strong>Pagamento em preparação</strong><span>O produto está sendo configurado na Kiwify. O botão de assinatura será disponibilizado após vincular o checkout oficial.</span></div>}
        <small className={styles.plansFootnote}>Sem promessa de lucros. Trading envolve risco de perda. Confira o valor final, moeda, renovação e condições na página de pagamento antes de confirmar.</small>
      </div>
      <Link href="/" className={styles.plansBack}>← Voltar à apresentação</Link>
    </section>
  </main>
}
