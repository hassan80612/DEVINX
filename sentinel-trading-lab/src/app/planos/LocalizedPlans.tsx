'use client';
import styles from '../landing.module.css';
import {T,useSentinelLocale} from '../../components/SentinelLocale';

// Language chooses the advertised market and its REAL checkout, not geolocation.
// The server validates both checkout URLs before passing them to this component.
export default function LocalizedPlans({brCheckout,intlCheckout}:{brCheckout:string|null,intlCheckout:string|null}){
  const {language}=useSentinelLocale();
  const international=language==='en';
  const price=international?'US$ 50':'R$ 280';
  const checkout=international?intlCheckout:brCheckout;
  return <div className={styles.plansCard} data-testid="localized-plan-price" data-currency={international?'USD':'BRL'}>
    <div className={styles.plansTop}><div><span><T>PLANO SENTINEL</T></span><h2>Sentinel Trading Lab</h2></div><span className={styles.plansCycle}><T>RENOVAÇÃO MANUAL</T></span></div>
    <div className={styles.plansPrice}><strong>{price}</strong><span><T>/ 30 dias</T></span></div>
    <p><T>Acesso ao card, às estratégias técnicas, aos alertas de reversão e ao controle remoto do Agent instalado em seu PC.</T></p>
    <ul>
      <li><T>Leituras de mercado e alertas CALL/PUT</T></li>
      <li><T>Reversões em teste e confirmadas com indicação visual</T></li>
      <li><T>Card responsivo para celular e computador</T></li>
      <li><T>Agent Windows e conexão de leitura com IQ Option / Exnova</T></li>
      <li><T>Estratégias, conta e gerenciamento do dispositivo</T></li>
    </ul>
    {checkout?<a className={styles.primary} href={checkout} rel="noopener noreferrer"><T>Comprar 30 dias na Kiwify ↗</T></a>:<div className={styles.plansPending} role="status"><strong><T>Pagamento em preparação</T></strong><span><T>O checkout desta moeda ainda não está disponível.</T></span></div>}
    <small className={styles.plansFootnote}><T>Sem promessa de lucros. Trading envolve risco de perda. Não há cobrança automática: uma nova compra confirmada acrescenta 30 dias ao prazo. Confira o valor final e as condições na Kiwify.</T></small>
    <div style={{marginTop:12,fontSize:12,opacity:.75}}>{international?'International billing · USD':'Pagamento Brasil · BRL'}</div>
  </div>;
}
