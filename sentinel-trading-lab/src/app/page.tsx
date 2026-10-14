'use client';
import Link from 'next/link';
import styles from './landing.module.css';
import {LanguageSwitcher,useSentinelLocale} from '../components/SentinelLocale';

export default function Home(){
 const {language}=useSentinelLocale();
 const en=language==='en';
 const d=en?{
  eyebrow:'PROFESSIONAL MARKET ANALYSIS SOFTWARE',
  heading:'Understand the market before you decide.',
  lead:'Sentinel Trading Lab is a professional technical analysis platform built to monitor price behavior, track market structure and present timely CALL/PUT scenarios in your trading workspace.',
  supporting:'It combines continuous market monitoring, future entry projections and visual context for manual decisions — with no automated orders.',
  cta:'Buy 30-day access',login:'Sign in',
  tag:'INDEPENDENT SOFTWARE',compatible:'COMPATIBLE BROKERS',disclaimer:'Independent software. Not endorsed by or affiliated with these brokers.',
  previewTitle:'THE ANALYST AT WORK',previewSubtitle:'Example of analysis — not a live trade signal',
  forecast:'Future entry analysis',range:'Selected expiration',manual:'Manual decision',status:'Market monitoring',confidence:'Live technical structure',
  section:'An analyst designed for your workflow',support:'Useful market context. Less clutter, no exaggerated promises.',
  points:[
   ['Continuous monitoring','Observe price movements as they develop, instead of relying on a static snapshot.'],
   ['CALL/PUT scenarios','Directional assessments and projected entry timing, with one confirmed entry per opportunity window.'],
   ['Structure and reversals','Market context from completed price movements, including trends, retracements and possible turns.'],
   ['Your chosen expiration','Analysis aligned to the selected prediction interval and operation duration.'],
   ['PC and phone','Read the same authorized Sentinel session from your Windows computer or mobile browser.'],
   ['Two broker environments','Support for working alongside IQ Option and Exnova; you remain in control of trades.']],
  getting:'How you get started',steps:[
   ['01','Create your account','Use the same email address for registration and the checkout.'],
   ['02','Pay for 30 days','Complete secure checkout on Kiwify. Your paid access is linked to that email.'],
   ['03','Open Sentinel','Install the Windows Agent and open the broker you prefer.']],
  plan:'ONE PLAN · 30 DAYS',price:'US$ 50',afterPrice:'30 days of access · manual renewal',
  purchase:'Buy 30-day access',secure:'Secure payment with Kiwify · access tied to your registered email',
  caveat:'Important: Sentinel is technical analysis software, not personalized financial advice. It does not place trades, promise returns or guarantee any accuracy rate. Trading involves substantial risk of loss.',
  copyright:'Independent market analysis platform',terms:'Terms',privacy:'Privacy'
 }:{
  eyebrow:'SOFTWARE PROFISSIONAL DE ANÁLISE DE MERCADO',
  heading:'Entenda o mercado antes de decidir.',
  lead:'O Sentinel Trading Lab é uma plataforma profissional de análise técnica que acompanha o comportamento dos preços, interpreta a estrutura do mercado e apresenta cenários CALL e PUT no seu ambiente de operações.',
  supporting:'Reúne monitoramento contínuo, projeção de entradas futuras e leitura visual para apoiar decisões manuais — sem executar operações automaticamente.',
  cta:'Comprar acesso de 30 dias',login:'Entrar',
  tag:'SOFTWARE INDEPENDENTE',compatible:'CORRETORAS COMPATÍVEIS',disclaimer:'Software independente, sem parceria ou afiliação com as corretoras.',
  previewTitle:'O ANALISTA EM AÇÃO',previewSubtitle:'Demonstração da análise — não é um sinal ao vivo',
  forecast:'Análise de entrada futura',range:'Vencimento selecionado',manual:'Decisão manual',status:'Acompanhando mercado',confidence:'Estrutura técnica em tempo real',
  section:'Um analista pensado para suas operações',support:'Mais contexto para decidir, sem telas desnecessárias ou promessas exageradas.',
  points:[
   ['Monitoramento contínuo','Acompanhe as mudanças de preço enquanto elas acontecem, em vez de depender de uma leitura parada.'],
   ['Cenários CALL e PUT','Projeções de direção e momento de entrada, com uma chamada confirmada por janela de oportunidade.'],
   ['Estrutura e reversões','Leitura de movimentos já concluídos para avaliar tendências, retrações e possíveis viradas.'],
   ['Vencimento escolhido','Análises considerando o prazo de previsão e a duração de operação que você selecionou.'],
   ['Computador e celular','Acompanhe a mesma sessão autorizada pelo Agent Windows e pelo navegador do celular.'],
   ['Duas corretoras','Compatibilidade com IQ Option e Exnova. Você continua responsável pelas suas operações.']],
  getting:'Comece em três passos',steps:[
   ['01','Crie sua conta','Utilize o mesmo e-mail no cadastro e no pagamento.'],
   ['02','Pague por 30 dias','Finalize a compra na Kiwify. O pagamento aprovado libera o e-mail cadastrado.'],
   ['03','Abra o Sentinel','Instale o Agent Windows e escolha a corretora para acompanhar.']],
  plan:'PLANO ÚNICO · 30 DIAS',price:'R$ 280',afterPrice:'30 dias de acesso · renovação manual',
  purchase:'Comprar acesso de 30 dias',secure:'Pagamento seguro pela Kiwify · acesso liberado para o e-mail cadastrado',
  caveat:'Importante: o Sentinel é um software de análise técnica, não uma recomendação personalizada de investimento. Não executa operações, não promete lucros nem garante percentual de acerto. Operações envolvem risco elevado de perdas.',
  copyright:'Plataforma independente de análise de mercado',terms:'Termos',privacy:'Privacidade'
 };
 const href=en?'/comprar?market=INTL':'/comprar?market=BR';
 return <main className={styles.launchPage}>
  <header className={styles.launchNav}>
   <Link href="/" aria-label="Sentinel Trading Lab" className={styles.launchBrand}>
    <span className={styles.launchMark}>S</span>
    <span><strong>SENTINEL</strong><small>TRADING LAB</small></span>
   </Link>
   <div className={styles.launchNavRight}>
     <LanguageSwitcher/>
     <Link href="/login" className={styles.launchLogin}>{d.login}</Link>
   </div>
  </header>
  <div className={styles.launchShell}>
   <section className={styles.launchHero}>
     <div className={styles.launchPitch}>
       <div className={styles.launchEyebrow}><i/>{d.eyebrow}</div>
       <h1>{d.heading}</h1>
       <p className={styles.launchLead}>{d.lead}</p>
       <p className={styles.launchSupporting}>{d.supporting}</p>
       <div className={styles.launchCtas}>
         <Link href={href} className={styles.launchBuy}>{d.cta}<span aria-hidden="true">↗</span></Link>
         <span className={styles.launchDuration}>{d.price} <small>/ 30 {en?'days':'dias'}</small></span>
       </div>
       <div className={styles.launchPartners}>
         <span className={styles.launchPartnersCaption}>{d.compatible}</span>
         <div className={styles.launchPartnerRow}><strong>IQ Option</strong><strong>Exnova</strong></div>
         <small>{d.disclaimer}</small>
       </div>
     </div>
     <div className={styles.launchPreview} aria-label={d.previewTitle}>
       <div className={styles.launchPreviewTop}><span><i/> SENTINEL <b>TRADING LAB</b></span><small>{d.tag}</small></div>
       <div className={styles.launchPreviewAsset}>
         <div><small>{d.previewTitle}</small><h2>EUR / USD <span>OTC</span></h2></div>
         <span className={styles.launchStatus}><i/>{d.status}</span>
       </div>
       <div className={styles.launchPreviewMain}>
         <small>{d.forecast}</small>
         <strong>CALL <span>·</span> PUT</strong>
         <p>{d.previewSubtitle}</p>
       </div>
       <div className={styles.launchMetrics}>
         <div><small>{d.range}</small><strong>01:00</strong></div>
         <div><small>{d.confidence}</small><strong>{en?'Monitoring':'Monitorando'}</strong></div>
         <div><small>{d.manual}</small><strong>{en?'User':'Usuário'}</strong></div>
       </div>
       <div className={styles.launchBrokerTags}><span>IQ Option</span><span>Exnova</span></div>
     </div>
   </section>
   <section className={styles.launchFeatures}>
     <div className={styles.launchSectionIntro}><span>{en?'CAPABILITIES':'O QUE ELE FAZ'}</span><h2>{d.section}</h2><p>{d.support}</p></div>
     <div className={styles.launchFeatureGrid}>{d.points.map(([name,description],i)=>
       <article key={name}><b>{String(i+1).padStart(2,'0')}</b><h3>{name}</h3><p>{description}</p></article>
     )}</div>
   </section>
   <section className={styles.launchFinal}>
     <div className={styles.launchSteps}>
       <h2>{d.getting}</h2>
       {d.steps.map(([number,title,body])=><div key={number} className={styles.launchStep}><span>{number}</span><div><strong>{title}</strong><p>{body}</p></div></div>)}
     </div>
     <div className={styles.launchPlan}>
       <small>{d.plan}</small><h2>{d.price}</h2><p>{d.afterPrice}</p>
       <Link href={href}>{d.purchase}<span aria-hidden="true">↗</span></Link>
       <div>{d.secure}</div>
     </div>
   </section>
   <footer className={styles.launchFooter}>
      <p>{d.caveat}</p>
      <div><span>© Sentinel Trading Lab · {d.copyright}</span><Link href="/termos">{d.terms}</Link><Link href="/privacidade">{d.privacy}</Link></div>
   </footer>
  </div>
 </main>
}
