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
import {assessRangeExpiryEvidence} from './range-expiry-evidence.mjs';

const sideOf=v=>v>0?'CALL':v<0?'PUT':null;
const sign=side=>side==='CALL'?1:-1;
const isSide=side=>side==='CALL'||side==='PUT';
const finitePrice=p=>Number.isFinite(Number(p))&&Number(p)>0;
function causalQuotes(history,now,windowMs=180000){
 const byTime=new Map();
 for(const q of Array.isArray(history)?history:[]){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),price=Number(q?.price);
  if(!(ts>0&&ts<=now&&received>0&&received<=now&&finitePrice(price)&&ts>=now-windowMs))continue;
  const previous=byTime.get(ts);
  if(!previous||received<previous.receivedAt)byTime.set(ts,{ts,receivedAt:received,price});
 }
 return [...byTime.values()].sort((a,b)=>a.ts-b.ts);
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


/**
 * Causal range-leg classification shared by ALL modes and expiries.
 * This does not change execution, timing, broker controls or interface.
 */
export function assessRangeRecoveryContinuation({quotes=[],closes=[],pivots=[],
 now,spot,noise,lower,upper,half,holdingMs=30000,regular=false}={}){
 if(!regular||!finitePrice(spot)||!Number.isFinite(now)||
    !Number.isFinite(lower)||!Number.isFinite(upper)||
    !(upper>lower)||!(noise>0)||!(half>0))return null;
 const logSpot=Math.log(spot),span=upper-lower,position=(logSpot-lower)/span;
 if(!(position>=.20&&position<=.80))return null;
 const pivot=pivots.at(-1);
 if(!pivot||!['LOW','HIGH'].includes(pivot.type))return null;
 const side=pivot.type==='LOW'?'CALL':'PUT',direction=side==='CALL'?1:-1;
 // Time to expiry must fit the remaining observed half-swing. Never assume
 // an upward current tick will continue until an arbitrary expiration.
 const elapsed=(now-Number(pivot.at))/1000,holding=Number(holdingMs)/1000;
 if(!(elapsed>=0&&elapsed<half&&holding>=5&&
      holding<=Math.max(0,half-elapsed)*.95))return null;
 const live=quotes.filter(q=>Number(q?.ts)<=now&&Number(q?.receivedAt??q?.ts)<=now&&
   Number(q?.ts)>now-21000&&finitePrice(q?.price));
 if(live.length<10)return null;
 const at=(seconds)=>{
  const target=now-seconds*1000;
  for(let i=live.length-1;i>=0;i--)
   if(live[i].ts<=target)return target-live[i].ts<=2500?live[i]:null;
  return null;
 };
 const q3=at(3),q8=at(8),q16=at(16);
 if(!q3||!q8||!q16)return null;
 const move3=Math.log(spot/Number(q3.price))*direction;
 const move8=Math.log(spot/Number(q8.price))*direction;
 const move16=Math.log(spot/Number(q16.price))*direction;
 if(!(move3>noise*.012&&move8>noise*.10))return null;
 // Use completed, observed 5s legs as independent flow evidence.
 const recent=closes.slice(-4);
 if(recent.length<4)return null;
 const aligned=recent.slice(1).filter((bar,i)=>
  direction*(Number(bar.log)-Number(recent[i].log))>0).length;
 if(aligned<2)return null;
 // Room to target is required unless the previous base has already
 // classified a breakout. No late CALL near top or late PUT near bottom.
 const room=side==='CALL'?upper-logSpot:logSpot-lower;
 const estimatedMove=move8*(holding/8)*.55;
 if(room<Math.max(noise*.10,estimatedMove*.80))return null;
 if((side==='CALL'&&position>.76)||(side==='PUT'&&position<.24))return null;
 const recovering=move16<=noise*.09||
   (side==='CALL'?position<=.40:position>=.60);
 if(!recovering&&!(move16>noise*.10))return null;
 return {ready:true,side,
   reason:recovering?'closed-range-recovery-followthrough':'closed-range-leg-continuation',
   phase:recovering?'recovery':'continuation',
   observedSwingSeconds:half,position,
   remainingSwingSeconds:Math.max(0,half-elapsed),alignedClosedLegs:aligned};
}

