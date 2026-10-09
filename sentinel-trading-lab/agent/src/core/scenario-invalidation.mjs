import {closedPriceBars} from './closed-price-bars.mjs';
// A wick beyond the frozen structural level is a test, not a confirmed break.
// Use the existing 5s price bars, only after they close. There is no forecast
// lock, no side change and no authority over the independent entry analyst.
export function scenarioInvalidation(main,snap,now,{strict=false}={}){
  const level=Number(main.invalidation),price=Number(snap.price);
  const crossed=p=>main.side==='CALL'?p<=level:p>=level;
  if(main.invalidation==null||!Number.isFinite(level))return{broken:false,testing:false};
  if(strict){
    const bars=closedPriceBars(snap,now).filter(b=>b.from>=main.createdAt&&b.to<=main.deadline);
    const brokenBar=bars.find(b=>crossed(b.close));
    return{broken:!!brokenBar,testing:crossed(price)&&!brokenBar,evidence:brokenBar?{...brokenBar,level,source:'closed-5s-structure'}:null};
  }
  const bars=new Map(),seen=new Set();
  for(const q of [...(snap.quoteHistory||[])].sort((a,b)=>Number(a.ts)-Number(b.ts))){
    const ts=Number(q.ts),p=Number(q.price);
    if(!Number.isFinite(ts)||!Number.isFinite(p)||p<=0||ts<main.createdAt||ts>now||ts>Number(snap.quoteTs??now)||seen.has(ts))continue;
    seen.add(ts);const from=Math.floor(ts/5000)*5000,to=from+5000;
    if(to>now||to>main.deadline)continue;
    const old=bars.get(from);
    bars.set(from,{from,to,close:p,quoteTs:ts,count:(old?.count||0)+1,firstTs:old?.firstTs??ts});
  }
  // A sparse/old sample cannot be presented as a completed price bar.
  const brokenBar=[...bars.values()].find(b=>b.count>=2&&b.quoteTs>=b.to-2500&&crossed(b.close));
  return{broken:!!brokenBar,testing:crossed(price)&&!brokenBar,evidence:brokenBar?{...brokenBar,level,source:'closed-5s-structure'}:null};
}
