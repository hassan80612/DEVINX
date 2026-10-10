import Link from 'next/link';
import styles from './landing.module.css';

export default function Home(){
 return <main className={styles.page}>
   <div className={styles.ambient} aria-hidden="true"/>
   <header className={styles.nav}>
     <Link href="/" className={styles.brand} aria-label="Sentinel Trading Lab, início"><span className={styles.brandIcon}>S</span><span><strong>SENTINEL</strong><small>TRADING LAB</small></span></Link>
     <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#planos">Planos</a></nav>
     <Link href="/login" className={styles.navLogin}>Entrar <span aria-hidden="true">↗</span></Link>
   </header>
   <section className={styles.hero}>
     <div className={styles.heroCopy}>
       <div className={styles.eyebrow}><span className={styles.liveDot}/> ANÁLISE EM TEMPO REAL · PC + CELULAR</div>
       <h1>Enxergue o mercado.<br/><em>Decida com clareza.</em></h1>
       <p className={styles.lead}>Um ambiente de análise para acompanhar cenários, identificar possíveis reversões e visualizar sinais CALL/PUT com mais clareza. O Agent roda no seu computador; o card acompanha você no celular.</p>
       <div className={styles.actions}><Link href="/login" className={styles.primary}>Acessar o Sentinel <span aria-hidden="true">↗</span></Link><a href="#como-funciona" className={styles.secondary}>Conhecer a plataforma ↓</a></div>
       <div className={styles.heroNotes}><span>◈ Análise contínua</span><span>◈ Card responsivo</span><span>◈ Controle remoto do Agent</span></div>
     </div>
     <div className={styles.preview} aria-label="Demonstração ilustrativa do visual do card, sem recomendação operacional">
       <div className={styles.previewHeader}><span className={styles.previewLogo}>S</span><span>SENTINEL <b>ANALYST</b></span><span className={styles.demoTag}>PRÉVIA VISUAL</span></div>
       <div className={styles.previewAsset}><span>LEITURA DE MERCADO</span><strong>Card de análise</strong><small>Exibição ilustrativa, não é sinal ao vivo</small></div>
       <div className={styles.signalGrid}>
         <div className={styles.sampleCall}><span>EXEMPLO VISUAL</span><b>↑ CALL</b><small>Direção de alta</small></div>
         <div className={styles.samplePut}><span>EXEMPLO VISUAL</span><b>↓ PUT</b><small>Direção de baixa</small></div>
       </div>
       <div className={styles.previewReversal}><span>◈ ALERTA DE REVERSÃO</span><strong>Possível mudança de direção</strong><small>Alertas em teste ficam destacados sem se confundir com entradas confirmadas.</small></div>
       <div className={styles.previewBottom}><span><i className={styles.liveDot}/> ANALISTA ONLINE</span><span>Exibição demonstrativa</span></div>
     </div>
   </section>
   <div className={styles.rule}/>
   <section className={styles.features} id="recursos">
     <div className={styles.sectionHeading}><span className={styles.kicker}>UMA TELA, O QUE IMPORTA</span><h2>Menos distração.<br/>Mais leitura.</h2><p>O Sentinel organiza a análise sem misturar cenário, oportunidade de entrada e aviso de reversão.</p></div>
     <div className={styles.featureGrid}>
       <article><span className={styles.featureIcon}>⌁</span><h3>Cenário em tempo real</h3><p>Acompanhe a direção e o prazo do cenário principal sem confundi-lo com cada movimento momentâneo do preço.</p></article>
       <article><span className={styles.featureIcon}>↗</span><h3>CALL e PUT destacados</h3><p>O card diferencia visualmente a direção, a reavaliação e os sinais acionáveis.</p></article>
       <article><span className={styles.featureIcon}>◇</span><h3>Reversão independente</h3><p>Observe alertas de possíveis viradas e suas confirmações estruturais, com estados claramente identificados.</p></article>
       <article><span className={styles.featureIcon}>▣</span><h3>PC + celular</h3><p>O Agent analisa no computador. Você acompanha o card e controla o estado da análise à distância.</p></article>
     </div>
   </section>
   <section className={styles.stepsSection} id="como-funciona">
     <div className={styles.sectionHeading}><span className={styles.kicker}>SIMPLES DE COMEÇAR</span><h2>O Agent no PC.<br/>O analista com você.</h2></div>
     <div className={styles.steps}>
       <article><span>01</span><h3>Crie sua conta</h3><p>Acesse o painel protegido do Sentinel e confira a disponibilidade do seu plano.</p></article>
       <article><span>02</span><h3>Instale o Agent</h3><p>Baixe o instalador para Windows no painel e vincule seu computador por código.</p></article>
       <article><span>03</span><h3>Conecte a corretora</h3><p>Abra IQ Option ou Exnova no computador, selecione seu ativo e confirme a fonte de dados.</p></article>
       <article><span>04</span><h3>Abra o Mercado</h3><p>Visualize o card no celular e use os controles de análise. As operações continuam manuais na corretora.</p></article>
     </div>
   </section>
   <section className={styles.pricing} id="planos"><div><span className={styles.kicker}>ACESSO PROTEGIDO</span><h2>Um único painel.<br/>Seu plano Sentinel.</h2><p>Assinatura mensal de US$ 50. O pagamento será liberado após a conexão do checkout da Kiwify; os detalhes de cobrança serão apresentados antes da contratação.</p></div><div className={styles.pricingAction}><span>ASSINATURA MENSAL · US$ 50</span><Link href="/planos">Ver plano e acesso ↗</Link></div></section>
   <footer className={styles.footer}><div className={styles.footerBrand}>S <b>SENTINEL</b><span>TRADING LAB</span></div><p>Ferramenta de análise experimental. Não há garantia de acerto ou resultado financeiro. O Sentinel não executa operações automaticamente.</p><Link href="/login">Entrar no painel ↗</Link></footer>
 </main>
}