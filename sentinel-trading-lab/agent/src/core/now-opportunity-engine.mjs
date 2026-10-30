import {levelRoleEvidence} from './level-role-evidence.mjs';
import {entryFamilyOf} from './entry-family.mjs';
// Read-only current-entry analysis for the Sentinel Agent. Never sends orders
// or schedules a future entry. The 30s projection uses observed past prices;
// the shared lifecycle owns the current entry and immutable holding window.
import {observedNoise} from './forward-direction-quality.mjs';
import {currentStrategyEvidence} from './now-strategy-evidence.mjs';
import {automaticChartContext} from './automatic-chart-context.mjs';
import {causalPatternDirection} from './causal-pattern-direction.mjs';
import {thirtySecondCycleForecast} from './thirty-second-expiry-direction.mjs';
import {historicalPriceStructure,applyHistoricalPriceStructure} from './historical-price-structure.mjs';
import {applyCandleLevelRoute} from './candle-level-map.mjs';
import {applyObservedLevelSequence} from './observed-level-sequence.mjs';
import {countertrendPivotRisk} from './shared-pivot-guard.mjs';
import {verifiedWallExhaustionRisk} from './verified-wall-exhaustion.mjs';
import {continuationRoomRisk} from './continuation-room-risk.mjs';
import {liveEntryContradiction} from './live-entry-contradiction.mjs';
import {observedQuoteWindow} from './observed-quote-window.mjs';
import {specialistLevelRoleRisk} from './level-role-evidence.mjs';

const sideOf=v=>v>0?'CALL':v<0?'PUT':null;
const sign=side=>side==='CALL'?1:-1;
const isSide=side=>side==='CALL'||side==='PUT';
const finitePrice=p=>Number.isFinite(Number(p))&&Number(p)>0;
export const POST_EXPIRY_REASSESS_MS=3000;
// Low-price continuation without a verified breakdown is not a valid
// excuse to chase the final portion of a completed downward impulse.
// History already buffered by the Agent: zero broker reads, fixed short scan.
export function lateUnverifiedFloorImpulseRisk({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 // Only the audited 60-second signal horizon is changed. Earlier 30-second\n // reference winners and 5/10/15-second entries are preserved.\n // Price-extreme protection is shared by level and impulse forecasts:
 // a reason label cannot exempt selling the end of an observed decline.
 // A breakout label alone is not proof; the measured new-low check below
 // keeps a genuinely verified breakdown eligible.
 const expiry=Number(durationMs??(Number(candidate?.expirySeconds)*1000));
 if(candidate?.ready!==true||candidate.side!=='PUT'||
  expiry!==60000||
  ['confirmed-fast-level-reversal',
   'closed-range-extreme-reversal-confirmed'].includes(candidate.reason))return null;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(at>0&&clock>=at&&clock-at<=1450&&spot>0&&
   Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))return null;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],ts=Number(q?.ts);
  if(ts<at-90000)break;
  if(ts>at||Number(q?.receivedAt??ts)>clock)continue;
  const p=Number(q?.price);
  if(!(p>0))return null;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<30||at-rows[0].ts<45000||
  rows.at(-1).ts!==at||rows.at(-1).price!==spot)return null;
 let low=Infinity,high=-Infinity,priorLow=Infinity;
 const steps=[];
 for(let i=0;i<rows.length;i++){
  const q=rows[i];
  if(i&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>5000))return null;
  low=Math.min(low,q.price);high=Math.max(high,q.price);
  if(q.ts<=at-8000)priorLow=Math.min(priorLow,q.price);
  if(i&&q.ts-rows[i-1].ts<=3000){
   const move=Math.abs(q.price-rows[i-1].price);
   if(move>0)steps.push(move);
  }
 }
 const width=high-low;
 if(!(width>spot*1e-7&&Number.isFinite(priorLow)&&steps.length>=10))return null;
 const position=(spot-low)/width;
 if(position>.20)return null;
 steps.sort((a,b)=>a-b);
 const typical=steps[Math.floor(steps.length/2)];
 // A significant NEW verified downward break retains the continuation path.
 // Otherwise wait for the independently assessed current-price reversal;
 // do not reverse a signal merely because the price is low.
 if(priorLow-spot>Math.max(typical*3,width*.1))return null;
 return {kind:'unverified-late-put-near-recent-floor',position,rangeSeconds:90,
  priorLow,typicalStep:typical};
}
// Strict five-minute exception: ONLY an observed and confirmed reversal can
// authorize a CALL/PUT. Trend continuations, breakouts, forecasts, EMA alignment
// and old turns remain explanatory evidence, never trade permission.
const CONTINUATION_SETUP=/continuation|followthrough|breakout|trend|impulse|cycle|analogue|forecast/i;
const CONFIRMED_REVERSAL_SET=new Set([
 'closed-range-extreme-reversal-confirmed','confirmed-level-structure-reversal',
 'confirmed-fast-level-reversal','failed-breakout-structure-change',
 'multiscale-candle-rejection','historical-level-rejection','observed-multi-interval-trend-correction','rejection-followthrough-clear-room'
]);
const phaseLabel=phase=>({
 continuing:'CONTINUIDADE',
 weakening:'CONTINUIDADE PERDENDO FORÇA',
 'reversal-testing':'REVERSÃO EM TESTE',
 'reversal-forming':'REVERSÃO EM FORMAÇÃO',
 'reversal-confirmed':'REVERSÃO CONFIRMADA',
 range:'LATERAL',
 mixed:'INCONCLUSIVO',
 insufficient:'OBSERVANDO'
}[phase]||'OBSERVANDO');

