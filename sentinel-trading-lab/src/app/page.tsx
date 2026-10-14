'use client';
import Link from 'next/link';
import {LanguageSwitcher,useSentinelLocale} from '../components/SentinelLocale';
import styles from './launch-home.module.css';

export default function Home(){
 const {language}=useSentinelLocale();
 const english=language==='en';
 const copy=english?{
  eyebrow:'PROFESSIONAL MARKET ANALYSIS SOFTWARE',
  heading:'Your technical market analyst, alongside your decisions.',
  lead:'Sentinel Trading Lab combines real-time quotes, completed market structure, trends, retracements and projected CALL/PUT scenarios into one clear view. Instead of switching between tools, focus on what the market is doing and your chosen entry and expiry.',
  brokerIntro:'READS MARKET DATA FROM',
  call:'Buy 30-day access',login:'Sign in',create:'Create my account',
  price:'US$ 50',cycle:'30 days · manual renewal',
  bullets:[['Forward scenarios','Price and time projections for your selected expiry.'],['Trend & reversal context','Completed-candle structure, retracements and directional changes.'],['Live dashboard','Windows Agent and the same account on PC or mobile.']],
  how:'A straightforward way to start',steps:[['01','Purchase','Complete the secure Kiwify checkout.'],['02','Create your account','Use the SAME email address as on your payment.'],['03','Connect','Install the Windows Agent, sign in and choose your broker.']],
  disclaimer:'Professional analysis software, not a guarantee of accuracy, profit, or suitable investment advice. Trades are placed manually. IQ Option and Exnova are independent trademarks; Sentinel is not affiliated with or endorsed by them.',
  renew:'One payment gives 30 days of access. No automatic renewal.',
  sample:'Illustrative layout — not an actual signal',see:'What your analyst examines',
  quote:'MARKET CONTEXT',status:'Technical view',security:'Individual login + valid access period',
  terms:'Terms of use',privacy:'Privacy'
 }:{
  eyebrow:'SOFTWARE PROFISSIONAL DE ANÁLISE DE MERCADO',
  heading:'Seu analista técnico de mercado, ao lado das suas decisões.',
  lead:'O Sentinel Trading Lab reúne cotações em tempo real, estrutura anterior do mercado, tendências, retrações e projeções de cenários CALL/PUT em uma leitura objetiva. Você acompanha o comportamento do ativo e o momento previsto para entrada e vencimento, sem precisar alternar entre várias ferramentas.',
  brokerIntro:'ANÁLISE PARA OS MERCADOS DE',
  call:'Comprar acesso por 30 dias',login:'Entrar',create:'Criar minha conta',
  price:'R$ 280',cycle:'30 dias · renovação manual',
  bullets:[['Cenários futuros','Projeções de preço e horário para o vencimento escolhido.'],['Tendências e reversões','Leitura da estrutura das velas concluídas, retrações e possíveis viradas.'],['Painel ao vivo','Agent Windows e acompanhamento na mesma conta pelo PC ou celular.']],
  how:'Como começar sem complicação',steps:[['01','Compre','Finalize o pagamento seguro na Kiwify.'],['02','Crie sua conta','Use o MESMO e-mail informado no pagamento.'],['03','Conecte','Instale o Agent Windows, entre na conta e escolha a corretora.']],
  disclaimer:'Não garante assertividade nem ganhos. Software de análise profissional, sem promessa de lucro ou aconselhamento personalizado. Operações são manuais e podem gerar perdas. IQ Option e Exnova são marcas de terceiros; o Sentinel não é afiliado ou endossado por elas.',
  renew:'Pagamento único para 30 dias de acesso. Sem renovação automática.',
  sample:'Visual ilustrativo — não é sinal de entrada',see:'O que o analista acompanha',
  quote:'CONTEXTO DO MERCADO',status:'Leitura técnica',security:'Login individual + acesso vigente',
  terms:'Termos de uso',privacy:'Privacidade'
 };
 const market=english?'INTL':'BR';
 const checkout='/api/checkout?market='+market;
 return <main className={styles.page}>
  <div className={styles.glow} aria-hidden="true"/>
  <header className={styles.nav}>
   <Link href="/" className={styles.brand}><span className={styles.symbol}>S</span><span><strong>SENTINEL</strong><small>TRADING LAB</small></span></Link>
   <div className={styles.navRight}><LanguageSwitcher/><Link href="/login" className={styles.login}>{copy.login}</Link></div>
  </header>

  <div className={styles.container}>
   <section className={styles.hero}>
    <div className={styles.pitch}>
     <p className={styles.eyebrow}><span className={styles.greenDot}/>{copy.eyebrow}</p>
     <h1>{copy.heading}</h1>
     <p className={styles.lead}>{copy.lead}</p>
     <div className={styles.brokers}>
      <span className={styles.brokerIntro}>{copy.brokerIntro}</span>
      <div className={styles.brokerNames}><strong className={styles.iq}>IQ <span>OPTION</span></strong><strong className={styles.exnova}>EXNOVA</strong></div>
     </div>
     <div className={styles.purchase}>
      <div className={styles.priceInfo}><span className={styles.price}>{copy.price}</span><span className={styles.cycle}>{copy.cycle}</span></div>
      <Link href={checkout} className={styles.buy}>{copy.call} <span aria-hidden="true">↗</span></Link>
     </div>
     <div className={styles.afterBuy}><span>{copy.renew}</span><Link href="/login?mode=register">{copy.create} →</Link></div>
     <a href="https://devinx.com.br" className={styles.devinxButton}>{english?'Discover DevinX':'Conheça o DevinX'} <span aria-hidden="true">↗</span></a>
    </div>
    <aside className={styles.showcase} aria-label={copy.sample}>
     <div className={styles.showcaseTop}><span className={styles.showcaseLogo}>S</span><div><strong>SENTINEL ANALYST</strong><small>{copy.quote}</small></div><span className={styles.sample}>DEMO</span></div>
     <div className={styles.chart}>
      <div className={styles.chartTop}><span>EUR/USD</span><small>01:00</small></div>
      <svg width="100%" height="150" viewBox="0 0 470 150" role="img" aria-label={english?'Illustrative market price chart':'Gráfico ilustrativo de preço'}>
       <defs><linearGradient id="lineSentinel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cdb777" stopOpacity=".42"/><stop offset="100%" stopColor="#cdb777" stopOpacity="0"/></linearGradient></defs>
       <path d="M0 25 H470 M0 73 H470 M0 120 H470" stroke="#345651" strokeWidth="1" strokeDasharray="3 6"/>
       <path d="M0 113 L27 95 L54 103 L84 67 L112 76 L140 57 L167 69 L195 43 L224 52 L250 30 L281 43 L306 64 L335 60 L362 85 L391 69 L419 74 L445 42 L470 53 L470 150 L0 150 Z" fill="url(#lineSentinel)"/>
       <path d="M0 113 L27 95 L54 103 L84 67 L112 76 L140 57 L167 69 L195 43 L224 52 L250 30 L281 43 L306 64 L335 60 L362 85 L391 69 L419 74 L445 42 L470 53" fill="none" stroke="#e4cc89" strokeWidth="3" strokeLinecap="round"/>
       <path d="M0 96 H470" stroke="#2da486" strokeDasharray="5 6" strokeOpacity=".55"/>
      </svg>
      <div className={styles.chartLegend}>{copy.sample}</div>
     </div>
     <div className={styles.analysisCards}>
      <div><small>{copy.status}</small><strong>{english?'STRUCTURE + TREND':'ESTRUTURA + TENDÊNCIA'}</strong></div>
      <div><small>{english?'Expiry':'Vencimento'}</small><strong>01:00</strong></div>
     </div>
     <div className={styles.monitor}><span className={styles.greenDot}/>{copy.security}</div>
    </aside>
   </section>

   <section className={styles.valueBar} aria-label={copy.see}>
    <div className={styles.barHeading}>{copy.see}</div>
    <div className={styles.values}>{copy.bullets.map(([name,description])=><article key={name}><strong>{name}</strong><p>{description}</p></article>)}</div>
   </section>
   <section className={styles.steps} aria-label={copy.how}>
    <h2>{copy.how}</h2><div className={styles.stepItems}>{copy.steps.map(([n,title,description])=><div key={n}><span>{n}</span><div><strong>{title}</strong><p>{description}</p></div></div>)}</div>
   </section>
   <footer className={styles.footer}><p>{copy.disclaimer}</p><div><Link href="/termos">{copy.terms}</Link><Link href="/privacidade">{copy.privacy}</Link><a href="https://devinx.com.br">DevinX</a></div></footer>
  </div>
 </main>
}
