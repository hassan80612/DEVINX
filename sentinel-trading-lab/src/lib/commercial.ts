// Commercial markets and checkout routing are independent of the UI language.
// A Brazilian visitor can view English, and an international visitor can view
// Portuguese, without changing the checkout currency.
export type SentinelMarket='BR'|'INTL';

export const SENTINEL_PLANS={
  BR:{name:'Sentinel Trading Lab',amount:280,currency:'BRL',cadenceDays:30,priceDisplay:'R$ 280',priceLabel:'R$ 280 / 30 dias'},
  INTL:{name:'Sentinel Trading Lab',amount:50,currency:'USD',cadenceDays:30,priceDisplay:'US$ 50',priceLabel:'US$ 50 / 30 days'}
} as const;

export function sentinelMarket(requested:string|undefined|null,country:string|undefined|null,intl:string|undefined|null=null):SentinelMarket{
  const chosen=String(requested||'').trim().toLowerCase();
  if(chosen==='br'||chosen==='brasil'||chosen==='brazil')return 'BR';
  if(chosen==='intl'||chosen==='international'||chosen==='exterior')return 'INTL';
  // Explicit public international campaign/link flag, regardless of geolocation.
  if(['1','true','yes'].includes(String(intl||'').trim().toLowerCase()))return 'INTL';
  const geo=String(country||'').trim().toUpperCase();
  // Missing geolocation is common in local development; the selection remains
  // explicit and user-controlled through query links on the plans page.
  return !geo||geo==='BR'?'BR':'INTL';
}

function trustedKiwifyUrl(raw:string):string|null{
  if(!raw)return null;
  try{
    const url=new URL(raw);
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||!(['kiwify.com.br','kiwify.com'].includes(host)||
       host.endsWith('.kiwify.com.br')||host.endsWith('.kiwify.com')))return null;
    return url.toString();
  }catch{return null;}
}

// Independent checkout links: no currency conversion, no country detection
// by the user's chosen language, and no Kiwify URL fabricated by the site.
export function sentinelCheckoutUrl(market:SentinelMarket='INTL'){
  const raw=market==='BR'
    ?'https://pay.kiwify.com.br/SQku9Rd'
    :String(process.env.KIWIFY_CHECKOUT_URL||'https://pay.kiwify.com/VNHYsjX').trim();
  const verified=trustedKiwifyUrl(raw);
  if(!verified)return null;
  if(market==='BR')return verified;
  // Kiwify's documented international checkout parameter is region=intl.
  // "intl=1" is a Sentinel campaign flag, NOT a documented Kiwify locale.
  // Kiwify currently does not offer a verified URL switch for English copy:
  // never claim to change its native text with an unsupported lang=en query.
  const url=new URL(verified);
  url.searchParams.delete('intl');
  url.searchParams.set('region','intl');
  return url.toString();
}

// Backward compatibility for read-only UI components using the previous name.
export const SENTINEL_PLAN={
  name:SENTINEL_PLANS.INTL.name,
  amount:SENTINEL_PLANS.INTL.amount,
  currency:SENTINEL_PLANS.INTL.currency,
  cadence:'30 dias',
  priceLabel:SENTINEL_PLANS.INTL.priceLabel
} as const;
