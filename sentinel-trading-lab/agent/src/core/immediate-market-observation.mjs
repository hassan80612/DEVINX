/**
 * Sentinel VNext immediate market observation.
 *
 * Independent of the chosen future-forecast engine and of the three
 * informational market totals. It spots *observed* reactions to levels
 * established BEFORE the current 5s micro-window. No fixed confirmation
 * delay, confidence percentage, cross-engine vote or broker order.
 *
 * An observed directional opportunity is not a calibrated probability or
 * authorization to enter a real-money trade.
 */
const finite=x=>Number.isFinite(Number(x));
const median=values=>{
  const a=values.filter(x=>finite(x)&&x>=0).sort((x,y)=>x-y);
  return a.length?a[Math.floor(a.length/2)]:0;
};
export function observeImmediateMarket({quoteHistory=[],asOf=Date.now(),quoteTs=null}={}){
  const now=Number(asOf);
  if(!finite(now)||now<=0)return null;
  const byTime=new Map();
  for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
    const ts=Number(q?.ts),price=Number(q?.price);
    if(finite(ts)&&ts>0&&ts<=now&&finite(price)&&price>0)byTime.set(ts,price);
  }
  const rows=[...byTime].sort((a,b)=>a[0]-b[0]).slice(-1800)
    .map(([ts,price])=>({ts,price}));
  const latest=rows.at(-1),previous=rows.at(-2);
  if(!latest||!previous||now-latest.ts>2500||
     (quoteTs!=null&&Number(quoteTs)>0&&Math.abs(Number(quoteTs)-latest.ts)>2500))return null;
  const earlier=rows.filter(q=>q.ts>=latest.ts-120000&&q.ts<latest.ts-5000);
  const recent=rows.filter(q=>q.ts>=latest.ts-5000);
  if(earlier.length<8||recent.length<2)return null;
  const support=Math.min(...earlier.map(q=>q.price));
  const resistance=Math.max(...earlier.map(q=>q.price));
  if(!(support>0&&resistance>support))return null;
  const changes=[];
  for(let i=1;i<earlier.length;i++){
    const dt=earlier[i].ts-earlier[i-1].ts;
    if(dt>0&&dt<=5000)changes.push(Math.abs(earlier[i].price-earlier[i-1].price));
  }
  // The level tolerance scales to observed tick noise, not a manually
  // imposed signal confidence or a waiting period.
  const noise=Math.max(median(changes),latest.price*1e-9);
  const tolerance=noise*1.5;
  const p=latest.price,prev=previous.price;
  const low=Math.min(...recent.map(q=>q.price)),high=Math.max(...recent.map(q=>q.price));
  let side=null,kind=null,level=null;
  if(low<=support+tolerance&&low>=support-tolerance*2&&
     p>prev&&p-low>=noise&&p>support){
    side='CALL';kind='support-reaction';level=support;
  }else if(high>=resistance-tolerance&&high<=resistance+tolerance*2&&
     p<prev&&high-p>=noise&&p<resistance){
    side='PUT';kind='resistance-reaction';level=resistance;
  }else if(prev<=resistance+tolerance&&p>resistance+tolerance&&p>prev){
    side='CALL';kind='resistance-break';level=resistance;
  }else if(prev>=support-tolerance&&p<support-tolerance&&p<prev){
    side='PUT';kind='support-break';level=support;
  }
  if(!side)return null;
  return Object.freeze({
    side,kind,at:latest.ts,price:p,level,
    // Three seconds only preserve readability of a real observation;
    // they do not delay/qualify the next analysis or execute an order.
    expiresAt:latest.ts+3000,
    independent:true,tradeAuthorization:false
  });
}
