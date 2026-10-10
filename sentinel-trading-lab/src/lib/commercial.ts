export const SENTINEL_PLAN={
  name:'Sentinel Trading Lab',
  amount:50,
  currency:'USD',
  cadence:'30 dias',
  priceLabel:'US$ 50 / 30 dias'
} as const;

// Never publish an invented checkout URL. Configure the genuine Kiwify
// checkout link once the recurring product exists and has been approved.
export function sentinelCheckoutUrl(){
  const raw=String(process.env.KIWIFY_CHECKOUT_URL||'https://pay.kiwify.com/VNHYsjX').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    const domain=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||!(domain==='kiwify.com.br'||domain.endsWith('.kiwify.com.br')||domain==='kiwify.com'||domain.endsWith('.kiwify.com')))return null;
    return url.toString();
  }catch{return null}
}
