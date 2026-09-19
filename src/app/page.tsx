'use client';

import {useI18n} from '@/i18n/provider';
import {LanguageMenu} from '@/components/LanguageMenu';
import {BrandLogo} from '@/components/BrandLogo';

const CHECKOUT='https://pay.kiwify.com.br/pf2YM64';
function checkoutForLocale(locale:string){
  return locale==='pt-BR'?CHECKOUT:CHECKOUT+'?region=intl';
}

export default function Home(){
  const{t,locale,currency}=useI18n();
  return <main className="landingV2">
    <header className="top landingTop">
      <div className="brand"><BrandLogo/></div>
      <div className="landingTopActions"><LanguageMenu/></div>
    </header>

    <section className="landingHero">
      <div className="landingCopy">
        <span className="goldPill">{t('landing.eyebrow')}</span>
        <h1>{t('landing.title')}<br/><em>{t('landing.accent')}</em></h1>
        <p>{t('landing.desc')}</p>

        <div className="heroActions heroAccessOnly">
          <a className="primary landingAccessCta" href="/entrar">{t('landing.loginCreate')}</a>
        </div>
        <a className="howLink" href="#como">{t('landing.how')}</a>
        <div className="landingProof"><span>{t('landing.noSheet')}</span><span>{t('landing.noAds')}</span><span>{t('landing.mobile')}</span></div>
      </div>

      <div className="landingPreview">
        <div className="previewGlow"/>
        <div className="previewTop"><small>DEVINX</small><b>{t('nav.home')}</b></div>
        <div className="previewBalance"><span>{t('dashboard.projected')}</span><strong>{currency(188000)}</strong><small>{t('dashboard.projectedHelp')}</small></div>
        <div className="previewQuick"><button>＋ {t('common.income')}</button><button>− {t('quick.expense')}</button><button>◷ {t('home.work')}</button><button>▣ {t('home.card')}</button></div>
        <div className="previewRows"><div><span>{t('dashboard.entered')}</span><b>{currency(485000)}</b></div><div><span>{t('dashboard.spent')}</span><b>{currency(219000)}</b></div><div><span>{t('dashboard.pending')}</span><b>{currency(78000)}</b></div></div>
      </div>
    </section>

    <section className="landingSteps" id="como">
      <div><small>01</small><h2>{t('landing.step1')}</h2><p>{t('landing.step1Text')}</p></div>
      <div><small>02</small><h2>{t('landing.step2')}</h2><p>{t('landing.step2Text')}</p></div>
      <div><small>03</small><h2>{t('landing.step3')}</h2><p>{t('landing.step3Text')}</p></div>
    </section>

    <section className="landingExplainer">
      <div className="landingSectionHead"><span className="goldPill">{t('landing.controlEyebrow')}</span><h2>{t('landing.controlTitle')}</h2><p>{t('landing.controlText')}</p></div>
      <div className="landingFeatureGrid">
        <article><span>⌁</span><h3>{t('landing.featureCategories')}</h3><p>{t('landing.featureCategoriesText')}</p></article>
        <article><span>▣</span><h3>{t('landing.featureCards')}</h3><p>{t('landing.featureCardsText')}</p></article>
        <article><span>◇</span><h3>{t('nav.reserves')}</h3><p>{t('landing.deepReserveText')}</p></article>
        <article><span>◎</span><h3>{t('landing.featureGoals')}</h3><p>{t('landing.featureGoalsText')}</p></article>
        <article className="driverFeature"><span>◷</span><h3>{t('landing.featureDriver')}</h3><p>{t('landing.featureDriverText')}</p><div className="driverFormula"><b>{t('landing.driverCalc1')}</b><b>{t('landing.driverCalc2')}</b><b>{t('landing.driverCalc3')}</b><b>{t('landing.driverCalc4')}</b></div></article>
        <article><span>▥</span><h3>{t('landing.featureHistory')}</h3><p>{t('landing.featureHistoryText')}</p></article>
      </div>
    </section>

    <section className="landingDeepDive">
      <div className="landingSectionHead deepDiveHead"><span className="goldPill">{t('landing.deepEyebrow')}</span><h2>{t('landing.deepTitle')}</h2><p>{t('landing.deepText')}</p></div>

      <article className="deepDiveCard dailyDive">
        <div className="deepDiveIcon">◎</div>
        <div><small>{t('landing.deepDailyEyebrow')}</small><h3>{t('landing.deepDailyTitle')}</h3><p>{t('landing.deepDailyText')}</p></div>
        <div className="deepDiveFlow"><span>{t('landing.flowToday')}</span><i>→</i><span>{t('landing.flowDueDates')}</span><i>→</i><b>{t('landing.flowDailyTarget')}</b></div>
      </article>

      <div className="deepDiveGrid">
        <article className="deepDiveCard"><div className="deepDiveIcon">◇</div><small>{t('landing.deepReserveEyebrow')}</small><h3>{t('landing.deepReserveTitle')}</h3><p>{t('landing.deepReserveText')}</p><div className="deepMiniStats"><span>{t('landing.deepReserveStat1')}</span><span>{t('landing.deepReserveStat2')}</span><span>{t('landing.deepReserveStat3')}</span></div></article>
        <article className="deepDiveCard"><div className="deepDiveIcon">↻</div><small>{t('landing.deepBillsEyebrow')}</small><h3>{t('landing.deepBillsTitle')}</h3><p>{t('landing.deepBillsText')}</p><div className="deepMiniStats"><span>48x</span><span>{t('landing.deepBillsStat2')}</span><span>{t('landing.deepBillsStat3')}</span></div></article>
        <article className="deepDiveCard"><div className="deepDiveIcon">▣</div><small>{t('landing.deepCardsEyebrow')}</small><h3>{t('landing.deepCardsTitle')}</h3><p>{t('landing.deepCardsText')}</p><div className="deepMiniStats"><span>{t('landing.deepCardsStat1')}</span><span>{t('landing.deepCardsStat2')}</span><span>{t('landing.deepCardsStat3')}</span></div></article>
        <article className="deepDiveCard"><div className="deepDiveIcon">◷</div><small>{t('landing.deepWorkEyebrow')}</small><h3>{t('landing.deepWorkTitle')}</h3><p>{t('landing.deepWorkText')}</p><div className="deepMiniStats"><span>KM/L</span><span>R$/h</span><span>R$/km</span></div></article>
        <article className="deepDiveCard wideDive"><div className="deepDiveIcon">▥</div><small>{t('landing.deepHistoryEyebrow')}</small><h3>{t('landing.deepHistoryTitle')}</h3><p>{t('landing.deepHistoryText')}</p><div className="deepMiniStats"><span>{t('landing.deepHistoryStat1')}</span><span>{t('landing.deepHistoryStat2')}</span><span>{t('landing.deepHistoryStat3')}</span></div></article>
      </div>
    </section>

    <section className="landingPlanRibbon">
      <div><small>{t('subscription.monthly')}</small><strong>{t('subscription.price')}<em>/{t('subscription.month')}</em></strong><span>{t('subscription.cancelAnytime')}</span></div>
      <a className="goldButton planRibbonButton" href={checkoutForLocale(locale)}>{t('subscription.subscribe')}</a>
    </section>

    <footer>DEVINX <span>{t('brand.tagline')}</span></footer>
  </main>;
}
