// Sentinel 13.7: causal, read-only structural validation of an already
// selected strategy. Never generates a CALL/PUT or authorizes an order.
import {observedNoise} from './forward-direction-quality.mjs';

const isSide=s=>s==='CALL'||s==='PUT';
const sign=s=>s==='CALL'?1:-1;
function quotesUntil(history,now){
 const seen=new Map();
 for(const q of history||[]){
  const ts=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??ts);
  if(Number.isFinite(ts)&&Number.isFinite(p)&&p>0&&ts<=now&&ts>=now-240000&&
     Number.isFinite(received)&&received<=now)seen.set(ts,{ts,price:p});
 }
 return [...seen.values()].sort((a,b)=>a.ts-b.ts);
}
function closedBars(quotes,now,periodSeconds,count=3){
 const ms=periodSeconds*1000,end=Math.floor(now/ms)*ms,rows=[];
 for(let i=count;i>0;i--){
  const from=end-i*ms,to=from+ms;
  const q=quotes.filter(x=>x.ts>=from&&x.ts<to);
  const edge=Math.min(8000,ms*.45),maxGap=Math.min(8000,ms*.8);
  if(q.length<(ms>=30000?3:2)||q[0].ts-from>edge||
     to-q.at(-1).ts>edge+1000||
     q.some((v,j)=>j>0&&v.ts-q[j-1].ts>maxGap))return null;
  rows.push({from,to,open:q[0].price,close:q.at(-1).price,
    high:Math.max(...q.map(x=>x.price)),low:Math.min(...q.map(x=>x.price)),
    samples:q.length});
 }
 return rows;
}
export function threeClosedCandleEvidence({quoteHistory=[],now=Date.now(),holdingSeconds=30}={}){
 const horizon=Number(holdingSeconds);
 const period=horizon>=30?30:horizon>=10?10:5;
 const q=quotesUntil(quoteHistory,now),bars=closedBars(q,now,period);
 if(!bars)return {ready:false,side:null,reason:'three-closed-candles-unavailable',periodSeconds:period};
 // Historical volatility is measured ONLY from completed candles. A sudden
 // quote on the forming candle must not relabel the three closed candles.
 const boundary=bars.at(-1).to;
 const closedQuotes=q.filter(x=>x.ts<boundary);
 const moves=bars.map(b=>Math.log(b.close/b.open));
 const total=Math.log(bars.at(-1).close/bars[0].open);
 const side=total>0?'CALL':total<0?'PUT':null;
 const agree=moves.filter(x=>side&&sign(side)*x>0).length;
 const last=moves.at(-1),noise=observedNoise({quotes:closedQuotes,now:boundary,horizonSeconds:period*3});
 // Three closed bars are evidence, not a claimed win probability. A strong
 // latest contrary bar invalidates the historical directional agreement.
 const strongContra=side&&sign(side)*last<0&&Math.abs(last)>=Math.abs(total)*.5;
 const strongEnough=Number.isFinite(noise)&&noise>0&&Math.abs(total)>=noise*.22;
 const direction=agree>=2&&strongEnough&&!strongContra?side:null;
 return {ready:true,side:direction,reason:direction?'three-closed-candles-aligned':
   'closed-candles-range-or-conflict',periodSeconds:period,
   bars,netMove:total,agree,noise,lastClose:bars.at(-1).close,
   lastHigh:bars.at(-1).high,lastLow:bars.at(-1).low};
}
export function brokerDurationGuard({snap={},settings={},now=Date.now()}={}){
 const duration=Number(snap.brokerExpirationDurationMs);
 const confidence=Number(snap.brokerExpirationConfidence||0);
 const updated=Number(snap.brokerExpirationUpdatedAt||0);
 const kind=String(snap.brokerExpirationKind||'');
 const selected=Number(settings.orderDurationMs||0);
 // Fixed-clock expiry is NOT a holding duration. Unknown metadata cannot be
 // silently interpreted as 5s/30s, or turn a read-only UI into a broker order.
 const verified=kind==='selected-duration'&&confidence>=.7&&updated>0&&
  now>=updated&&now-updated<=7000&&Number.isFinite(duration)&&duration>=5000;
 return {allowed:!verified||duration===selected,
  reason:verified&&duration!==selected?'broker-duration-mismatch':'ok',
  verified,brokerDurationMs:verified?duration:null,selectedDurationMs:selected};
}
export function guardOpeningCandidate({candidate,snap={},settings={},now=Date.now()}={}){
 const expiry=brokerDurationGuard({snap,settings,now});
 if(!expiry.allowed)return {allowed:false,reason:expiry.reason,evidence:null,expiry};
 if(!isSide(candidate?.side))return {allowed:false,reason:'no-direction',evidence:null,expiry};
 const evidence=threeClosedCandleEvidence({quoteHistory:snap.quoteHistory,now,
  holdingSeconds:Number(settings.orderDurationMs)/1000});
 const allowed=evidence.ready&&evidence.side===candidate.side;
 return {allowed,reason:allowed?'historical-direction-confirmed':
  evidence.reason==='three-closed-candles-aligned'?
   'candidate-conflicts-with-closed-candles':evidence.reason,evidence,expiry};
}
// Use the same complete 5s bars as the legacy guard, but align them to the
// FIRST actual signal quote if the CALL/PUT was admitted after the fixed
// countdown had already begun. Prices from before the side existed cannot
// be proof of a subsequent reversal. This is not a new entry veto/delay.
function admittedClosedBars(quotes,now,admittedAt,count=2){
 const ms=5000,complete=Math.floor((now-admittedAt)/ms);
 if(complete<count)return null;
 const end=admittedAt+complete*ms,rows=[];
 for(let i=count;i>0;i--){
  const from=end-i*ms,to=from+ms;
  const q=quotes.filter(x=>x.ts>=from&&x.ts<to);
  const edge=Math.min(8000,ms*.45),maxGap=Math.min(8000,ms*.8);
  if(q.length<2||q[0].ts-from>edge||to-q.at(-1).ts>edge+1000||
    q.some((v,j)=>j>0&&v.ts-q[j-1].ts>maxGap))return null;
  rows.push({from,to,open:q[0].price,close:q.at(-1).price,
    high:Math.max(...q.map(x=>x.price)),low:Math.min(...q.map(x=>x.price)),
    samples:q.length});
 }
 return rows;
}
export function confirmedStructuralReversal({window,snap={},now=Date.now()}={}){
 if(window?.phase!=='open'||!isSide(window.side))return {invalidated:false,reason:'not-open'};
 // 'openedAt' is the original CLOCK-cycle start, not necessarily when
 // this CALL/PUT was first admitted. Its guardBaseline is taken from the
 // live quote AT admission. Only post-admission bars may invalidate that side.
 // Legacy windows without this field keep their original behavior.
 const ts=Number(snap.quoteTs||0);
 const openAt=Number(window.admittedAt||window.openedAt||window.windowStartedAt||0);
 if(!(ts>0&&ts<=now&&now-ts<=2500&&openAt>0))return {invalidated:false,reason:'missing-fresh-quote'};
 const history=quotesUntil(snap.quoteHistory,now),q=history.filter(x=>x.ts>=openAt);
 // Two completed 5s bars after the original opportunity opened.
 const cycleAt=Number(window.openedAt||window.windowStartedAt||0);
 const lateAdmission=Number(window.admittedAt)>cycleAt;
 const bars=lateAdmission?admittedClosedBars(q,now,openAt,2):
   closedBars(q,now,5,2);
 if(!bars||bars[0].from<openAt)return {invalidated:false,reason:'waiting-closed-reversal-bars'};
 const against=window.side==='PUT'?1:-1;
 const moves=bars.map(b=>Math.log(b.close/b.open));
 if(!moves.every(m=>against*m>0))return {invalidated:false,reason:'ordinary-retracement'};
 // A reversal is relative to the price when THIS window opened. The last
 // completed 30s close may belong to the previous leg.
 const baseline=Number(window.guardBaseline?.referencePrice??window.guardBaseline?.lastClose);
 if(!(baseline>0))return {invalidated:false,reason:'missing-open-structure'};
 const latest=history.at(-1);
 if(!latest||now-latest.ts>2500)return {invalidated:false,reason:'stale-market'};
 const noise=observedNoise({quotes:history,now,horizonSeconds:5});
 if(!(noise>0))return {invalidated:false,reason:'insufficient-structural-noise'};
 const breakLevel=against*Math.log(latest.price/baseline)>noise*.55;
 const microBreak=against*(bars[1].close-(against>0?bars[0].high:bars[0].low))>
   baseline*noise*.10;
 const confirmed=breakLevel&&microBreak&&against*Math.log(bars[1].close/bars[0].open)>noise*.45;
 return {invalidated:confirmed,reason:confirmed?'confirmed-opposite-structure':
  'retracement-without-structure-break'};
}
