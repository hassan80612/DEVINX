// Parse broker labels without assuming a unitless minute selector means seconds.
export function parseBrokerExpiry(raw, hint='', nowMs=Date.now()) {
  const text=String(raw??'').trim().toLowerCase().replace(/\s+/g,' ');
  const label=String(hint).toLowerCase();
  if(!text)return null;
  const duration=/duration|duraç|duracao|prazo|tempo de opera|trade time/.test(label);
  const expiry=/expiration|expiry|expiraç|expiracao|vencimento/.test(label);
  let total=0,units=false;
  for(const [rx,mult] of [[/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)\b/,3600000],[/(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minuto|minutos)\b/,60000],[/(\d+(?:[.,]\d+)?)\s*(?:s|seg|segs|segundo|segundos)\b/,1000]]){
    const m=text.match(rx);if(m){total+=Number(m[1].replace(',','.'))*mult;units=true}
  }
  const valid=ms=>Number.isFinite(ms)&&ms>=10000&&ms<=3600000;
  if(units)return valid(total)?{ms:Math.round(total),kind:'duration'}:null;
  const clock=text.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if(clock){
    const h=Number(clock[1]),m=Number(clock[2]),s=Number(clock[3]||0);
    if(m>59||s>59)return null;
    if(expiry&&!duration&&h<=23){
      const now=new Date(nowMs),target=new Date(nowMs);target.setHours(h,m,s,0);
      if(target.getTime()<nowMs-1500)target.setDate(target.getDate()+1);
      const ms=target.getTime()-nowMs;
      return valid(ms)?{ms,kind:'clock',targetAt:target.getTime()}:null;
    }
    const ms=clock[3]==null?(h*60+m)*1000:((h*60+m)*60+s)*1000;
    return valid(ms)?{ms,kind:'duration'}:null;
  }
  if(/^\d+(?:[.,]\d+)?$/.test(text)&&duration){
    const value=Number(text.replace(',','.'));
    const seconds=/second|segundo|\bsec\b/.test(label);
    const ms=value*(seconds?1000:60000);
    return valid(ms)?{ms,kind:'duration'}:null;
  }
  return null;
}