// Recognize genuinely observed two-sided market oscillations using CLOSED
// 5-second prices from the past, not future projections or forming candles.
// Return null for a directional regime; return a verdict when past alternation
// means a short-term impulse is a potentially misleading end-of-range leg.
export function completedRangeStructure(quotes,now,noise,spot,holdingMs=30000,rangeQuoteHistory=[]){
 const period=5000,end=Math.floor(now/period)*period;
 const last=quotes.filter(q=>q.ts>=end-135000&&q.ts<=now);
 if(last.length<50||last.at(-1).ts-last[0].ts<50000)return null;
 const closes=[];
 for(let t=end-130000;t<end;t+=period){
  const part=last.filter(q=>q.ts>=t&&q.ts<t+period);
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
 if(pivots.length===2)return {ready:false,reason:'range-awaiting-third-confirmed-turn'};
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
 // For >=60s holds, do not enter a brief repeating swing whose observed
 // half-cycle is shorter than the intended broker outcome window.
 // This is a market-structure check, NOT an added timer or polling delay.
 // Expiry-aware evidence comes before the half-swing limitation. A valid
 // observed past 5m outcome is not inferred from the latest 5s impulse.
 // For a 30s expiration, an observed half-swing materially shorter than
 // 30s is a choppy/noisy cycle, not evidence that a micro leg lasts 30s.
 // Longer expiries may only use independent historical outcomes matched to
 // their entire expiry duration (already enforced in assessRangeExpiryEvidence).
 // Mixed-frequency chop can appear regular over just 3 turns.
 // Require a stable sequence of previously confirmed alternating pivots
 // before NEW recovery, continuation or expiration-analogue signals.
 // Existing confirmed boundary reversals keep their original rules.
 const historicalGaps=pivots.slice(1).map((p,i)=>(p.at-pivots[i].at)/1000);
 const stableRange=pivots.length>=5&&
   Math.max(...historicalGaps)/Math.min(...historicalGaps)<=1.35&&
   pivots.every((p,i)=>i===0||p.type!==pivots[i-1].type);
 const expiryFitsRecentLeg=stableRange&&
   (Number(holdingMs)>30000||Number(holdingMs)/1000<=half*1.35);
 const analogue=expiryFitsRecentLeg?
   assessRangeExpiryEvidence({quotes:[...rangeQuoteHistory,...quotes],
     now,spot,noise,lower,upper,holdingMs,regular}):null;
 if(regular&&Number(holdingMs)>=60000&&Number(holdingMs)/1000>half*1.35)
  return analogue?{...analogue,observedSwingSeconds:half,efficiency}:
   {ready:false,reason:'range-expiry-exceeds-observed-swing'};
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
 const highTurn=position>=.73&&retreat>=minTurn&&down>=2&&turnMove<0&&lastStep<=0;
 const lowTurn=position<=.27&&bounce>=minTurn&&up>=2&&turnMove>0&&lastStep>=0;
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
 // An already qualified high/low reversal above keeps its original decision.
 if(analogue)return {...analogue,observedSwingSeconds:half,efficiency};
 const leg=assessRangeRecoveryContinuation({quotes:last,closes,pivots,now,spot,
  noise,lower,upper,half,holdingMs,regular});
 if(leg&&stableRange)return {...leg,efficiency};
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
 now=Date.now(),durationMs=30000,engineId='automatic',qualityPolicy='baseline',projectionTargetAt=null,expiryDirectionSelector=null,directionDisagreement=null,expiryDirectionContext=null,candles=[],structureCache=null,rangeQuoteHistory=[]}={}){
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
  const input={quoteHistory,price,quoteAt,now,durationMs,rangeQuoteHistory};
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
  const baseline=forecast?.ready&&original.ready?{...original,...forecast}:original;
  const selected=Number(durationMs)===30000&&expiryDirectionSelector?
   expiryDirectionSelector.observe({context:expiryDirectionContext,quoteHistory,quoteAt,price,now,baseline,projectionTargetAt:projectionTargetAt??Number(now)+Number(durationMs)}):baseline;
  // Stage 4: compare ACTUAL completed 30s results on the rare occasions
  // when the qualified causal market structure and selected projection
  // disagree. After sufficient non-overlapping evidence the historical
  // structure can outrank the fitted cycle, but not on arbitrary opinion.
  const decision=Number(durationMs)===30000&&directionDisagreement?
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
  const levelReaction=['failed-breakout-structure-change','break-retest-continuation','rejection-followthrough-clear-room'].includes(located.reason)?
   sequenceReaction.structureChange??sequenceReaction.continuation:
   located.reason==='multiscale-candle-rejection'?
    located.priceStructure.candleRoute.event:located.priceStructure?.reaction;
  // Strategies supply evidence to the common market base, never a direct
  // order. A valid specialist setup can still be assessed on an early quote
  // when the longer automatic structure is not yet complete: no extra
  // collection wait is introduced by unified signal ownership.
  const selectedEngine=engineId!=='automatic'&&Number(durationMs)===30000;
  const specialist=selectedEngine&&!located.ready?
   analyzeNowOpportunity({...input,engineId,qualityPolicy:'baseline'}):null;
  const proposed=located.ready?located:(specialist?.ready===true?{
   ...specialist,priceStructure:located.priceStructure??specialist.priceStructure
  }:located);
  // The final shared base checks confirmed historical swing direction for
  // EVERY proposal (automatic or specialist), before it can reach the
  // probability, expiry adjudicator or bot. Only already-received quotes.
  // A 'confirmed' rejection label can still be a shallow pullback in
  // a strong opposing trend. The shared base verifies ALL candidate sides.
  // No new timer, quote read or additional candle requirement.
  const pivotRisk=proposed.ready&&countertrendPivotRisk({
   quoteHistory,quoteAt,price,side:proposed.side,now
  });
  const final=pivotRisk?{...proposed,ready:false,side:null,
   reason:'shared-base-countertrend-pivot-risk'}:proposed;
  return {...final,engineId,qualityPolicy,
   contextStrategy:engineId==='automatic'?(levelReaction?'support_resistance':context.strategy):engineId,
   marketShape:levelReaction?'historical-level-'+levelReaction.kind:context.marketShape,
   signalOwner:'shared-market-base',
   ...(selectedEngine?{strategyResponse:located.ready?'base-priority':
     specialist?.ready?'base-reviewed-evidence':'observational'}:{})};
 }
 if(qualityPolicy==='adaptive-market-v1'&&engineId){
  const input={quoteHistory,price,quoteAt,now,durationMs,rangeQuoteHistory};
  const structural=analyzeNowOpportunity({...input,engineId:'automatic'});
  // ALL requested expiries share the same phase-aware causal outcome model.
  // A small up candle is NOT a loss-of-strength vote. Phase and already
  // completed 30s/60s/2m/5m outcomes decide, never the latest tick alone.
  // Evidence without >=4 independent settled analogues defers to the original
  // structural model, preserving its valid continuation and reversal setups.
  const learning=causalPatternDirection(input);
  const useLearning=learning?.ready===true&&Number(learning.strength)>=80;
  const contextStrategy=useLearning?'mean_reversion':'trend';
  const qualifiedStructure={structuralReady:structural.ready===true,
   structuralSide:structural.ready===true?structural.side:null};
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
 const bars=closingBars(quotes,Number(quoteAt),barMs);
 if(!bars)return waiting('completed-structure-not-ready');
 const moves=bars.map(b=>Math.log(b.close/b.open));
 const net=Math.log(bars.at(-1).close/bars[0].open);
 const noise=observedNoise({quotes,now,horizonSeconds:barMs*4/1000});
 if(!(noise>0))return waiting('insufficient-quote-variation');
 const range=completedRangeStructure(quotes,now,noise,Number(price),durationMs,rangeQuoteHistory);
 if(range){
  if(!range.ready)return waiting(range.reason);
  return {ready:true,side:range.side,reason:range.reason,
    observedAt:Number(quoteAt),entryPrice:Number(price),
    strength:null,expirySeconds:seconds,
    regime:'observed-range-turn',observedSwingSeconds:range.observedSwingSeconds};
 }
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
 const canRelease=fresh&&(!priorExpiry||Number(quoteAt)>=priorExpiry);
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
   phase:'scanning',reason:!fresh?'waiting-fresh-quote':candidate?.reason||'scanning-now',
   side:null,entryAt:null,exitAt:null,entryTriggeredAt:null,entryReadyNow:false,
   // Scanning is not an open signal window. Do not invent a cycle start
   // equal to worker time: quoteAt normally trails the worker by 50-500ms.
   windowStartedAt:null,windowEndsAt:0,observationSide:candidate?.side||null,
   lastObservedAt:Number(quoteAt)||null,lastExpiryAt:priorExpiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000};
}
