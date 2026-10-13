import Link from 'next/link';
import styles from './landing.module.css';
import {LanguageSwitcher,Msg} from '../components/SentinelLocale';

export default function Home(){
 return <main className={styles.page}>
   <div className={styles.ambient} aria-hidden="true"/>
   <header className={styles.nav}>
     <Link href="/" className={styles.brand} aria-label="Sentinel Trading Lab, início"><span className={styles.brandIcon}><Msg id="home.brand.monogram"/></span><span><strong><Msg id="home.brand.name"/></strong><small><Msg id="home.brand.suffix"/></small></span></Link>
     <nav aria-label="Navegação principal"><a href="#como-funciona"><Msg id="home.nav.how"/></a><a href="#recursos"><Msg id="home.nav.features"/></a><a href="#planos"><Msg id="home.nav.plans"/></a></nav>
     <LanguageSwitcher/><Link href="/login" className={styles.navLogin}><Msg id="home.nav.signIn"/><span aria-hidden="true">↗</span></Link>
   </header>
   <section className={styles.hero}>
     <div className={styles.heroCopy}>
       <div className={styles.eyebrow}><span className={styles.liveDot}/><Msg id="home.hero.eyebrow"/></div>
       <h1><Msg id="home.hero.title1"/><br/><em><Msg id="home.hero.title2"/></em></h1>
       <p className={styles.lead}><Msg id="home.hero.description"/></p>
       <div className={styles.actions}><Link href="/planos" className={styles.primary}><Msg id="home.hero.primary"/><span aria-hidden="true">↗</span></Link><Link href="/login" className={styles.secondary}><Msg id="home.hero.secondary"/></Link></div>
       <div className={styles.heroNotes}><span><Msg id="home.hero.note1"/></span><span><Msg id="home.hero.note2"/></span><span><Msg id="home.hero.note3"/></span></div>
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
   <div className={styles.rule}/>
   <section className={styles.features} id="recursos">
     <div className={styles.sectionHeading}><span className={styles.kicker}><Msg id="home.features.eyebrow"/></span><h2><Msg id="home.features.heading1"/><br/><Msg id="home.features.heading2"/></h2><p><Msg id="home.features.description"/></p></div>
     <div className={styles.featureGrid}>
       <article><span className={styles.featureIcon}>⌁</span><h3><Msg id="home.features.marketTitle"/></h3><p><Msg id="home.features.marketDescription"/></p></article>
       <article><span className={styles.featureIcon}>↗</span><h3><Msg id="home.features.callsTitle"/></h3><p><Msg id="home.features.callsDescription"/></p></article>
       <article><span className={styles.featureIcon}>◇</span><h3><Msg id="home.features.reversalsTitle"/></h3><p><Msg id="home.features.reversalsDescription"/></p></article>
       <article><span className={styles.featureIcon}>▣</span><h3><Msg id="home.features.mobileTitle"/></h3><p><Msg id="home.features.mobileDescription"/></p></article>
     </div>
   </section>
   <section className={styles.stepsSection} id="como-funciona">
     <div className={styles.sectionHeading}><span className={styles.kicker}><Msg id="home.steps.eyebrow"/></span><h2><Msg id="home.steps.heading1"/><br/><Msg id="home.steps.heading2"/></h2></div>
     <div className={styles.steps}>
       <article><span><Msg id="home.steps.oneNumber"/></span><h3><Msg id="home.steps.oneTitle"/></h3><p><Msg id="home.steps.oneDescription"/></p></article>
       <article><span><Msg id="home.steps.twoNumber"/></span><h3><Msg id="home.steps.twoTitle"/></h3><p><Msg id="home.steps.twoDescription"/></p></article>
       <article><span><Msg id="home.steps.threeNumber"/></span><h3><Msg id="home.steps.threeTitle"/></h3><p><Msg id="home.steps.threeDescription"/></p></article>
       <article><span><Msg id="home.steps.fourNumber"/></span><h3><Msg id="home.steps.fourTitle"/></h3><p><Msg id="home.steps.fourDescription"/></p></article>
     </div>
   </section>
   <section className={styles.pricing} id="planos"><div><span className={styles.kicker}><Msg id="home.pricing.eyebrow"/></span><h2><Msg id="home.pricing.heading1"/><br/><Msg id="home.pricing.heading2"/></h2><p><Msg id="home.pricing.description"/></p></div><div className={styles.pricingAction}><span><Msg id="home.pricing.price"/></span><Link href="/planos"><Msg id="home.pricing.action"/></Link></div></section>
   <footer className={styles.footer}><div className={styles.footerBrand}><Msg id="home.brand.monogram"/><b><Msg id="home.brand.name"/></b><span><Msg id="home.brand.suffix"/></span></div><p><Msg id="home.footer.disclaimer"/></p><Link href="/login"><Msg id="home.footer.signIn"/></Link></footer>
 </main>
}