// Reads only quotes already received. Weakening persistence is not itself a
// reversal: the opposite side still needs its own ready structural candidate.
export function assessDirectionalPersistence({quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const horizon=Number(durationMs);
 if(horizon!==30000&&horizon!==60000)return{phase:'insufficient',side:null};
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(at>0&&at<=clock&&spot>0&&clock-at<=2500))return{phase:'insufficient',side:null};
 const windowMs=horizon===30000?12000:20000;
 const middleMs=horizon===30000?4000:7000;
 const recentMs=horizon===30000?1200:1800;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],ts=Number(q?.ts),p=Number(q?.price);
  if(ts<at-windowMs-2500)break;
  if(ts>at||Number(q?.receivedAt??ts)>clock||!(p>0))continue;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<5||rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot||
   rows.some((q,i)=>i>0&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))
  return{phase:'insufficient',side:null,windowMs};
 const old=before(rows,at-windowMs,2500),mid=before(rows,at-middleMs,1800),
  recent=before(rows,at-recentMs,1500);
 if(!old||!mid||!recent)return{phase:'insufficient',side:null,windowMs};
 const net=Math.log(spot/old.price),side=sideOf(net);
 if(!side)return{phase:'range',side:null,windowMs};
 const direction=sign(side),early=direction*Math.log(mid.price/old.price),
  late=direction*Math.log(spot/mid.price),fast=direction*Math.log(spot/recent.price);
 let travel=0;
 for(let i=1;i<rows.length;i++)travel+=Math.abs(Math.log(rows[i].price/rows[i-1].price));
 const prices=rows.map(q=>q.price),range=Math.log(Math.max(...prices)/Math.min(...prices));
 const threshold=Math.max(range*.06,travel*.008,1e-12);
 const efficiency=travel>0?Math.abs(net)/travel:0;
 const retracement=range>0?Math.max(0,direction>0?
  Math.log(Math.max(...prices)/spot):Math.log(spot/Math.min(...prices)))/range:0;
 let phase='mixed';
 if(efficiency<.18||Math.abs(net)<=threshold)phase='range';
 else if(late< -threshold&&fast< -threshold&&retracement>=.16)phase='reversal-testing';
 else if(early>threshold&&(late<=Math.max(threshold,early*.35)||fast< -threshold))
  phase='weakening';
 else if(late>threshold&&fast>=-threshold&&efficiency>=.20)phase='continuing';
 return{phase,side,windowMs,netMove:Number(net.toPrecision(6)),
  earlyMove:Number(early.toPrecision(6)),lateMove:Number(late.toPrecision(6)),
  latestMove:Number(fast.toPrecision(6)),efficiency:Number(efficiency.toFixed(3)),
  retracement:Number(retracement.toFixed(3))};
}
function confirmedReversalCandidate(candidate){
 const reason=String(candidate?.reason||'');
 if(!candidate?.ready||!isSide(candidate.side)||!CONFIRMED_REVERSAL_SET.has(reason))return false;
 if(reason==='closed-range-extreme-reversal-confirmed')
  return candidate.regime==='observed-range-turn';
 if(reason==='rejection-followthrough-clear-room'){
  const event=candidate.priceStructure?.observedSequence?.continuation;
  return event?.kind===reason&&event?.side===candidate.side&&
   Number(event.confirmedAt)>0&&Number(event.confirmedAt)<=Number(candidate.observedAt);
 }
 if(reason==='historical-level-rejection')
  return candidate.priceStructure?.reactionProof?.confirmed===true||
   candidate.priceStructure?.confirmedReversal?.side===candidate.side;
 return true;
}
export function reviewDirectionalPersistence({candidate,quoteHistory,quoteAt,now,price,durationMs}={}){
 const horizon=Number(durationMs);
 // Only the requested 30s and 1m continuations are screened. Routine waiting
 // and admitted results retain their established shape.
 if((horizon!==30000&&horizon!==60000)||!candidate||typeof candidate!=='object'||
   candidate.ready!==true||!isSide(candidate.side))return candidate;
 const state=assessDirectionalPersistence({quoteHistory,quoteAt,now,price,durationMs});
 // The short-horizon failed-breakout case from the review had no confirming
 // final move while the live state was still a range. Keep this narrowly
 // tied to that explicit contradiction; other reversal families stay intact.
 const proof=candidate.priceStructure?.reactionProof;
 if([30000,60000].includes(horizon)&&
   ['failed-breakout-structure-change','closed-range-extreme-reversal-confirmed'].includes(candidate.reason)&&
   state.phase==='range'&&proof?.confirmed===false&&
   proof.reason==='last-move-not-supporting')
  return {...candidate,trendPersistence:state,marketPhase:state.phase,
   marketPhaseLabel:phaseLabel(state.phase),marketTrendSide:state.side||null,
   ready:false,side:null,provisionalSide:candidate.side,
   reason:candidate.reason==='closed-range-extreme-reversal-confirmed'?
    'range-turn-without-current-price-support':'Rompimento sem confirmação do último movimento; leitura lateral.'};
 if(!isSide(state.side))return candidate;
 const diagnostic={trendPersistence:state,marketPhase:state.phase,
  marketPhaseLabel:phaseLabel(state.phase),marketTrendSide:state.side||null};
 const shallowCountertrendFastReversal=
  candidate.reason==='confirmed-fast-level-reversal'&&candidate.side!==state.side&&
  state.phase==='reversal-testing'&&Number(state.retracement)<.25;
 if(shallowCountertrendFastReversal)
  return {...candidate,...diagnostic,ready:false,side:null,provisionalSide:candidate.side,
   reason:'Reversão rápida ainda rasa contra o fluxo maior.'};
 // A historical "confirmed" label must not authorize the OLD trend
 // once the fresh price is moving the opposite way. This never creates
 // an opposite CALL/PUT; a real reversal needs its own confirmed signal.
 if(candidate.side===state.side&&
    ['weakening','reversal-testing'].includes(state.phase)&&
    Number(state.latestMove)<0)
  return {...candidate,...diagnostic,ready:false,side:null,
   provisionalSide:candidate.side,reason:'live-turn-opposes-stale-direction'};
 if(confirmedReversalCandidate(candidate))return candidate;
 const continuation=entryFamilyOf(candidate)==='continuation'||
   CONTINUATION_SETUP.test(String(candidate.reason||''));
 const fading=['weakening','reversal-testing'].includes(state.phase);
 if(candidate.side===state.side&&continuation&&fading)
  return{...candidate,...diagnostic,ready:false,side:null,provisionalSide:candidate.side,
   reason:'Continuidade perdendo força; aguardando retomada ou reversão estrutural confirmada.'};
 if(candidate.side!==state.side&&continuation&&state.phase==='continuing')
  return{...candidate,...diagnostic,ready:false,side:null,provisionalSide:candidate.side,
   reason:'Fluxo anterior ainda persistente; reversão contrária sem confirmação estrutural.'};
 return candidate;
}

