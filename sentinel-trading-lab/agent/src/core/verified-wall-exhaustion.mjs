// Conservative NOW market-base admission screen. Never changes an expiry,
// candle period, selector, scheduled entry, broker, martingale or WIN/LOSS.
const finitePositive=p=>typeof p==='number'&&Number.isFinite(p)&&p>0;
const validated=x=>Number.isFinite(Number(x))?Number(x):NaN;
const CONFIRMED_SETUPS=new Set([
 'historical-level-rejection','historical-level-breakout',
 'multiscale-candle-rejection','failed-breakout-structure-change',
 'break-retest-continuation','rejection-followthrough-clear-room',
 'closed-range-extreme-reversal-confirmed'
]);

export function verifiedWallExhaustionRisk({
 candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price
}={}){
 const reason=String(candidate?.reason||'');
 // The prior exception allowed every verified historical breakout/rejection
 // to BYPASS the stall-at-confirmed-wall guard, even after the move ran out
 // of room. Check ONLY those two provisional market-entry labels here;
 // retain all other protected, confirmed structure-change/retest setups.
 const lateChaseSetup=reason==='historical-level-rejection'||reason==='historical-level-breakout';
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side)||
   (CONFIRMED_SETUPS.has(reason)&&!lateChaseSetup))return null;
 const ts=validated(quoteAt),clock=validated(now),spot=validated(price);
 if(!(finitePositive(spot)&&ts>0&&clock>=ts&&clock-ts<=1450&&
   Number(candidate.observedAt)===ts&&Number(candidate.entryPrice)===spot))return null;
 const map=structure?.candleLevelMap;
 if(!(map?.observedCandles>=10&&map.asOf<=clock&&Array.isArray(map.levels)))return null;
 const tolerance=Math.max(validated(structure.tolerance)||0,spot*1e-8);
 if(!(tolerance>0))return null;
 const side=candidate.side,sign=side==='CALL'?1:-1;
 // A simple touch is insufficient. BOTH a closed pivot and multiple truly
 // independent historical rejections must support the obstructing level.
 const barriers=map.levels.filter(z=>
   Number(z.confirmedPivots)>=1&&Number(z.independentRejections)>=2&&
   // A former support is not automatically a resistance, or vice versa.
   Number(side==='CALL'?z.resistanceWick:z.supportWick)>=.5&&
   finitePositive(z.low)&&finitePositive(z.high)&&
   (side==='CALL'?
    (spot<=z.high+tolerance*.25&&z.low>=spot-tolerance*.25&&z.low-spot<=tolerance*2):
    (spot>=z.low-tolerance*.25&&z.high<=spot+tolerance*.25&&spot-z.high<=tolerance*2))
 ).sort((a,b)=>Math.abs(a.level-spot)-Math.abs(b.level-spot));
 const barrier=barriers[0];if(!barrier)return null;
 // No future observations and no waiting for missing prices. The current
 // quote must match the authenticated observation of the market base.
 // One bounded reverse pass, not three complete 6,000-tick scans per
 // candidate. Broker history is chronological: stop after the last ~9 s.
 // An out-of-order or unreceived feed NEVER authorizes a veto.
 const targets=[ts,ts-7000,ts-3000],slacks=[0,1600,1600],values=[null,null,null];
 let previousTime=Infinity;
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],at=validated(q?.ts);
  if(!Number.isFinite(at)||at>previousTime)return null;
  if(at<ts-8600)break;
  previousTime=at;
  const received=validated(q?.receivedAt??q?.ts),p=validated(q?.price);
  if(at>ts||received>clock||!finitePositive(p))continue;
  for(let j=0;j<3;j++)if(values[j]===null&&at<=targets[j]&&targets[j]-at<=slacks[j])
   values[j]=p;
 }
 if(values[0]!==spot||values[1]===null||values[2]===null)return null;
 const start=values[1],middle=values[2];
 const initial=sign*(middle-start),final=sign*(spot-middle);
 // The trend must have actually approached the wall but visibly slowed
 // BEFORE the order. Fast, strong continuation remains permitted.
 const travelled=sign*(spot-start);
 if(!(initial>=tolerance*.8&&travelled>tolerance*.4&&
   final<=initial*.2))return null;
 if(lateChaseSetup){
  // Price ALREADY travelled substantially more than the remaining
  // confirmed room and lost impulse near a directional, independently
  // tested barrier. Distance alone NEVER cancels a qualified entry.
  // Keep real strong continuations: an accelerating final leg passes.
  const room=Math.max(0,side==='CALL'?barrier.low-spot:spot-barrier.high);
  if(!(travelled>=Math.max(tolerance*1.25,room*2.25)))return null;
 }
 return {kind:lateChaseSetup?'verified-historical-late-entry-exhaustion':
     'verified-level-fading-approach',
   level:barrier.level,confirmedPivots:barrier.confirmedPivots,
   independentRejections:barrier.independentRejections};
}
