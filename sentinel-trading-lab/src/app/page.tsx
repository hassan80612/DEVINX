import Link from 'next/link';
import styles from './landing.module.css';
import {LanguageSwitcher,T} from '../components/SentinelLocale';

export default function Home(){
 return <main className={styles.page}>
   <div className={styles.ambient} aria-hidden="true"/>
   <header className={styles.nav}>
     <Link href="/" className={styles.brand} aria-label="Sentinel Trading Lab, início"><span className={styles.brandIcon}><T>S</T></span><span><strong><T>SENTINEL</T></strong><small><T>TRADING LAB</T></small></span></Link>
     <nav aria-label="Navegação principal"><a href="#como-funciona"><T>Como funciona</T></a><a href="#recursos"><T>Recursos</T></a><a href="#planos"><T>Planos</T></a></nav>
     <LanguageSwitcher/><Link href="/login" className={styles.navLogin}><T>Entrar </T><span aria-hidden="true">↗</span></Link>
   </header>
   <section className={styles.hero}>
     <div className={styles.heroCopy}>
       <div className={styles.eyebrow}><span className={styles.liveDot}/><T> ANÁLISE EM TEMPO REAL · PC + CELULAR</T></div>
       <h1><T>Enxergue o mercado.</T><br/><em><T>Decida com clareza.</T></em></h1>
       <p className={styles.lead}><T>Um ambiente de análise para acompanhar cenários, identificar possíveis reversões e visualizar sinais CALL/PUT com mais clareza. O Agent roda no seu computador; o card acompanha você no celular.</T></p>
       <div className={styles.actions}><Link href="/login" className={styles.primary}><T>Acessar o Sentinel </T><span aria-hidden="true">↗</span></Link><a href="#como-funciona" className={styles.secondary}><T>Conhecer a plataforma ↓</T></a></div>
       <div className={styles.heroNotes}><span><T>◈ Análise contínua</T></span><span><T>◈ Card responsivo</T></span><span><T>◈ Controle remoto do Agent</T></span></div>
     </div>
     <div className={styles.preview} aria-label="Demonstração ilustrativa do visual do card, sem recomendação operacional">
       <div className={styles.previewHeader}><span className={styles.previewLogo}><T>S</T></span><span><T>SENTINEL </T><b><T>ANALYST</T></b></span><span className={styles.demoTag}><T>PRÉVIA VISUAL</T></span></div>
       <div className={styles.previewAsset}><span><T>LEITURA DE MERCADO</T></span><strong><T>Card de análise</T></strong><small><T>Exibição ilustrativa, não é sinal ao vivo</T></small></div>
       <div className={styles.signalGrid}>
         <div className={styles.sampleCall}><span><T>EXEMPLO VISUAL</T></span><b><T>↑ CALL</T></b><small><T>Direção de alta</T></small></div>
         <div className={styles.samplePut}><span><T>EXEMPLO VISUAL</T></span><b><T>↓ PUT</T></b><small><T>Direção de baixa</T></small></div>
       </div>
       <div className={styles.previewReversal}><span><T>◈ ALERTA DE REVERSÃO</T></span><strong><T>Possível mudança de direção</T></strong><small><T>Alertas em teste ficam destacados sem se confundir com entradas confirmadas.</T></small></div>
       <div className={styles.previewBottom}><span><i className={styles.liveDot}/><T> ANALISTA ONLINE</T></span><span><T>Exibição demonstrativa</T></span></div>
     </div>
   </section>
   <div className={styles.rule}/>
   <section className={styles.features} id="recursos">
     <div className={styles.sectionHeading}><span className={styles.kicker}><T>UMA TELA, O QUE IMPORTA</T></span><h2><T>Menos distração.</T><br/><T>Mais leitura.</T></h2><p><T>O Sentinel organiza a análise sem misturar cenário, oportunidade de entrada e aviso de reversão.</T></p></div>
     <div className={styles.featureGrid}>
       <article><span className={styles.featureIcon}>⌁</span><h3><T>Cenário em tempo real</T></h3><p><T>Acompanhe a direção e o prazo do cenário principal sem confundi-lo com cada movimento momentâneo do preço.</T></p></article>
       <article><span className={styles.featureIcon}>↗</span><h3><T>CALL e PUT destacados</T></h3><p><T>O card diferencia visualmente a direção, a reavaliação e os sinais acionáveis.</T></p></article>
       <article><span className={styles.featureIcon}>◇</span><h3><T>Reversão independente</T></h3><p><T>Observe alertas de possíveis viradas e suas confirmações estruturais, com estados claramente identificados.</T></p></article>
       <article><span className={styles.featureIcon}>▣</span><h3><T>PC + celular</T></h3><p><T>O Agent analisa no computador. Você acompanha o card e controla o estado da análise à distância.</T></p></article>
     </div>
   </section>
   <section className={styles.stepsSection} id="como-funciona">
     <div className={styles.sectionHeading}><span className={styles.kicker}><T>SIMPLES DE COMEÇAR</T></span><h2><T>O Agent no PC.</T><br/><T>O analista com você.</T></h2></div>
     <div className={styles.steps}>
       <article><span><T>01</T></span><h3><T>Crie sua conta</T></h3><p><T>Acesse o painel protegido do Sentinel e confira a disponibilidade do seu plano.</T></p></article>
       <article><span><T>02</T></span><h3><T>Instale o Agent</T></h3><p><T>Baixe o instalador para Windows no painel e vincule seu computador por código.</T></p></article>
       <article><span><T>03</T></span><h3><T>Conecte a corretora</T></h3><p><T>Abra IQ Option ou Exnova no computador, selecione seu ativo e confirme a fonte de dados.</T></p></article>
       <article><span><T>04</T></span><h3><T>Abra o Mercado</T></h3><p><T>Visualize o card no celular e use os controles de análise. As operações continuam manuais na corretora.</T></p></article>
     </div>
   </section>
   <section className={styles.pricing} id="planos"><div><span className={styles.kicker}><T>ACESSO PROTEGIDO</T></span><h2><T>Um único painel.</T><br/><T>Seu plano Sentinel.</T></h2><p><T>Acesso por 30 dias: US$ 50. Renove com uma nova compra antes do vencimento; não há cobrança automática. Confira os detalhes no checkout oficial da Kiwify.</T></p></div><div className={styles.pricingAction}><span><T>ACESSO DE 30 DIAS · US$ 50</T></span><Link href="/planos"><T>Ver plano e acesso ↗</T></Link></div></section>
   <footer className={styles.footer}><div className={styles.footerBrand}><T>S </T><b><T>SENTINEL</T></b><span><T>TRADING LAB</T></span></div><p><T>Ferramenta de análise experimental. Não há garantia de acerto ou resultado financeiro. O Sentinel não executa operações automaticamente.</T></p><Link href="/login"><T>Entrar no painel ↗</T></Link></footer>
 </main>
}