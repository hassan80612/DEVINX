export type LaserPlanId='starter'|'pro'|'workshop';
export type BillingCurrency='BRL'|'USD';

export const LASER_CONTROL_CONFIG={
  slug:'laser-control',
  productName:'DevinX Laser Control',
  productShortName:'Laser Control',
  supportEmail:'',
  trialDays:7,
  checkoutEnabled:false,
  localStartArmMinutes:30
} as const;

export const LASER_PLANS=[
  {id:'starter' as LaserPlanId,pcs:1,machines:1,mobileDevices:2,activeOperators:1,monthlyMinor:{BRL:1990,USD:590},checkoutUrl:{BRL:null,USD:null}},
  {id:'pro' as LaserPlanId,pcs:2,machines:3,mobileDevices:4,activeOperators:1,monthlyMinor:{BRL:3990,USD:990},checkoutUrl:{BRL:null,USD:null}},
  {id:'workshop' as LaserPlanId,pcs:5,machines:10,mobileDevices:10,activeOperators:3,monthlyMinor:{BRL:8990,USD:1990},checkoutUrl:{BRL:null,USD:null}}
] as const;

export function laserPrice(plan:(typeof LASER_PLANS)[number],currency:BillingCurrency){
  return plan.monthlyMinor[currency]/100;
}
