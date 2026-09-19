'use client';

import {useI18n} from '@/i18n/provider';
import {LanguageMenu} from '@/components/LanguageMenu';

const CHECKOUT='https://pay.kiwify.com.br/pf2YM64';
function checkoutForLocale(locale:string){
  return locale==='pt-BR'?CHECKOUT:CHECKOUT+'?region=intl';
}

export default function Home(){
  const{t,locale,currency}=useI18n();
  return <main className="landingV2">
    <header className="top landingTop">
      <div className="brand"><span className="mark">D</span><b>DEVINX</b></div>
      <div className="landingTopActions"><LanguageMenu/><a className="ghost" href="/entrar">{t('landing.login')}</a></div>
    </header>

    <section className="landingHero">
      <div className="landingCopy">
        <span className="goldPill">{t('landing.eyebrow')}</span>
        <h1>{t('landing.title')}<br/><em>{t('landing.accent')}</em></h1>
        <p>{t('landing.desc')}</p>

        <div className="planBadge">
          <div><small>{t('subscription.monthly')}</small><strong>{t('subscription.price')}<em>/{t('subscription.month')}</em></strong></div>
          <span>{t('subscription.cancelAnytime')}</span>
        </div>

        <div className="heroActions">
          <a className="primary goldButton subscribeHero" href={checkoutForLocale(locale)}>{t('subscription.subscribe')}</a>
          <a className="secondary" href="/entrar">{t('landing.loginCreate')}</a>
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

    <section className="landingSubscription">
      <span className="goldPill">{t('subscription.label')}</span>
      <h2>{t('subscription.ctaTitle')}</h2>
      <p>{t('subscription.ctaText')}</p>
      <div><strong>{t('subscription.price')}<small>/{t('subscription.month')}</small></strong><a className="primary goldButton" href={checkoutForLocale(locale)}>{t('subscription.subscribe')}</a></div>
    </section>

    <footer>DEVINX <span>{t('brand.tagline')}</span></footer>
  </main>;
}
