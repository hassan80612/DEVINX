export type DevinxPlanId='monthly'|'quarterly'|'semiannual'|'annual';

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

// Kept only for backwards compatibility with older callers.
// International pricing is fixed in USD and no longer derived from BRL.
export const DEVINX_APPROX_BRL_TO_USD_RATE=0.20;

export const DEVINX_SUBSCRIPTION_PLANS:readonly DevinxSubscriptionPlan[]=[
  {
    id:'monthly',months:1,
    amountMinor:1990,checkoutUrl:'https://pay.kiwify.com.br/S2uuSUA',
    internationalAmountMinor:500,internationalCheckoutUrl:'https://pay.kiwify.com/4ueSB2b'
  },
  {
    id:'quarterly',months:3,
    amountMinor:4990,checkoutUrl:'https://pay.kiwify.com.br/KHaoP9n',
    internationalAmountMinor:1290,internationalCheckoutUrl:'https://pay.kiwify.com/5mYoTiS'
  },
  {
    id:'semiannual',months:6,
    amountMinor:8990,checkoutUrl:'https://pay.kiwify.com.br/7pINKHM',
    internationalAmountMinor:2290,internationalCheckoutUrl:'https://pay.kiwify.com/QFAn4UI'
  },
  {
    id:'annual',months:12,
    amountMinor:14990,checkoutUrl:'https://pay.kiwify.com.br/i8YAXiI',
    internationalAmountMinor:3790,internationalCheckoutUrl:'https://pay.kiwify.com/XFbIajq'
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
