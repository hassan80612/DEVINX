'use client';
import Link from 'next/link';
import styles from '../landing.module.css';
import {LanguageSwitcher,useSentinelLocale} from '../../components/SentinelLocale';

const docs={
 pt:{
 back:'Voltar ao painel',guide:'GUIA DO SENTINEL',title:'Como utilizar o bot',
 intro:'O bot acompanha os sinais do Agent instalado no computador e envia cliques de CALL ou PUT à corretora. É preciso manter o computador e a corretora ligados.',
 steps:[
 ['1. Conecte a corretora','Abra o Sentinel Agent 13.9.73 já instalado no PC. Entre na sua conta Sentinel, abra IQ Option ou Exnova, faça login e confira se o ativo e as cotações estão corretos.'],
 ['2. Configure a análise','No card Mercado, selecione a estratégia e a duração da operação. Mantenha a mesma duração configurada na corretora. Espere a conexão ao vivo ser confirmada.'],
 ['3. Ajuste os limites do bot','No painel Bot automático, confira o valor por clique definido na corretora. Stop Loss e Stop Win são saldos de destino: com banca de 100, Stop Loss 50 para ao chegar a 50 ou menos; Stop Win 150 para ao chegar a 150 ou mais. Zero desativa o stop. Ordens já abertas continuam até encerrar.'],
 ['4. Martingale opcional','Com 0 níveis, o martingale fica desligado. Com 1 a 3 níveis, as entradas seguintes podem multiplicar os cliques após perdas. Multiplicadores 2× e 3× aumentam rapidamente o risco de esgotar a banca.'],
 ['5. Ligue e acompanhe','Clique em Salvar limites e depois em Ligar bot. Mantenha o PC ativo e a corretora conectada. O celular apenas acompanha e envia comandos ao Agent do PC.'],
 ['6. Pare quando quiser','Use Parar bot ou o Kill Switch para impedir novas entradas. Operações já abertas na corretora não são canceladas. Confira os resultados e os limites antes de voltar a operar.']],
 warn:'Antes de utilizar em conta REAL, teste na DEMO. Cotação atrasada, corretora desconectada ou vencimento configurado errado podem causar ordens inadequadas. O Sentinel não garante acertos nem lucros; limites de perda não eliminam todo risco.',
 buy:'Consultar licença'
 },
 en:{
 back:'Back to dashboard',guide:'SENTINEL GUIDE',title:'How to use the bot',
 intro:'The bot follows the Windows Agent signals and clicks CALL or PUT in your brokerage session. Your computer and broker connection must stay active.',
 steps:[
 ['1. Connect the broker','Open the already-installed Sentinel Agent 13.9.73 on your PC. Sign in to Sentinel, open IQ Option or Exnova, and confirm the market and live quotes.'],
 ['2. Set up analysis','On the Market card, choose the strategy and trade duration. Set the same expiry on the broker. Verify that live data is connected.'],
 ['3. Set bot limits','In Automatic Bot, check the amount per click, matching the broker. Configure the maximum session loss and optionally the losing-streak limit.'],
 ['4. Optional martingale','Zero levels disables martingale. With one to three levels, losing trades can multiply subsequent clicks. Multipliers of 2× or 3× can rapidly exhaust your balance.'],
 ['5. Start and watch','Select Save limits and then Start bot. Keep the PC and broker online. Your phone mirrors the PC analysis and can send controls to the Agent.'],
 ['6. Stop at any time','Use Stop bot or Kill Switch to prevent new entries. Trades already opened at the broker are not canceled. Review your results and limits before starting again.']],
 warn:'Test with a DEMO account before any REAL use. Stale quotes, a disconnected broker or mismatched expiry can cause unintended entries. Sentinel does not guarantee results or profits; loss limits do not eliminate risk.',
 buy:'View license'
 }
} as const;

export default function BotGuide(){
 const {language}=useSentinelLocale(),copy=docs[language];
 return <main className={styles.page}>
  <div className={styles.ambient} aria-hidden="true"/>
  <header className={styles.nav}>
   <Link href="/" className={styles.brand}>DEVINX · TRADING LAB</Link>
   <LanguageSwitcher/>
   <Link href="/console" className={styles.navLogin}>{copy.back}</Link>
  </header>
  <section className={styles.plansHero}>
   <span className={styles.kicker}>{copy.guide}</span>
   <h1>{copy.title}</h1>
   <p>{copy.intro}</p>
   <div style={{display:'grid',gap:20,textAlign:'left',margin:'28px auto',maxWidth:760}}>
    {copy.steps.map(([title,description])=><article key={title}>
     <h2 style={{fontSize:20,marginBottom:6}}>{title}</h2><p style={{marginTop:0}}>{description}</p>
    </article>)}
   </div>
   <p role="note">{copy.warn}</p>
   <Link href="/planos" className={styles.plansBack}>{copy.buy}</Link>
  </section>
 </main>
}