export function fiveMinuteReversalOnly({candidate,durationMs,quoteAt,now=quoteAt,price,quoteHistory=[],entryFamily='reversal',structure=null}={}){
 if(Number(durationMs)!==300000||candidate?.ready!==true)return candidate;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 const valid=Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot&&
  at>0&&at<=clock&&clock-at<=2500&&spot>0&&isSide(candidate.side);
 if(valid&&entryFamily!=='reversal'&&entryFamilyOf(candidate)==='continuation'){
  const quotes=causalQuotes(quoteHistory,now,300000).filter(q=>q.ts<=at);
  const noise=observedNoise({quotes,now:at,horizonSeconds:60});
  const longer=longHorizonDirection({quotes,quoteAt:at,price:spot,durationMs,noise});
  if(longer.ready&&longer.significant&&longer.side===candidate.side){
   const map=structure?.candleLevelMap,tol=Number(map?.tolerance||structure?.tolerance),sign=candidate.side==='CALL'?1:-1;
   const wall=tol>0&&map?.asOf<=now&&map.levels?.find(z=>{
    const role=levelRoleEvidence(z,sign>0?'PUT':'CALL'),gap=sign>0?Number(z.low)-spot:spot-Number(z.high);
    return role.pivots>=1&&role.rejections>=2&&gap>=0&&gap<=tol*1.25;
   });
   if(wall)return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
    reason:'five-minute-continuation-without-clearance',entryRisk:{kind:'continuation-retesting-uncleared-opposing-wall',level:wall.level}};
   return {...candidate,fiveMinuteContextConfirmed:true};
  }

  return {...candidate,ready:false,side:null,provisionalSide:candidate.side,reason:'five-minute-continuation-without-horizon-context'};
 }
 const proof=candidate.priceStructure||{},reason=candidate.reason;
 const current=e=>e&&e.side===candidate.side&&Number(e.confirmedAt)>0&&
  Number(e.confirmedAt)<=at&&at-Number(e.confirmedAt)<=2500;
 // A short oscillating range cannot by itself justify a five-minute hold.
 // A mapped structural turn can still qualify immediately through levelTurn
 // or reclaimed below; no blanket wait for another candle is introduced.
 const rangeTurn=reason==='closed-range-extreme-reversal-confirmed'&&
  candidate.regime==='observed-range-turn'&&
  Number(candidate.observedSwingSeconds)*1.35>=Number(durationMs)/1000;
 const levelTurn=reason==='confirmed-level-structure-reversal'&&
  proof.confirmedReversal?.kind===reason&&current(proof.confirmedReversal);
 const reclaimed=reason==='failed-breakout-structure-change'&&
  proof.observedSequence?.structureChange?.kind===reason&&current(proof.observedSequence.structureChange);
 const rejected=reason==='historical-level-rejection'&&
  proof.reaction?.kind==='rejection'&&proof.reaction.side===candidate.side&&
  proof.reactionProof?.confirmed===true&&proof.reactionProof?.kind==='sustained-level-reversal'&&
  Number(proof.reactionProof.durationMs)===300000;
 if(valid&&(rangeTurn||levelTurn||reclaimed||rejected))
  return {...candidate,fiveMinuteReversalConfirmed:true,fiveMinuteContextConfirmed:true};
 return {...candidate,ready:false,side:null,reason:'five-minute-reversal-only-awaiting-proof',
  fiveMinuteReversalConfirmed:false};
}
// Later evidence can revise a proposed side. Recheck that FINAL direction
// against the same shared market safeguards; never rerun a learning selector.
export function reviewChangedOpportunitySide({candidate,previousSide,quoteHistory=[],
 quoteAt,price,now=quoteAt,durationMs=null,candles=[],structureCache=null,context=''}={}){
 if(candidate?.ready!==true||!isSide(candidate.side)||candidate.side===previousSide)return candidate;
 const pivotRisk=countertrendPivotRisk({quoteHistory,quoteAt,price,side:candidate.side,now,durationMs,
  reversalEvidence:candidate.priceStructure?.confirmedReversal??candidate.priceStructure?.observedSequence?.structureChange});
 const structure=structureCache?structureCache.get({candles,now,context}):historicalPriceStructure({candles,now});
 const wallRisk=!pivotRisk?verifiedWallExhaustionRisk({candidate,structure,quoteHistory,quoteAt,now,price}):null;
 const roomRisk=!pivotRisk&&!wallRisk?continuationRoomRisk({candidate,structure,quoteHistory,quoteAt,now,price,durationMs}):null;
 const floorRisk=!pivotRisk&&!wallRisk&&!roomRisk?
  lateUnverifiedFloorImpulseRisk({candidate,quoteHistory,quoteAt,now,price,durationMs}):null;
 const liveRisk=!pivotRisk&&!wallRisk&&!roomRisk&&!floorRisk?liveEntryContradiction({candidate,quoteHistory,quoteAt,now,price}):null;
 return pivotRisk?{...candidate,ready:false,side:null,reason:'final-side-countertrend-pivot-risk'}:
  wallRisk?{...candidate,ready:false,side:null,reason:'final-side-verified-wall-exhaustion',entryRisk:wallRisk}:
  roomRisk?{...candidate,ready:false,side:null,reason:'final-side-continuation-wall-pressure',entryRisk:roomRisk}:
  floorRisk?{...candidate,ready:false,side:null,reason:'final-side-unverified-floor-impulse',entryRisk:floorRisk}:
  liveRisk?{...candidate,ready:false,side:null,reason:'final-side-live-evidence-conflict',entryRisk:liveRisk}:candidate;
}
function causalQuotes(history,now,windowMs=180000){
 return observedQuoteWindow({history,at:now,now,windowMs});
}
function closingBars(quotes,now,barMs,count=4){
 const end=Math.floor(now/barMs)*barMs,all=[];
 for(let k=count;k>0;k--){
  const from=end-k*barMs,to=from+barMs;
  const ticks=quotes.filter(q=>q.ts>=from&&q.ts<to);
  // Each completed bar needs observations near both ends. An interpolation
  // over gaps must never masquerade as actual broker price structure.
  const gap=Math.min(3500,barMs*.46);
  if(ticks.length<2||ticks[0].ts-from>gap||
    to-ticks.at(-1).ts>gap+500||
    ticks.some((t,i)=>i>0&&t.ts-ticks[i-1].ts>Math.max(2800,barMs*.55)))
    return null;
  all.push({from,to,open:ticks[0].price,close:ticks.at(-1).price,
    high:Math.max(...ticks.map(t=>t.price)),low:Math.min(...ticks.map(t=>t.price))});
 }
 return all;
}
function before(quotes,at,maxAgeMs=3500){
 for(let i=quotes.length-1;i>=0;i--)if(quotes[i].ts<=at)
  return at-quotes[i].ts<=maxAgeMs?quotes[i]:null;
 return null;
}

