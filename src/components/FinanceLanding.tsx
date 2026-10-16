"use client";

import {useI18n} from "@/i18n/provider";
import {LanguageMenu} from "@/components/LanguageMenu";
import {BrandLogo} from "@/components/BrandLogo";
import {SubscriptionPlans} from "@/components/SubscriptionPlans";
import {LandingDemoVideo} from "@/components/LandingDemoVideo";
import {DEVINX_SUBSCRIPTION_PLANS,pricingForLocale} from "@/lib/subscription-plans";
import styles from "@/app/page.module.css";

const features=[
  {icon:"⌁",key:"movements"},
  {icon:"↻",key:"bills"},
  {icon:"▣",key:"cards"},
  {icon:"◇",key:"reserves"},
  {icon:"◷",key:"work"},
  {icon:"◎",key:"goals"},
] as const;

export function FinanceLanding(){
  const{t,locale}=useI18n();
  const checkout=pricingForLocale(DEVINX_SUBSCRIPTION_PLANS[0],locale).checkoutUrl;
  return <main className="landingV2">
    <header className="top landingTop">
      <a className="brand" href="/"><BrandLogo/></a>
      <div className="landingTopActions">{locale==="pt-BR"&&<a className="secondary" href="/loja">Loja</a>}<LanguageMenu/></div>
    </header>

    <section className="landingHero" aria-labelledby="landing-title">
      <div className="landingCopy">
        <span className="goldPill">{t("landing.eyebrow")}</span>
        <h1 id="landing-title">{t("landing.title")} <em>{t("landing.accent")}</em></h1>
        <p>{t("landing.desc")}</p>
        <div className="heroActions heroAccessOnly">
          <a className="primary landingAccessCta" href={checkout} rel="noopener noreferrer">{t("subscription.choose")}</a>
          <a className="secondary landingAccessCta" href="/entrar">{t("landing.login")}</a>
        </div>
        <a className="howLink" href="#como">{t("landing.how")}</a>
        {locale==="pt-BR"&&<LandingDemoVideo/>}
        <div className="landingProof"><span>{t("landing.noSheet")}</span><span>{t("landing.noAds")}</span><span>{t("landing.mobile")}</span></div>
      </div>

      <aside className="landingPreview" aria-labelledby="preview-title" aria-describedby="preview-caption">
        <div className="previewGlow" aria-hidden="true"/>
        <div className="previewTop"><small>DEVINX FINANCEIRO</small><span className={styles.exampleLabel}>{t("landing.preview.example")}</span></div>
        <div className={styles.dailyTarget}>
          <h2 id="preview-title">{t("landing.preview.title")}</h2>
          <div className={styles.previewPlaceholder} aria-hidden="true"><i/><i/><i/></div>
          <span>{t("landing.preview.adapts")}</span>
        </div>
        <div className="previewBalance"><span>{t("landing.preview.available")}</span><span className={styles.previewDash} aria-hidden="true"/></div>
        <div className="previewRows">
          <div><span>{t("landing.preview.bills")}</span><span className={styles.previewDash} aria-hidden="true"/></div>
          <div><span>{t("landing.preview.gap")}</span><span className={styles.previewDash} aria-hidden="true"/></div>
        </div>
        <p id="preview-caption" className={styles.exampleCaption}>{t("landing.preview.caption")}</p>
      </aside>
    </section>

    <section className="landingSteps" id="como" aria-label={t("landing.how")}>{[1,2,3].map(step=><div key={step}><small aria-hidden="true">0{step}</small><h2>{t(`landing.step${step}`)}</h2><p>{t(`landing.step${step}Text`)}</p></div>)}</section>

    <section className="landingExplainer" aria-labelledby="features-title">
      <div className="landingSectionHead"><span className="goldPill">{t("landing.controlEyebrow")}</span><h2 id="features-title">{t("landing.controlTitle")}</h2><p>{t("landing.controlText")}</p></div>
      <div className="landingFeatureGrid">{features.map(({icon,key})=><article key={key}><span aria-hidden="true">{icon}</span><h3>{t(`landing.features.${key}`)}</h3><p>{t(`landing.features.${key}Text`)}</p></article>)}</div>
    </section>

    <section className="landingPlansSection" id="planos"><SubscriptionPlans/></section>
    <footer>DEVINX FINANCEIRO</footer>
  </main>;
}
