import Link from 'next/link';
import {headers} from 'next/headers';
import styles from '../landing.module.css';
import {LanguageSwitcher,T} from '../../components/SentinelLocale';
import {SENTINEL_PLANS,sentinelCheckoutUrl,sentinelMarket} from '../../lib/commercial';

export const dynamic='force-dynamic';

export default async function PlansPage({searchParams}:{searchParams:Promise<{market?:string}>}){
  const params=await searchParams;
  const hdr=await headers();
  const market=sentinelMarket(params?.market,hdr.get('x-vercel-ip-country'));
  const plan=SENTINEL_PLANS[market];
  const checkout=sentinelCheckoutUrl(market);
  return <main className={styles.page}>
    <div className={styles.ambient} aria-hidden="true"/>
    <header className={styles.nav}><Link href="/" className={styles.brand}><span className={styles.brandIcon}>S</span><span><strong>SENTINEL</strong><small>TRADING LAB</small></span></Link><LanguageSwitcher/><Link href="/login" className={styles.navLogin}><T>Entrar ↗</T></Link></header>
    <section className={styles.plansHero}>
      <span className={styles.kicker}><T>SEU SENTINEL · ACESSO POR 30 DIAS</T></span>
      <h1><T>Seu mercado. Seu analista.</T><br/><em><T>Um único plano.</T></em></h1>
      <p><T>O Agent analisa no PC e transmite o acompanhamento ao card do Sentinel no celular. Os alertas CALL/PUT e reversões ajudam na leitura, mas não executam ordens.</T></p>
      <div className={styles.plansMarketChooser} role="group" aria-label="Região de compra / Purchase region">
        <Link href="/planos?market=br" aria-current={market==='BR'?'page':undefined} className={market==='BR'?styles.marketActive:styles.marketOption}><T>Brasil · R$ 280</T></Link>
        <Link href="/planos?market=intl" aria-current={market==='INTL'?'page':undefined} className={market==='INTL'?styles.marketActive:styles.marketOption}><T>Internacional · US$ 50</T></Link>
      </div>
      <div className={styles.plansCard}>
        <div className={styles.plansTop}><div><span><T>PLANO SENTINEL</T></span><h2>{plan.name}</h2></div><span className={styles.plansCycle}><T>RENOVAÇÃO MANUAL</T></span></div>
        <div className={styles.plansPrice}><strong>{plan.priceDisplay}</strong><span><T>/ 30 dias</T></span></div>
        <p><T>Acesso ao card, às estratégias técnicas, aos alertas de reversão e ao controle remoto do Agent instalado em seu PC.</T></p>
        <ul><li><T>Leituras de mercado e alertas CALL/PUT</T></li><li><T>Reversões em teste e confirmadas com indicação visual</T></li><li><T>Card responsivo para celular e computador</T></li><li><T>Agent Windows e conexão de leitura com IQ Option / Exnova</T></li><li><T>Estratégias, conta e gerenciamento do dispositivo</T></li></ul>
        {checkout?<a className={styles.primary} href={checkout} rel="noopener noreferrer"><T>Comprar 30 dias na Kiwify ↗</T></a>:<div className={styles.plansPending} role="status"><strong><T>Pagamento em preparação</T></strong><span><T>O produto está sendo configurado na Kiwify. O botão de assinatura será disponibilizado após vincular o checkout oficial.</T></span></div>}
        <small className={styles.plansFootnote}><T>Sem promessa de lucros. Trading envolve risco de perda. Não há cobrança automática: uma nova compra confirmada acrescenta 30 dias ao prazo. Confira o valor final e as condições na Kiwify.</T></small>
      </div>
      <Link href="/" className={styles.plansBack}><T>← Voltar à apresentação</T></Link>
    </section>
  </main>
}
