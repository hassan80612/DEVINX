export type DevinxPlanId='monthly'|'quarterly'|'semiannual'|'annual';

export type DevinxSubscriptionPlan={
  id:DevinxPlanId;
  months:number;
  amountMinor:number;
  checkoutUrl:string;
};

export const DEVINX_KIWIFY_PRODUCT_ID='42a1cde0-b411-11f1-b998-436a8b692e83';

// Display-only approximation for international pages. The Kiwify checkout
// remains the source of truth for the final amount charged.
export const DEVINX_APPROX_BRL_TO_USD_RATE=0.20;

export const DEVINX_SUBSCRIPTION_PLANS:readonly DevinxSubscriptionPlan[]=[
  {id:'monthly',months:1,amountMinor:1990,checkoutUrl:'https://pay.kiwify.com.br/S2uuSUA'},
  {id:'quarterly',months:3,amountMinor:4990,checkoutUrl:'https://pay.kiwify.com.br/KHaoP9n'},
  {id:'semiannual',months:6,amountMinor:8990,checkoutUrl:'https://pay.kiwify.com.br/7pINKHM'},
  {id:'annual',months:12,amountMinor:14990,checkoutUrl:'https://pay.kiwify.com.br/i8YAXiI'}
] as const;

export function checkoutForLocale(url:string,locale:string){
  if(locale==='pt-BR')return url;
  const checkout=new URL(url);
  checkout.searchParams.set('region','intl');
  return checkout.toString();
}

export function approximateUsdMinorFromBrlMinor(minor:number){
  return Math.round(minor*DEVINX_APPROX_BRL_TO_USD_RATE);
}

export function monthlyEquivalentMinor(plan:DevinxSubscriptionPlan){
  return Math.round(plan.amountMinor/plan.months);
}

export function savingsPercent(plan:DevinxSubscriptionPlan){
  if(plan.months<=1)return 0;
  const monthlyBase=DEVINX_SUBSCRIPTION_PLANS[0].amountMinor*plan.months;
  return Math.round((1-plan.amountMinor/monthlyBase)*100);
}