// Recognize genuinely observed two-sided market oscillations using CLOSED
// 5-second prices from the past, not future projections or forming candles.
// Return null for a directional regime; return a verdict when past alternation
// means a short-term impulse is a potentially misleading end-of-range leg.
export function completedRangeStructure(quotes,now,noise,spot,holdingMs=30000){
 const period=5000,end=Math.floor(now/period)*period;
 const last=quotes.filter(q=>q.ts>=end-135000&&q.ts<=now);
 if(last.length<50||last.at(-1).ts-last[0].ts<50000)return null;
 // Bucket real observed ticks once. Scanning the entire 135-second
 // tape again for every 5-second bar was a quadratic hot path on each tick.
 // Preserve the exact candle boundaries, ordering and evidence requirements.
 const observedByBar=new Map();
 for(const q of last){
  if(q.ts<end-130000||q.ts>=end)continue;
  const bin=Math.floor(q.ts/period)*period;
  if(!observedByBar.has(bin))observedByBar.set(bin,[]);
  observedByBar.get(bin).push(q);
 }
 const closes=[];
 for(let t=end-130000;t<end;t+=period){
  const part=observedByBar.get(t)||[];
  if(part.length<2||part[0].ts-t>3000||
    t+period-part.at(-1).ts>3500||
    part.some((q,i)=>i>0&&q.ts-part[i-1].ts>3500))continue;
  closes.push({at:t,price:part.at(-1).price,log:Math.log(part.at(-1).price)});
 }
 if(closes.length<10)return null;
 // A directional trend with small pullbacks has high total path efficiency.
 // A long oscillation traverses both directions, returning near its origin.
 let travelled=0;
 for(let i=1;i<last.length;i++){
  if(last[i].ts-last[i-1].ts<=3500)
   travelled+=Math.abs(Math.log(last[i].price/last[i-1].price));
 }
 const net=Math.abs(Math.log(last.at(-1).price/last[0].price));
 const efficiency=travelled>0?net/travelled:1;
 // A noisy REAL downtrend can have very low 1-second path efficiency.
 // Distinguish net directional travel from alternating price extremes
 // using a causal 90-second linear-fit strength, not net/path alone.
 const regression=last.filter(x=>x.ts>=now-90000);
 let meanT=0,meanP=0;
 for(const q of regression){meanT+=(q.ts-now)/1000;meanP+=Math.log(q.price);}
 meanT/=regression.length;meanP/=regression.length;
 let xx=0,yy=0,xy=0;
 for(const q of regression){
  const x=(q.ts-now)/1000-meanT,y=Math.log(q.price)-meanP;
  xx+=x*x;yy+=y*y;xy+=x*y;
 }
 const trendFit=xx>0&&yy>0?xy*xy/(xx*yy):0;
 if(trendFit>=.70)return null;
 const pivots=[];
 for(let i=2;i<closes.length-2;i++){
  const near=[closes[i-2],closes[i-1],closes[i+1],closes[i+2]];
  const hi=closes[i].log>Math.max(...near.map(x=>x.log));
  const lo=closes[i].log<Math.min(...near.map(x=>x.log));
  if(hi||lo){
   const observed=last.filter(q=>q.ts>=closes[i-1].at&&q.ts<closes[i+2].at);
   pivots.push({at:closes[i].at,type:hi?'HIGH':'LOW',
     level:hi?Math.max(...observed.map(q=>Math.log(q.price))):
       Math.min(...observed.map(q=>Math.log(q.price)))});
  }
 }
 if(pivots.length<2)return null;
 // Two confirmed opposite pivots already establish provisional bounds.
 const recent=pivots.slice(-4),gaps=recent.slice(1).map((p,i)=>(p.at-recent[i].at)/1000);
 const sorted=[...gaps].sort((a,b)=>a-b),half=sorted[Math.floor(sorted.length/2)];
 const minGap=Math.min(...gaps),maxGap=Math.max(...gaps);
 // Established range boundaries come from ALREADY CONFIRMED past pivots.
 // Including the current price here made every new high its own resistance
 // and every new low its own support, mislabeling breakouts as reversals.
 const highs=pivots.filter(p=>p.type==='HIGH').slice(-2);
 const lows=pivots.filter(p=>p.type==='LOW').slice(-2);
 if(!highs.length||!lows.length)return null;
 const upper=Math.max(...highs.map(p=>p.level));
 const lower=Math.min(...lows.map(p=>p.level));
 const span=upper-lower;
 if(!(span>noise*1.10))return null;
 const boundaryTolerance=Math.max(noise*.10,span*.02);
 if(Math.log(spot)>upper+boundaryTolerance||Math.log(spot)<lower-boundaryTolerance)
   return null;
 const regular=gaps.length>=2&&half>=12&&half<=90&&
   minGap>=9&&(maxGap-minGap)/half<=.52&&
   recent.every((v,i)=>i===0||v.type!==recent[i-1].type);
 // Uneven pivots with a directional fit belong to the trend assessment,
 // not a counter-trend reversal or a blanket "irregular" waiting state.
 if(!regular&&trendFit>=.50)return null;
 // A confirmed oscillation retains its range identity even when a short
 // directional leg develops inside it. The October 22 escape caused trend
 // chasing near established extremes before the third-turn reaction.
 // A local oscillation must not authorize a holding period longer than
 // its observed swing, including five minutes. Independently mapped level
 // reversals are assessed afterwards and retain their own structural proof.
 const shortExpirySwingGuard=Number(holdingMs)>=60000;
 if(shortExpirySwingGuard&&pivots.length===2&&Number(holdingMs)/1000>half*1.35)
  return {ready:false,reason:'range-expiry-exceeds-observed-swing'};
 if(shortExpirySwingGuard&&regular&&Number(holdingMs)/1000>half*1.35)
  return {ready:false,reason:'range-expiry-exceeds-observed-swing'};
 const position=(Math.log(spot)-lower)/span;
 // Confirm ACTUAL retreat from a recent extreme. Being at the upper bound
 // alone is not a PUT, and being at the lower bound alone is not a CALL.
 const recentTicks=last.filter(x=>x.ts>=now-6500);
 const lastFew=recentTicks.slice(-4),peak=Math.max(...recentTicks.map(q=>q.price));
 const trough=Math.min(...recentTicks.map(q=>q.price));
 const down=lastFew.slice(1).filter((x,i)=>x.price<lastFew[i].price).length;
 const up=lastFew.slice(1).filter((x,i)=>x.price>lastFew[i].price).length;
 const retreat= Math.log(peak/spot),bounce=Math.log(spot/trough);
 const minTurn=Math.max(noise*.045,span*.016);
 // Two small counter-ticks are not a current reversal if price has already
 // resumed its original direction. Both net recent movement and the latest
 // observed step must agree with the claimed turn. No extra collection wait.
 const turnBase=before(last,now-3000,2500);
 const turnMove=turnBase?Math.log(spot/turnBase.price):0;
 const previous=last.at(-2),lastStep=previous?Math.log(spot/previous.price):0;
 // The range edges are established by confirmed PRIOR closed pivots.
 // At an edge a single recent opposite tick may start a turn, but only
 // alongside a material retreat and a 3-second counter-move. Do not wait
 // for the next large candle to complete the entire move.
 const earlyRetreat=Math.max(minTurn*1.5,span*.028);
 // A verified prior boundary and observed live turn may qualify without
 // mandatory large retreat or a third pivot. Mere touch is not a turn.
 // A single counter-tick at the edge is only an observation, not an order.
 // Permit early turns without a third pivot when an independently established
 // range is regular and its already observed route is genuinely oscillatory.
 const earlyRangeProof=regular&&efficiency<.40&&pivots.length>=2;
 const priorHigh=position>=.73&&retreat>=minTurn&&
  (down>=2||(regular&&efficiency>=.4&&down>=1&&retreat>=Math.max(earlyRetreat,span*.12)&&turnMove< -span*.05))&&turnMove<0&&lastStep<0;
 const priorLow=position<=.27&&bounce>=minTurn&&
  (up>=2||(regular&&efficiency>=.4&&up>=1&&bounce>=Math.max(earlyRetreat,span*.12)&&turnMove>span*.05))&&turnMove>0&&lastStep>0;
 const highTurn=priorHigh||(earlyRangeProof&&position>=.73&&down>=1&&turnMove<0&&lastStep<0);
 const lowTurn=priorLow||(earlyRangeProof&&position<=.27&&up>=1&&turnMove>0&&lastStep>0);
 if(highTurn||lowTurn){
 // Only protect actual turn SIGNALS. Keep WAIT and all previous
 // range-lifecycle classifications exactly as before.
 // A rising HH/HL or falling LH/LL sequence is a trending channel,
 // not a stationary range. A minor counter-tick at its extreme
 // must not become a protected opposite-side reversal.
 // This uses only previously confirmed 5s pivots; no timer, broker
 // request, added candle requirement or change to entry execution.
 if(highs.length===2&&lows.length===2){
  const minStep=Math.max(span*.06,noise*.15);
  const highStep=highs[1].level-highs[0].level;
  const lowStep=lows[1].level-lows[0].level;
  if((highStep>minStep&&lowStep>minStep)||
     (highStep< -minStep&&lowStep< -minStep))return null;
 }
  return {ready:true,side:highTurn?'PUT':'CALL',
  reason:'closed-range-extreme-reversal-confirmed',
  observedSwingSeconds:half,position,efficiency};
 }
 return {ready:false,reason:regular?'range-extreme-awaiting-confirmed-turn':
   'irregular-range-awaiting-current-turn'};
}

