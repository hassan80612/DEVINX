// Last pre-signal price comparison against ACTUALLY CLOSED broker candles.
// No strategy rewrites, invented candles, artificial timers or side flips.
import {entryFamilyOf} from './entry-family.mjs';
const dir=s=>s==='CALL'?1:s==='PUT'?-1:0;
const epoch=v=>{const n=Number(v);return n>0?(n<1e12?n*1000:n):0};
const median=values=>{const xs=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);return xs.length?xs[Math.floor(xs.length/2)]:0};
const veto=(c,reason,proof)=>({...c,ready:false,side:null,provisionalSide:c.side,reason,previousPriceProof:proof});
export function reviewPreviousClosedCandlePrice({candidate,candles=[],quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(candidate?.ready!==true||![30000,60000].includes(Number(durationMs))||!dir(candidate.side))return candidate;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),d=dir(candidate.side);
 if(!(at>0&&at<=clock&&clock-at<=1950&&spot>0&&Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))return candidate;
 const groups=new Map();
 for(const c of Array.isArray(candles)?candles:[]){
  const from=epoch(c?.from??c?.ts),to=epoch(c?.to??(from?from+60000:0));
  const o=Number(c?.open),h=Number(c?.high),l=Number(c?.low),close=Number(c?.close);
  if(!(from>0&&to>from&&to<=at&&to-from<=300000&&
    Number(c?.receivedAt??0)<=clock&&[o,h,l,close].every(v=>Number.isFinite(v)&&v>0)&&
    h>=Math.max(o,close)&&l<=Math.min(o,close)))continue;
  const period=to-from;
  if(!groups.has(period))groups.set(period,new Map());
  groups.get(period).set(from,{from,to,open:o,high:h,low:l,close});
 }
 const collections=[...groups.values()].map(g=>[...g.values()].sort((a,b)=>a.from-b.from))
  .filter(s=>s.length&&at-s.at(-1).to<=Math.max(15000,(s.at(-1).to-s.at(-1).from)*2))
  .sort((a,b)=>b.at(-1).to-a.at(-1).to||b.length-a.length);
 const rows=collections[0]?.slice(-100)||[];
 if(rows.length<3)return veto(candidate,'entry-missing-previous-closed-candle-price',{kind:'missing-candle-context'});
 const last=rows.at(-1),three=rows.slice(-3),ten=rows.slice(-10);
 const tail=rows.slice(-15),ranges=tail.slice(1).map((c,i)=>Math.max(c.high-c.low,
  Math.abs(c.high-tail[i].close),Math.abs(c.low-tail[i].close)));
 const atr=Math.max(median(ranges),spot*1e-8),dLast=d*(last.close-last.open);
 const hi3=Math.max(...three.map(c=>c.high)),lo3=Math.min(...three.map(c=>c.low));
 const hi10=Math.max(...ten.map(c=>c.high)),lo10=Math.min(...ten.map(c=>c.low));
 const edge3=d>0?hi3:lo3,edge10=d>0?hi10:lo10;
 const from3=d*(spot-edge3),from10=d*(spot-edge10);
 const threeMove=d*(last.close-three[0].open);
 const near3=from3>=-atr*.17,near10=from10>=-atr*.14;
 const outside3=from3>=atr*.45,outside10=from10>=atr*.35;
 const quoteRows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  return Number.isFinite(ts)&&ts>=at-12000&&ts<=at&&received<=clock&&p>0;
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(quoteRows.at(-1)?.ts!==at||quoteRows.at(-1)?.price!==spot||
   quoteRows.some((q,i)=>i>0&&(q.ts<=quoteRows[i-1].ts||q.ts-quoteRows[i-1].ts>2500)))
  return veto(candidate,'entry-price-tape-unverified',{kind:'missing-live-tape'});
 const before=(target,delta=2000)=>{
  for(let i=quoteRows.length-1;i>=0;i--)if(quoteRows[i].ts<=target)
   return target-quoteRows[i].ts<=delta?quoteRows[i].price:null;
  return null;
 };
 const p3=before(at-3000),p6=before(at-6000);
 if(p3==null||p6==null)return veto(candidate,'entry-price-tape-unverified',{kind:'missing-current-turn'});
 const move3=d*(spot-p3),move6=d*(spot-p6);
 const lastStep=quoteRows.length>=2?d*(spot-quoteRows.at(-2).price):0;
 const windows=[3,10,20,50,100].filter(n=>rows.length>=n).map(n=>{
  const look=rows.slice(-n);
  return {size:n,high:Math.max(...look.map(c=>c.high)),low:Math.min(...look.map(c=>c.low)),
   closeMove:d*(look.at(-1).close-look[0].open)};
 });
 const proof={lastClosedAt:last.to,lastOpen:last.open,lastClose:last.close,lastHigh:last.high,lastLow:last.low,
  atr,windowHigh3:hi3,windowLow3:lo3,windowHigh10:hi10,windowLow10:lo10,
  windows,from3,from10,previousThreeMove:threeMove,live3Move:move3,live6Move:move6,
  family:entryFamilyOf(candidate)};
 const family=entryFamilyOf(candidate);
 if(family==='continuation'){
  const verifiedBreak=['historical-level-breakout','break-retest-continuation'].includes(candidate.reason)&&
   from3>=atr*.12&&move3>=atr*.12&&move6>=atr*.18&&lastStep>=0;
  if(!verifiedBreak&&(outside3||outside10||
    (near3&&(dLast<=0||threeMove<=atr*.2||move3<=atr*.08||lastStep<0))||
    (near10&&move3<=atr*.10)))
   return veto(candidate,'closed-candle-price-opposes-continuation',proof);
  return {...candidate,previousPriceProof:{...proof,decision:'KEEP'}};
 }
 if(family==='reversal'){
  const observedTurn=move3>=atr*.14&&move6>=atr*.19&&lastStep>=0;
  const againstPrevious=dLast<0&&d*(spot-last.close)<atr*.24;
  const chasingWrongEdge=(d>0?spot>=hi3-atr*.16:spot<=lo3+atr*.16)&&dLast<0;
  if(!observedTurn||againstPrevious||chasingWrongEdge)
   return veto(candidate,'closed-candle-reversal-not-supported-by-live-price',proof);
  return {...candidate,previousPriceProof:{...proof,decision:'KEEP'}};
 }
 if((near3||outside3)&&(dLast<=0||move3<=atr*.08))
  return veto(candidate,'unknown-entry-type-at-closed-candle-extreme',proof);
 return {...candidate,previousPriceProof:{...proof,decision:'KEEP'}};
}
