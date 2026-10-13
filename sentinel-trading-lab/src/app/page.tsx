'use client';
import Link from 'next/link';
import styles from './landing.module.css';
import {LanguageSwitcher,Msg,useSentinelLocale} from '../components/SentinelLocale';

export default function Home(){
 const {language}=useSentinelLocale();
 const intl=language==='en';
 const planHref=intl?'/planos?market=intl&intl=1':'/planos?market=br';
 return <main className={styles.page}>
   <div className={styles.ambient} aria-hidden="true"/>
   <header className={styles.nav}>
     <Link href="/" className={styles.brand} aria-label="Sentinel Trading Lab"><span className={styles.brandIcon}><Msg id="home.brand.monogram"/></span><span><strong><Msg id="home.brand.name"/></strong><small><Msg id="home.brand.suffix"/></small></span></Link>
     <nav aria-label="Navigation"><a href="#beneficios">{intl?'Features':'Recursos'}</a><a href="#plano">{intl?'Pricing':'Preço'}</a></nav>
     <LanguageSwitcher/><Link href="/login" className={styles.navLogin}><Msg id="home.nav.signIn"/><span aria-hidden="true">↗</span></Link>
   </header>
   <section className={styles.hero} id="plano">
     <div className={styles.heroCopy}>
       <div className={styles.eyebrow}><span className={styles.liveDot}/><Msg id="home.hero.eyebrow"/></div>
       <h1><Msg id="home.hero.title1"/><em> <Msg id="home.hero.title2"/></em></h1>
       <p className={styles.lead}><Msg id="home.hero.description"/></p>
       <div className={styles.compactOffer} data-testid="home-language-price"><small>{intl?'INTERNATIONAL · 30 DAYS':'BRASIL · 30 DIAS'}</small><div><strong>{intl?'US$ 50':'R$ 280'}</strong><span>{intl?' / 30 days':' / 30 dias'}</span></div><p>{intl?'One plan. No automatic renewal.':'Plano único. Sem renovação automática.'}</p></div>
       <div className={styles.actions}><Link href={planHref} className={styles.primary}>{intl?'Buy / Renew':'Comprar / Renovar'} <span aria-hidden="true">↗</span></Link><Link href="/login" className={styles.secondary}><Msg id="home.hero.secondary"/></Link></div>
       <div className={styles.compactBenefits} id="beneficios">
         <span>{intl?'IQ Option + Exnova':'IQ Option + Exnova'}</span>
         <span>{intl?'Live market analysis':'Análise em tempo real'}</span>
         <span>{intl?'CALL / PUT scenarios':'Cenários CALL / PUT'}</span>
         <span>{intl?'PC and phone, no phone pairing':'PC e celular, sem vincular celular'}</span>
       </div>
     </div>
     <div className={styles.preview} aria-label="Demonstração ilustrativa do visual do card, sem recomendação operacional">
       <div className={styles.previewHeader}><span className={styles.previewLogo}><Msg id="home.brand.monogram"/></span><span><Msg id="home.brand.name"/><b><Msg id="home.brand.analyst"/></b></span><span className={styles.demoTag}><Msg id="home.preview.tag"/></span></div>
       <div className={styles.previewAsset}><span><Msg id="home.preview.eyebrow"/></span><strong><Msg id="home.preview.title"/></strong><small><Msg id="home.preview.disclaimer"/></small></div>
       <div className={styles.signalGrid}>
         <div className={styles.sampleCall}><span><Msg id="home.preview.sample"/></span><b><Msg id="home.preview.call"/></b><small><Msg id="home.preview.callDescription"/></small></div>
         <div className={styles.samplePut}><span><Msg id="home.preview.sample"/></span><b><Msg id="home.preview.put"/></b><small><Msg id="home.preview.putDescription"/></small></div>
       </div>
       <div className={styles.previewReversal}><span><Msg id="home.preview.reversalTag"/></span><strong><Msg id="home.preview.reversalTitle"/></strong><small><Msg id="home.preview.reversalDescription"/></small></div>
       <div className={styles.previewBottom}><span><i className={styles.liveDot}/><Msg id="home.preview.online"/></span><span><Msg id="home.preview.demo"/></span></div>
     </div>
   </section>
   <footer className={styles.footer}><div className={styles.footerBrand}><Msg id="home.brand.monogram"/><b><Msg id="home.brand.name"/></b><span><Msg id="home.brand.suffix"/></span></div><p><Msg id="home.footer.disclaimer"/></p><Link href={planHref}>{intl?'See plan':'Ver plano'}</Link></footer>
 </main>;
}
