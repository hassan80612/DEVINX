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
// A reversal belongs to an OPPORTUNITY opened at an arbitrary timestamp.
// The broker's wall-clock 5s grid must not hide the first complete 5s bar
// merely because the window opened between two wall-clock boundaries.
// Keep the established quote coverage checks; only anchor the two buckets.
function openingBars(quotes,now,openAt,periodSeconds=5,count=2){
 const ms=periodSeconds*1000;
 if(!(Number.isFinite(openAt)&&openAt>0&&now>=openAt+ms*count))return null;
 const complete=Math.floor((now-openAt)/ms);
 const end=openAt+complete*ms;
 const bars=[];
 for(let i=count;i>0;i--){
  const from=end-i*ms,to=from+ms;
  const q=quotes.filter(x=>x.ts>=from&&x.ts<to);
  const edge=Math.min(8000,ms*.45),maxGap=Math.min(8000,ms*.8);
  if(q.length<2||q[0].ts-from>edge||to-q.at(-1).ts>edge+1000||
     q.some((v,j)=>j>0&&v.ts-q[j-1].ts>maxGap))return null;
  bars.push({from,to,open:q[0].price,close:q.at(-1).price,
   high:Math.max(...q.map(x=>x.price)),low:Math.min(...q.map(x=>x.price)),samples:q.length});
 }
 return bars;
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
export function confirmedStructuralReversal({window,snap={},now=Date.now()}={}){
 if(window?.phase!=='open'||!isSide(window.side))return {invalidated:false,reason:'not-open'};
 const ts=Number(snap.quoteTs||0),openAt=Number(window.openedAt||window.windowStartedAt||0);
 if(!(ts>0&&ts<=now&&now-ts<=2500&&openAt>0))return {invalidated:false,reason:'missing-fresh-quote'};
 const history=quotesUntil(snap.quoteHistory,now),q=history.filter(x=>x.ts>=openAt);
 // Two completed 5s bars after the original opportunity opened.
 const bars=openingBars(q,now,openAt,5,2);
 if(!bars)return {invalidated:false,reason:'waiting-closed-reversal-bars'};
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
 const opposedImpulse=against*Math.log(bars[1].close/bars[0].open);
 // Compare the 10s opposite displacement against the LAST 10s completed
 // pre-window leg. This prevents a minor rebound in a persistent trend
 // from appearing structurally stronger merely because 1s noise is small.
 // Missing previous samples preserve the established cancellation formula.
 const previous=history.filter(x=>x.ts<=openAt-10000).at(-1);
 const opening=history.find(x=>x.ts>=openAt);
 const priorMove=previous&&opening&&opening.ts-previous.ts<=13500?
   (window.side==='CALL'?1:-1)*Math.log(opening.price/previous.price):null;
 const priorAligned=priorMove!=null&&priorMove>noise*.1;
 const dominatesPrior=!priorAligned||opposedImpulse>=priorMove*2.2;
 const confirmed=breakLevel&&microBreak&&opposedImpulse>noise*.45&&
   dominatesPrior;
 return {invalidated:confirmed,reason:confirmed?'confirmed-opposite-structure':
  'retracement-without-structure-break'};
}
