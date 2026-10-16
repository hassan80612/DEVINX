'use client';

import {useI18n} from '@/i18n/provider';
import {DEVINX_SUBSCRIPTION_PLANS,pricingForLocale} from '@/lib/subscription-plans';

export function SubscriptionPlans({variant='landing'}:{variant?:'landing'|'compact'}){
  const {t,locale}=useI18n();
  const plan=DEVINX_SUBSCRIPTION_PLANS[0];
  const pricing=pricingForLocale(plan,locale);
  const price=new Intl.NumberFormat(locale,{style:'currency',currency:pricing.currencyCode})
    .format(pricing.amountMinor/100);

  return <div className={'subscriptionPlans '+(variant==='compact'?'compact':'landing')}>
    {variant==='landing'&&<div className="subscriptionPlansIntro">
      <span className="goldPill">{t('subscription.plansEyebrow')}</span>
      <h2>{t('subscription.plansTitle')}</h2>
      <p>{t('subscription.plansText')}</p>
    </div>}
    {variant==='compact'&&<div className="subscriptionPlansCompactTitle">
      <b>{t('subscription.choosePlan')}</b>
      <small>{t('subscription.sameAccess')}</small>
    </div>}
    <div className="subscriptionPlanGrid singlePlan">
      <article className="subscriptionPlanCard featured">
        <div className="subscriptionPlanTop">
          <div><small>{t('subscription.fullAccess')}</small><h3>{t('subscription.monthly')}</h3></div>
        </div>
        <div className="subscriptionPlanPrice">
          <strong>{price}</strong><span>{t('subscription.perMonth')}</span>
        </div>
        <div className="subscriptionPlanMeta">
          <span>✓ {t('subscription.sameAccess')}</span>
        </div>
        <a className="goldButton subscriptionPlanCta" href={pricing.checkoutUrl}
           rel="noopener noreferrer" data-market={locale==='pt-BR'?'BR':'INTL'}>
          {t('subscription.choose')}
        </a>
      </article>
    </div>
  </div>;
}
