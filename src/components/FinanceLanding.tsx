"use client";

import {useI18n} from "@/i18n/provider";
import {LanguageMenu} from "@/components/LanguageMenu";
import {BrandLogo} from "@/components/BrandLogo";
import {SubscriptionPlans} from "@/components/SubscriptionPlans";
import {LandingDemoVideo} from "@/components/LandingDemoVideo";
import styles from "@/app/page.module.css";

const features=[
  {icon:"⌁",key:"movements"},
  {icon:"↻",key:"bills"},
  {icon:"▣",key:"cards"},
  {icon:"◇",key:"reserves"},
  {icon:"◷",key:"work"},
  {icon:"◎",key:"goals"},
] as const;

const example={available:40000,bills:130000,days:5};
const exampleGap=example.bills-example.available;
const exampleDailyTarget=exampleGap/example.days;

export function FinanceLanding(){
  const{t,currency,locale}=useI18n();
  return <main className="landingV2">
    <header className="top landingTop">
      <a className="brand" href="/"><BrandLogo/></a>
      <div className="landingTopActions"><a className="secondary" href="/loja">Loja</a><LanguageMenu/></div>
    </header>

    <section className="landingHero" aria-labelledby="landing-title">
      <div className="landingCopy">
        <span className="goldPill">{t("landing.eyebrow")}</span>
        <h1 id="landing-title">{t("landing.title")} <em>{t("landing.accent")}</em></h1>
        <p>{t("landing.desc")}</p>
        <div className="heroActions heroAccessOnly">
          <div className={styles.trialAction}>
            <a className="primary landingAccessCta" href="/entrar?trial=1" aria-describedby="trial-conditions">{t("trial.cta")}</a>
            <small id="trial-conditions" className={styles.trialNote}>{t("trial.noCard")}</small>
          </div>
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
          <strong><bdi>{currency(exampleDailyTarget)}</bdi></strong>
          <span>{t("landing.preview.adapts")}</span>
        </div>
        <div className="previewBalance"><span>{t("landing.preview.available")}</span><strong><bdi>{currency(example.available)}</bdi></strong></div>
        <div className="previewRows"><div><span>{t("landing.preview.bills")}</span><b><bdi>{currency(example.bills)}</bdi></b></div><div><span>{t("landing.preview.gap")}</span><b><bdi>{currency(exampleGap)}</bdi></b></div></div>
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