// Read-only provenance of conflicts: NEVER veto an actually qualified
// forecast based only on the recent structural sign. A/B against 13.9.58
// showed that the proposed hard veto increased losses on the recorded video.
export function annotateForecastStructureConflict(structural,decision){
 if(structural?.structuralReady!==true||!isSide(structural.structuralSide)||
   decision?.ready!==true||!isSide(decision.side)||
   structural.structuralSide===decision.side)return decision;
 return {...decision,structuralDisagreement:{
  structure:structural.structuralSide,projection:decision.side}};
}

// A separate observed trend for longer holdings. No prediction extrapolation,
 // no future data, and no extra completion gate when historical quotes are scarce.
export function longHorizonDirection({quotes=[],quoteAt,price,durationMs,noise=0}={}){
 const holding=Number(durationMs);
 if(holding!==120000&&holding!==300000)return{ready:false,scoped:false};
 const historyMs=holding===120000?90000:180000;
 const past=before(quotes,Number(quoteAt)-historyMs,3500);
 if(!past||!(Number(price)>0)||!(Number(past.price)>0))
   return{ready:false,scoped:true,reason:'longer-observation-not-available'};
 const move=Math.log(Number(price)/Number(past.price));
 const magnitude=Math.abs(move);
 return{ready:true,scoped:true,horizonSeconds:historyMs/1000,
   side:sideOf(move),significant:magnitude>=Math.max(Number(noise)||0,1e-9)*.65,
   observedNetMove:move};
}
export function analyzeNowOpportunity({quoteHistory=[],price=null,quoteAt=null,
 now=Date.now(),durationMs=30000,engineId='automatic',qualityPolicy='baseline',projectionTargetAt=null,entryFamily='reversal',expiryDirectionSelector=null,directionDisagreement=null,expiryDirectionContext=null,candles=[],structureCache=null}={}){
 // A SINGLE common market-base decides the direction for every strategy.
 // 30s may learn from already-closed 30s outcome analogues; 60s conserves
 // the original causal structural decision while its local samples are sparse.
 // No selector votes or second timed confirmation can delay an entry.
 // All selected strategies use one common market base. In Automatic,
 // describe the actually observed chart phase using only the four retained
 // technical contexts. A specialist can annotate the setup, but must not
 // override an evaluated 30s/60s direction without validated evidence:
 // randomized-price A/B showed such overrides sharply increased losses.
 if(qualityPolicy==='adaptive-market-v17'&&engineId){
  const input={quoteHistory,price,quoteAt,now,durationMs,entryFamily};
  // The SAME market base owns the direction and pivot/reversal checks for
  // Automatic and every selected specialist. Strategies never open their
  // own bypass around the base's confirmed top/bottom decisions.
  // No additional candle wait, broker request, polling or delayed entry.
  const original=analyzeNowOpportunity({...input,engineId:'automatic',qualityPolicy:'adaptive-market-v1'});
  const context=automaticChartContext({...input,base:original});
  // Preserve the existing admission and exact entry timestamp. Only the 30s
  // direction can use a projection fitted entirely to observed past prices.
  // The one-shot lifecycle below continues to hold a single immutable call.
  const forecast=Number(durationMs)===30000?
   thirtySecondCycleForecast({...input,projectionTargetAt:projectionTargetAt??Number(now)+Number(durationMs)}):null;
  // Preserve existing qualified entries. Historical price reactions below
  // can admit directly from current quotes without four newly closed bars.
  // A current confirmed range-edge reversal is stronger evidence than
  // extrapolating an earlier 30s movement through the opposite wall.
  // Do not infer reversal from price alone: original must have qualified
  // the established range and the current retreat already.
  const establishedRangeTurn=original.ready===true&&
   original.reason==='closed-range-extreme-reversal-confirmed';
  const baseline=establishedRangeTurn?original:
   forecast?.ready&&original.ready?{...original,...forecast}:original;
  const selected=Number(durationMs)===30000&&!establishedRangeTurn&&expiryDirectionSelector?
   expiryDirectionSelector.observe({context:expiryDirectionContext,quoteHistory,quoteAt,price,now,baseline,projectionTargetAt:projectionTargetAt??Number(now)+Number(durationMs)}):baseline;
  // Stage 4: compare ACTUAL completed 30s results on the rare occasions
  // when the qualified causal market structure and selected projection
  // disagree. After sufficient non-overlapping evidence the historical
  // structure can outrank the fitted cycle, but not on arbitrary opinion.
  const decision=Number(durationMs)===30000&&!establishedRangeTurn&&directionDisagreement?
   directionDisagreement.observe({context:expiryDirectionContext,quoteHistory,quoteAt,
    price,now,structural:original,projected:selected,
    projectionTargetAt:projectionTargetAt??Number(now)+Number(durationMs)}):selected;
  const structure=structureCache?structureCache.get({candles,now,context:expiryDirectionContext||''}):historicalPriceStructure({candles,now});
  // Historical reactions must agree with the projection actually selected
  // above. Comparing against the discarded narrow forecast can both veto
  // an agreeing reaction and allow one that contradicts the selected side.
  // Forecasts describe fitted past prices, not guaranteed continuation.
  // When closed-price structure currently confirms the OPPOSITE side, a
  // model extrapolation alone is insufficient to open a new live position.
  // Later, an observed historical rejection or structure change may qualify
  // its OWN side; otherwise return WAIT rather than guess CALL/PUT.
  const annotated=annotateForecastStructureConflict(original,decision);
  const selectedForecast=decision.reason==='validated-structure-over-cycle'?null:
   forecast?.ready&&decision.ready?decision:forecast;
  const historical=applyHistoricalPriceStructure({candidate:{...annotated,pendingForecast:selectedForecast},structure,...input});
  const candleLocated=applyCandleLevelRoute({candidate:historical,map:structure.candleLevelMap,...input});
  const located=applyObservedLevelSequence({candidate:candleLocated,map:structure.candleLevelMap,...input});
  delete located.pendingForecast;
  const sequenceReaction=located.priceStructure?.observedSequence;
  const levelReaction=located.priceStructure?.confirmedReversal??(['failed-breakout-structure-change','break-retest-continuation','rejection-followthrough-clear-room'].includes(located.reason)?
   sequenceReaction.structureChange??sequenceReaction.continuation:
   located.reason==='multiscale-candle-rejection'?
    located.priceStructure.candleRoute.event:located.priceStructure?.reaction);
  // Strategies supply evidence to the common market base, never a direct
  // order. A valid specialist setup can still be assessed on an early quote
  // when the longer automatic structure is not yet complete: no extra
  // collection wait is introduced by unified signal ownership.
  const selectedEngine=engineId!=='automatic'&&Number(durationMs)===30000;
  const specialist=selectedEngine&&!located.ready?
   analyzeNowOpportunity({...input,engineId,qualityPolicy:'baseline'}):null;
  const levelEvent=located.priceStructure?.candleRoute?.event;
  // A shorter strategy can supply early evidence, but it cannot reuse the
  // SAME unsupported level reaction already rejected by the shared base.
  const roleConflict=!located.ready&&specialist?.ready===true&&(
   levelEvent?.roleMismatch===true&&levelEvent.side===specialist.side||
   specialistLevelRoleRisk({candidate:specialist,structure,...input}));
  const proposed=located.ready?located:roleConflict?{
   ...located,ready:false,side:null,reason:'shared-base-level-role-conflict'
  }:(specialist?.ready===true?{
   ...specialist,priceStructure:located.priceStructure??specialist.priceStructure
  }:located);
  // The final shared base checks confirmed historical swing direction for
  // EVERY proposal (automatic or specialist), before it can reach the
  // probability, expiry adjudicator or bot. Only already-received quotes.
  // A 'confirmed' rejection label can still be a shallow pullback in
  // a strong opposing trend. The shared base verifies ALL candidate sides.
  // No new timer, quote read or additional candle requirement.
  const pivotRisk=proposed.ready&&countertrendPivotRisk({
   quoteHistory,quoteAt,price,side:proposed.side,now,durationMs,
   reversalEvidence:proposed.priceStructure?.confirmedReversal??proposed.priceStructure?.observedSequence?.structureChange
  });
  // One final shared-market-base screen for a fading approach to a verified
  // historical wall. No direction inversion, timing changes, waits or reads.
  const wallRisk=!pivotRisk&&proposed.ready?verifiedWallExhaustionRisk({
   candidate:proposed,structure,quoteHistory,quoteAt,now,price
  }):null;
  const roomRisk=!pivotRisk&&!wallRisk&&proposed.ready?continuationRoomRisk({
   candidate:proposed,structure,quoteHistory,quoteAt,now,price,durationMs
  }):null;
  const floorRisk=!pivotRisk&&!wallRisk&&!roomRisk&&proposed.ready?
   lateUnverifiedFloorImpulseRisk({candidate:proposed,quoteHistory,quoteAt,now,price,durationMs}):null;
  const liveRisk=!pivotRisk&&!wallRisk&&!roomRisk&&!floorRisk&&proposed.ready?liveEntryContradiction({
   candidate:proposed,quoteHistory,quoteAt,now,price
  }):null;
  const final=pivotRisk?{...proposed,ready:false,side:null,
   reason:'shared-base-countertrend-pivot-risk'}:
   wallRisk?{...proposed,ready:false,side:null,
    reason:'shared-base-verified-wall-exhaustion',entryRisk:wallRisk}:
   roomRisk?{...proposed,ready:false,side:null,
    reason:'shared-base-continuation-wall-pressure',entryRisk:roomRisk}:
   floorRisk?{...proposed,ready:false,side:null,
    reason:'shared-base-unverified-floor-impulse',entryRisk:floorRisk}:
   liveRisk?{...proposed,ready:false,side:null,
    reason:'shared-base-live-evidence-conflict',entryRisk:liveRisk}:proposed;
  const structuralDecision=fiveMinuteReversalOnly({candidate:final,durationMs,quoteAt,now,price,quoteHistory,entryFamily,structure});
  const persistenceDecision=reviewDirectionalPersistence({
   candidate:structuralDecision,quoteHistory,quoteAt,now,price,durationMs
  });
  return {...persistenceDecision,engineId,qualityPolicy,
   contextStrategy:engineId==='automatic'?(levelReaction?'support_resistance':context.strategy):engineId,
   marketShape:levelReaction?'historical-level-'+levelReaction.kind:context.marketShape,
   signalOwner:'shared-market-base',
   ...(selectedEngine?{strategyResponse:located.ready?'base-priority':
     specialist?.ready?'base-reviewed-evidence':'observational'}:{})};
 }
 if(qualityPolicy==='adaptive-market-v1'&&engineId){
  const input={quoteHistory,price,quoteAt,now,durationMs,entryFamily};
  const structural=analyzeNowOpportunity({...input,engineId:'automatic'});
  const learning=Number(durationMs)===30000?causalPatternDirection(input):null;
  const useLearning=learning?.ready===true&&Number(learning.strength)>=.4;
  const contextStrategy=useLearning?'mean_reversion':'trend';
  const qualifiedStructure=Number(durationMs)===30000?{structuralReady:structural.ready===true,
   structuralSide:structural.ready===true?structural.side:null}:{};
  if(structural.ready===true&&structural.reason==='closed-range-extreme-reversal-confirmed')
   return {...structural,...qualifiedStructure,engineId,qualityPolicy,
    contextStrategy:engineId==='automatic'?'support_resistance':engineId,
    signalOwner:'shared-market-base'};
  if(useLearning)return {...structural,...learning,...qualifiedStructure,engineId,qualityPolicy,
   reason:'causal-expiry-analogue',observedAt:Number(quoteAt),
   entryPrice:Number(price),expirySeconds:Number(durationMs)/1000,
   contextStrategy:engineId==='automatic'?contextStrategy:engineId,
   signalOwner:'shared-market-base'};
  return {...structural,...qualifiedStructure,engineId,qualityPolicy,
   contextStrategy:engineId==='automatic'?'trend':engineId,
   signalOwner:'shared-market-base'};
 }
 const seconds=Number(durationMs)/1000;
 let provisionalSide=null;
 const waiting=reason=>({side:null,reason,ready:false,observedAt:Number(quoteAt)||null,
   provisionalSide,entryPrice:null,strength:null,expirySeconds:seconds});
 if(!(seconds>=5&&seconds<=3600))return waiting('invalid-expiry');
 if(!(Number(quoteAt)>0&&Number(quoteAt)<=now&&now-Number(quoteAt)<=2500&&finitePrice(price)))
  return waiting('stale-live-quote');
 const quotes=causalQuotes(quoteHistory,now,Number(durationMs)>=300000?300000:180000).filter(q=>q.ts<=Number(quoteAt));
 if(!quotes.length||!quotes.some(q=>q.ts===Number(quoteAt)&&Number(q.price)===Number(price)))
  return waiting('live-quote-unverified');
 // A changing observation is display-only. It never satisfies ready or
 // authorizes an entry; the selected strategy still confirms its own setup.
 const recentBase=before(quotes,Number(quoteAt)-3000,2500);
 provisionalSide=recentBase?sideOf(Number(price)-recentBase.price):null;
 // Selected strategies produce native current evidence; the shared lifecycle
 // owns their signals. No legacy score/candle/forecast prerequisite is used.
 if(engineId!=='automatic'){
  const result=currentStrategyEvidence({quotes,price:Number(price),quoteAt:Number(quoteAt),engineId});
  return {...waiting(result.reason),...result,entryPrice:result.ready?Number(price):null};
 }
 // This structure is retained across cycles; never start collecting it
 // again at expiry. Holding time does not impose any post-expiry pause.
 const barMs=(seconds<=10?5:seconds<=30?10:15)*1000;
 // A previously observed range must be inspected BEFORE the four-bar
 // continuation gate. Otherwise a real edge turn can be lost while an old
 // four-bar trend waits to qualify, and the next late impulse gets chased.
 // Range reconstruction uses only finished historical 5s bars.
 const noise=observedNoise({quotes,now,horizonSeconds:barMs*4/1000});
 const range=noise>0?completedRangeStructure(quotes,now,noise,Number(price),durationMs):null;
 if(range){
  if(!range.ready)return waiting(range.reason);
  return {ready:true,side:range.side,reason:range.reason,
    observedAt:Number(quoteAt),entryPrice:Number(price),
    strength:null,expirySeconds:seconds,rangePosition:range.position,
    rangeExtreme:range.position<=.27||range.position>=.73,
    regime:'observed-range-turn',observedSwingSeconds:range.observedSwingSeconds};
 }
 // Build a causal observation from the FIRST fully observed candle onward.
 // This is evidence for continuous analysis, never a one-candle order.
 const bars=closingBars(quotes,Number(quoteAt),barMs);
 let firstEvidence=bars;
 if(!firstEvidence){
  // Short-circuit on the longest available prefix; no additional feed reads.
  for(let n=3;n>=1;n--){
   firstEvidence=closingBars(quotes,Number(quoteAt),barMs,n);
   if(firstEvidence)break;
  }
 }
 const observedBars=firstEvidence?.length||0;
 const earliestMove=firstEvidence?.length?
  Math.log(firstEvidence.at(-1).close/firstEvidence[0].open):0;
 const candleEvidence={observedBars,direction:sideOf(earliestMove),
  displacement:earliestMove,barSeconds:barMs/1000};
 if(!bars)return {...waiting('completed-structure-not-ready'),candleEvidence};
 const moves=bars.map(b=>Math.log(b.close/b.open));
 const net=Math.log(bars.at(-1).close/bars[0].open);
 if(!(noise>0))return waiting('insufficient-quote-variation');
 // Directional efficiency distinguishes a persistent move from price
 // zigzags of similar amplitude. A weak sideways swing must not trigger
 // CALL/PUT merely because 3 of 4 small candle bodies share a colour.
 const route=quotes.filter(q=>q.ts>=bars[0].from&&q.ts<bars.at(-1).to);
 let travelled=0;
 for(let i=1;i<route.length;i++){
  if(route[i].ts-route[i-1].ts>3000)continue;
  travelled+=Math.abs(Math.log(route[i].price/route[i-1].price));
 }
 if(!(travelled>0)||Math.abs(net)/travelled<.20)
  return waiting('choppy-sideways-structure');
 const side=sideOf(net);
 if(!side)return waiting('neutral-closed-structure');
 // 2m and 5m forecasts need a second, holding-time-scale observation.
 // It uses already buffered prices only, WITHOUT extending the 15s bar
 // prerequisite, broker requests, or a new signal delay. Short expiries
 // follow precisely their previous rules.
 const longer=longHorizonDirection({quotes,quoteAt:Number(quoteAt),price:Number(price),durationMs,noise});
 if(longer.ready&&longer.side&&longer.side!==side&&longer.significant)
   return waiting('long-horizon-structure-contradicts-short-impulse');
 const aligned=moves.filter(m=>sign(side)*m>0).length;
 if(aligned<3)return waiting('lateral-or-mixed-structure');
 // Require a real directional movement over FOUR completed bars. A
 // microscopic rise/fall is not a signal, even if three candles were green.
 if(sign(side)*net<noise*.52)return waiting('closed-movement-below-noise');
 const latest=before(quotes,Number(quoteAt)-Math.min(6000,barMs*.7),3500);
 if(!latest)return waiting('recent-movement-not-ready');
 const impulse=Math.log(Number(price)/latest.price);
 if(sign(side)*impulse<noise*.10)return waiting('current-impulse-against-structure');
 const follow=Math.log(Number(price)/bars.at(-1).close);
 if(sign(side)*follow< -noise*.08)return waiting('current-price-retracing');
 // Three closed bars alone cannot trigger entry. The live tick must also
 // move in the same direction as the established structure.
 const strength=Math.min(100,Math.round(100*Math.min(1,
   Math.min(sign(side)*net/(noise*1.25),sign(side)*impulse/(noise*.38)))));
 return {ready:true,side,reason:'closed-structure-and-live-impulse',
   observedAt:Number(quoteAt),entryPrice:Number(price),strength,
   expirySeconds:seconds,barSeconds:barMs/1000,alignedBars:aligned,
   observedNetMove:net,observedImpulse:impulse,noise};
}
// One-shot state machine. No second CALL/PUT during the selected expiry.
// Analysis can run on every quote while the previous signal is locked.
// At expiry only a fresh AFTER-expiry quote can authorize the next signal.
export function advanceNowOpportunity({previous=null,candidate=null,now=Date.now(),
 quoteAt=null,asset='UNKNOWN',provider=null,engineId='automatic',durationMs=30000}={}){
 const horizon=Number(durationMs);
 if(!(horizon>=5000&&horizon<=3600000))return null;
 const key=[...(provider==null?[]:[String(provider).toLowerCase()]),String(asset).toUpperCase(),String(engineId),horizon].join('|');
 // Retain the previous expiry when ONLY the strategy changes on the same
 // provider, asset and duration; old CALL/PUT must never be shown as a new
 // strategy's trade, and a hot switch must never duplicate open windows.
 const sameMarket=previous?.asset===String(asset).toUpperCase()&&
  Number(previous?.holdingSeconds)*1000===horizon&&
  String(previous?.context||'').split('|').slice(0,-2).join('|')===key.split('|').slice(0,-2).join('|');
 const old=sameMarket?previous:null;
 const fresh=Number(quoteAt)>0&&Number(quoteAt)<=now&&now-Number(quoteAt)<=2500;
 if(old?.phase==='fired'&&now<old.exitAt){
  if(old.context!==key)return{context:key,engineId,asset:String(asset).toUpperCase(),
   phase:'scanning',reason:'strategy-switch-awaiting-previous-expiry',
   side:null,entryAt:null,exitAt:null,entryTriggeredAt:null,entryReadyNow:false,
   windowStartedAt:null,windowEndsAt:0,observationSide:candidate?.side||null,
   lastObservedAt:Number(quoteAt)||null,lastExpiryAt:Number(old.exitAt),
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000};
  return {...old,entryReadyNow:false,observationSide:candidate?.side||null,
    lastObservedAt:Number(quoteAt)||null};
 }
 const priorExpiry=old?.phase==='fired'?Number(old.exitAt):Number(old?.lastExpiryAt)||null;
 // Do not manufacture an instant re-entry from the same tick captured
 // before the previous option actually expired.
 // User-requested breathing room between automatic analyst windows. Keep
 // evaluating real prices throughout; never queue a signal from this pause.
 const reassessing=priorExpiry!=null&&
  (now<priorExpiry+POST_EXPIRY_REASSESS_MS||Number(quoteAt)<priorExpiry+POST_EXPIRY_REASSESS_MS);
 const canRelease=fresh&&!reassessing;
 const ready=canRelease&&candidate?.ready===true&&isSide(candidate.side)&&
   Number(candidate.observedAt)===Number(quoteAt)&&finitePrice(candidate.entryPrice);
 if(ready){
  const expiry=now+horizon;
  return {context:key,engineId,asset:String(asset).toUpperCase(),
   phase:'fired',reason:'present-confirmed',side:candidate.side,
   entryAt:now,entryTriggeredAt:now,plannedEntryAt:now,
   entryPrice:Number(candidate.entryPrice),confirmedEntryPrice:Number(candidate.entryPrice),
   // A broker quote can precede the worker's Date.now() by milliseconds.
   // Cycle origin MUST be the observed quote clock or both PC and phone
   // incorrectly discard every legitimate real-time analysis as "old".
   exitAt:expiry,windowStartedAt:Number(quoteAt),windowEndsAt:expiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000,
   issuedAt:now,entryReadyNow:true,observationSide:candidate.side,
   lastObservedAt:Number(quoteAt)};
 }
 return {context:key,engineId,asset:String(asset).toUpperCase(),
   phase:'scanning',reason:!fresh?'waiting-fresh-quote':reassessing?'reassessing-after-expiry':candidate?.reason||'scanning-now',
   side:null,entryAt:null,exitAt:null,entryTriggeredAt:null,entryReadyNow:false,
   // Scanning is not an open signal window. Do not invent a cycle start
   // equal to worker time: quoteAt normally trails the worker by 50-500ms.
   windowStartedAt:null,windowEndsAt:0,observationSide:candidate?.side||null,
   lastObservedAt:Number(quoteAt)||null,lastExpiryAt:priorExpiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000};
}
