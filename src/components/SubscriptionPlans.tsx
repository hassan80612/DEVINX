'use client';

import {useI18n} from '@/i18n/provider';
import {
  DEVINX_SUBSCRIPTION_PLANS,
  checkoutForLocale,
  monthlyEquivalentMinor,
  savingsPercent,
  type DevinxPlanId
} from '@/lib/subscription-plans';

function planLabel(t:(key:string)=>string,id:DevinxPlanId){
  if(id==='quarterly')return t('subscription.quarterly');
  if(id==='semiannual')return t('subscription.semiannual');
  if(id==='annual')return t('subscription.annual');
  return t('subscription.monthly');
}

export function SubscriptionPlans({variant='landing'}:{variant?:'landing'|'compact'}){
  const{t,locale}=useI18n();
  const brl=(minor:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:'BRL'}).format(minor/100);

  return <div className={'subscriptionPlans '+(variant==='compact'?'compact':'landing')}>
    {variant==='landing'&&<div className="subscriptionPlansIntro">
      <span className="goldPill">{t('subscription.plansEyebrow')}</span>
      <h2>{t('subscription.plansTitle')}</h2>
      <p>{t('subscription.plansText')}</p>
    </div>}
    {variant==='compact'&&<div className="subscriptionPlansCompactTitle"><b>{t('subscription.choosePlan')}</b><small>{t('subscription.sameAccess')}</small></div>}

    <div className="subscriptionPlanGrid">
      {DEVINX_SUBSCRIPTION_PLANS.map(plan=>{
        const featured=plan.id==='annual';
        const saving=savingsPercent(plan);
        const equivalent=monthlyEquivalentMinor(plan);
        return <article className={'subscriptionPlanCard '+(featured?'featured':'')} key={plan.id}>
          <div className="subscriptionPlanTop">
            <div>
              <small>{plan.id==='monthly'?t('subscription.flexible'):featured?t('subscription.bestValue'):t('subscription.fullAccess')}</small>
              <h3>{planLabel(t,plan.id)}</h3>
            </div>
            {saving>0&&<span className="subscriptionSaving">{t('subscription.save')} {saving}%</span>}
          </div>

          <div className="subscriptionPlanPrice">
            <strong>{brl(plan.amountMinor)}</strong>
            <span>{plan.months===1?t('subscription.perMonth'):t('subscription.totalPeriod')}</span>
          </div>

          <div className="subscriptionPlanMeta">
            {plan.months===1
              ?<span>{t('subscription.cancelAnytime')}</span>
              :<span>{t('subscription.equivalent')} <b>{brl(equivalent)}{t('subscription.perMonth')}</b></span>}
            <span>✓ {t('subscription.sameAccess')}</span>
          </div>

          <a className={featured?'goldButton subscriptionPlanCta':'primary subscriptionPlanCta'} href={checkoutForLocale(plan.checkoutUrl,locale)}>
            {t('subscription.choose')}
          </a>
        </article>;
      })}
    </div>
  </div>;
}
