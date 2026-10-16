export type DevinxPlanId='monthly';

export type DevinxSubscriptionPlan={
  id:DevinxPlanId;
  months:number;
  amountMinor:number;
  checkoutUrl:string;
  internationalAmountMinor:number;
  internationalCheckoutUrl:string;
};

export const DEVINX_KIWIFY_PRODUCT_ID='42a1cde0-b411-11f1-b998-436a8b692e83';
export const DEVINX_KIWIFY_INTERNATIONAL_PRODUCT_ID='abf1b7b0-b75e-11f1-b984-a1fb5dadf988';

// Legacy conversion exported only for backwards compatibility.
export const DEVINX_APPROX_BRL_TO_USD_RATE=0.20;

// Single 30-day monthly plan. Kiwify product prices must match these displays.
export const DEVINX_SUBSCRIPTION_PLANS:readonly DevinxSubscriptionPlan[]=[
  {
    id:'monthly',months:1,
    amountMinor:3990,checkoutUrl:'https://pay.kiwify.com.br/ahV8lXM',
    internationalAmountMinor:800,internationalCheckoutUrl:'https://pay.kiwify.com/4ueSB2b'
  }
] as const;

function internationalCheckoutUrl(url:string){
  const checkout=new URL(url);
  checkout.searchParams.set('region','intl');
  return checkout.toString();
}

export function pricingForLocale(plan:DevinxSubscriptionPlan,locale:string){
  const international=locale!=='pt-BR';
  return {
    amountMinor:international?plan.internationalAmountMinor:plan.amountMinor,
    currencyCode:international?'USD':'BRL',
    checkoutUrl:international?internationalCheckoutUrl(plan.internationalCheckoutUrl):plan.checkoutUrl
  } as const;
}

export function checkoutForLocale(url:string,locale:string){
  return locale==='pt-BR'?url:internationalCheckoutUrl(url);
}

export function approximateUsdMinorFromBrlMinor(minor:number){
  return Math.round(minor*DEVINX_APPROX_BRL_TO_USD_RATE);
}

export function monthlyEquivalentMinor(plan:DevinxSubscriptionPlan,locale='pt-BR'){
  return Math.round(pricingForLocale(plan,locale).amountMinor/plan.months);
}

export function savingsPercent(plan:DevinxSubscriptionPlan,locale='pt-BR'){
  if(plan.months<=1)return 0;
  const monthlyBase=pricingForLocale(DEVINX_SUBSCRIPTION_PLANS[0],locale).amountMinor*plan.months;
  return Math.round((1-pricingForLocale(plan,locale).amountMinor/monthlyBase)*100);
}
