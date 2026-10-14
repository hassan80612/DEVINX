'use client';
import Link from 'next/link';
import styles from './landing.module.css';
import {LanguageSwitcher,useSentinelLocale} from '../components/SentinelLocale';

export default function Home(){
 const {language}=useSentinelLocale(),en=language==='en';
 const copy=en?{
  tagline:'INDEPENDENT MARKET ANALYSIS',
  title:'Market analysis with context, not promises.',
  intro:'Follow price movement, technical scenarios, and CALL/PUT alerts from an analytical tool. You decide when and whether to trade.',
  primary:'Explore the 30-day plan',login:'Sign in',
  examples:'Illustrative product overview, not a trading signal',
  market:'Market structure',time:'Chosen expiry',control:'Your decision',
  titleFeatures:'What Sentinel does',features:[
   ['Continuous analysis','Keeps tracking price updates and technical structure.'],
   ['Entry scenarios','Displays directional scenarios and forecast timing.'],
   ['Reversals and trends','Examines continuation, retracements and possible changes in direction.'],
   ['Desktop and mobile','Use the Windows Agent and access the same account on your phone.'],
   ['Supported brokers','Reads your selected IQ Option or Exnova market.'],
   ['Manual execution','Never places trades on your behalf.']],
  titleSteps:'Simple to get started',steps:[
   ['Create your account','Choose the 30-day plan and complete checkout.'],
   ['Install the Agent','Sign in on the PC and open the broker of your choice.'],
   ['Monitor the market','Follow the analysis on your PC or phone.']],
  priceLabel:'One plan · 30 days',price:'US$ 50',priceNote:'Manual renewal, no recurring charge.',
  pricing:'See plan and checkout',
  riskTitle:'Transparent by design',risk:'Sentinel is an analytical assistant. It does not guarantee accuracy or earnings. Trading carries a significant risk of loss. It is not affiliated with IQ Option or Exnova.',
  footer:'Product developed independently. No trade execution or promised returns.',
  privacy:'Privacy',terms:'Terms'
 }:{
  tagline:'ANÁLISE INDEPENDENTE DE MERCADO',
  title:'Análise de mercado com contexto, sem promessas.',
  intro:'Acompanhe o movimento dos preços, cenários técnicos e alertas CALL/PUT em uma ferramenta de análise. Você decide se e quando operar.',
  primary:'Conhecer o plano de 30 dias',login:'Entrar',
  examples:'Visão ilustrativa do produto, não é um sinal de operação',
  market:'Estrutura do mercado',time:'Vencimento escolhido',control:'Decisão do usuário',
  titleFeatures:'O que o Sentinel oferece',features:[
   ['Análise contínua','Acompanha as atualizações de preços e a estrutura técnica.'],
   ['Cenários de entrada','Apresenta cenários de direção e horário estimado.'],
   ['Reversões e tendências','Observa continuidade, retrações e possíveis mudanças de direção.'],
   ['Computador e celular','Use o Agent Windows e entre com a mesma conta no celular.'],
   ['Corretoras compatíveis','Lê o mercado selecionado na IQ Option ou Exnova.'],
   ['Operação manual','Não realiza operações automaticamente.']],
  titleSteps:'Como começar',steps:[
   ['Crie sua conta','Escolha o plano de 30 dias e conclua o pagamento.'],
   ['Instale o Agent','Entre na conta no PC e abra a corretora escolhida.'],
   ['Acompanhe o mercado','Veja a análise no computador ou celular.']],
  priceLabel:'Plano único · 30 dias',price:'R$ 280',priceNote:'Renovação manual, sem cobrança recorrente.',
  pricing:'Ver plano e comprar',
  riskTitle:'Transparência em primeiro lugar',risk:'O Sentinel é uma ferramenta de análise. Não garante assertividade nem ganhos. Operações apresentam risco elevado de perda. Não possui afiliação com IQ Option ou Exnova.',
  footer:'Software independente. Sem execução automática ou promessa de resultado.',
  privacy:'Privacidade',terms:'Termos'
 };
 const checkout=en?'/planos?market=intl&intl=1':'/planos?market=br';
 return <main className={styles.page}>
  <div className={styles.ambient} aria-hidden="true"/>
  <header className={styles.nav}>
   <Link href="/" className={styles.brand} aria-label="Sentinel Trading Lab">
    <span className={styles.brandIcon}>S</span><span><strong>SENTINEL</strong><small>TRADING LAB</small></span>
   </Link>
   <nav aria-label={en?'Navigation':'Navegação'}>
    <a href="#recursos">{en?'Features':'Recursos'}</a>
    <a href="#como-funciona">{en?'How it works':'Como funciona'}</a>
    <a href="#precos">{en?'Price':'Preço'}</a>
   </nav>
   <LanguageSwitcher/><Link href="/login" className={styles.navLogin}>{copy.login}</Link>
  </header>

  <section className={styles.hero}>
   <div className={styles.heroCopy}>
    <div className={styles.eyebrow}><span className={styles.liveDot}/>{copy.tagline}</div>
    <h1>{copy.title}</h1>
    <p className={styles.lead}>{copy.intro}</p>
    <div className={styles.actions}><Link href={checkout} className={styles.primary}>{copy.primary} →</Link>
     <Link href="/login" className={styles.secondary}>{copy.login}</Link></div>
    <div className={styles.compactBenefits}><span>IQ Option + Exnova</span><span>{copy.time}</span><span>{copy.control}</span></div>
   </div>
   <div className={styles.preview}>
    <div className={styles.previewHeader}>SENTINEL <b>· {en?'MARKET CONTEXT':'CONTEXTO DE MERCADO'}</b></div>
    <div className={styles.previewAsset}><span>{en?'TECHNICAL VIEW':'VISÃO TÉCNICA'}</span>
     <strong>EUR / USD</strong><small>{copy.examples}</small></div>
    <div className={styles.productPreviewItems}>
     <div><small>{copy.market}</small><strong>{en?'TREND + STRUCTURE':'TENDÊNCIA + ESTRUTURA'}</strong></div>
     <div><small>{copy.time}</small><strong>01:00</strong></div>
     <div><small>{copy.control}</small><strong>{en?'MANUAL':'MANUAL'}</strong></div>
    </div>
    <p className={styles.productPreviewNote}>{en?'Sample only. The live card requires an authenticated and licensed Agent.':'Apenas uma demonstração. O card ao vivo requer Agent autorizado e sessão autenticada.'}</p>
   </div>
  </section>

  <section id="recursos" className={styles.features}>
   <div className={styles.sectionHeading}><div className={styles.eyebrow}>{en?'FEATURES':'RECURSOS'}</div>
    <h2>{copy.titleFeatures}</h2></div>
   <div className={styles.featureGrid}>{copy.features.map(([name,description],i)=><article key={name}>
    <span className={styles.featureIndex}>{String(i+1).padStart(2,'0')}</span><h3>{name}</h3><p>{description}</p>
   </article>)}</div>
  </section>

  <section className={styles.stepsSection} id="como-funciona">
   <div className={styles.sectionHeading}><div className={styles.eyebrow}>{en?'GET STARTED':'COMECE AQUI'}</div><h2>{copy.titleSteps}</h2></div>
   <div className={styles.steps}>{copy.steps.map(([title,description],i)=><article key={title}>
     <span>{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{description}</p>
   </article>)}</div>
  </section>
  <section className={styles.pricing} id="precos">
   <div><div className={styles.eyebrow}>{copy.priceLabel}</div>
    <h2>{copy.price}</h2><p>{copy.priceNote}</p></div>
   <div className={styles.pricingAction}><Link href={checkout}>{copy.pricing} →</Link>
    <span>{en?'Secure payment through Kiwify':'Pagamento seguro via Kiwify'}</span></div>
  </section>
  <section className={styles.ethics}><h2>{copy.riskTitle}</h2><p>{copy.risk}</p></section>
  <footer className={styles.footer}><p>{copy.footer}</p>
   <div><Link href="/termos">{copy.terms}</Link><Link href="/privacidade">{copy.privacy}</Link><a href="https://devinx.com.br">{en?'DevinX products':'Produtos DevinX'}</a></div></footer>
 </main>;
}
