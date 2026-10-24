// Evidence-only final market-base veto for an observed FAILED level approach.
// A price level is not a wall: sustained breakouts remain eligible.
// All thresholds are relative to CLOSED-candle zone tolerance and observed ticks.
// Synchronous, no browser calls, no quote collection, no artificial entry wait.
// This screen is intentionally narrower than a generic "near a level" veto.
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export function observedLevelContestRisk({
 candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price
}={}){
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side)||
   !Array.isArray(quoteHistory)||!quoteHistory.length)return null;
 const ts=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(ts>0&&clock>=ts&&clock-ts<=1450&&positive(spot)&&
  Number(candidate.observedAt)===ts&&Number(candidate.entryPrice)===spot))return null;
 const map=structure?.candleLevelMap;
 if(!Array.isArray(map?.levels)||map.observedCandles<10||map.asOf>clock)return null;
 const tolerance=Math.max(Number(structure?.tolerance)||0,spot*1e-8);
 if(!(tolerance>0))return null;
 const dir=candidate.side==='CALL'?1:-1;
 // An independently observed level is necessary but not sufficient.
 // Require a real closed pivot, at least one independently confirmed
 // rejection, and the correct directional wick. A single touch is ignored.
 const walls=map.levels.filter(z=>
   Number(z.confirmedPivots)>0&&Number(z.independentRejections)>0&&
   Number(dir>0?z.resistanceWick:z.supportWick)>=.45&&
   positive(z.low)&&positive(z.high)&&z.high>=z.low&&
   // Is there still a wall AHEAD? Never veto an already accepted break
   // which has cleared the entire zone in the proposed direction.
   (dir>0?z.low-spot:spot-z.high)>=-tolerance*.25&&
   (dir>0?z.low-spot:spot-z.high)<=tolerance*2.5
 );
 if(!walls.length)return null;
 // One bounded reverse scan, preserving the live broker's exact timestamps.
 // Reject any future/unreceived packet or reordered source as evidence.
 // Do not scan the full historical tape on each 200ms engine cycle.
 const recent=[];let previousTs=Infinity;
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],at=Number(q?.ts),received=Number(q?.receivedAt??q?.ts);
  if(!Number.isFinite(at)||at>previousTs)return null;
  if(at<ts-9500)break;
  previousTs=at;
  const p=Number(q?.price);
  if(at<=ts&&received<=clock&&positive(p))recent.push({ts:at,price:p});
 }
 if(recent[0]?.ts!==ts||recent[0]?.price!==spot||recent.length<6)return null;
 recent.reverse();
 // Never infer a reversal over missing broker observations.
 for(let i=1;i<recent.length;i++)
  if(recent[i].ts-recent[i-1].ts>2500)return null;
 const first=recent.find(q=>q.ts>=ts-8500&&q.ts<=ts-5500);
 if(!first)return null;
 const changes=[];
 for(let i=1;i<recent.length;i++){
  const x=Math.abs(recent[i].price-recent[i-1].price);
  if(x>0)changes.push(x);
 }
 if(changes.length<4)return null;
 changes.sort((a,b)=>a-b);
 const step=Math.max(changes[Math.floor(changes.length/2)],spot*1e-8);
 // 'Peak' is the furthest genuine approach toward resistance/support,
 // observed strictly before the present quote, not a guessed future high.
 let peak=null,projected=-Infinity;
 for(const q of recent){
  if(q.ts<first.ts||q.ts>=ts)continue;
  const signed=dir*q.price;
  if(signed>projected){projected=signed;peak=q;}
 }
 if(!peak||ts-peak.ts<900||ts-peak.ts>5000)return null;
 const approached=dir*(peak.price-first.price);
 const retreated=dir*(peak.price-spot);
 const lastWindow=recent.filter(q=>q.ts>=ts-2500);
 if(lastWindow.length<2)return null;
 const lastLeg=dir*(spot-lastWindow[0].price);
 // Price ACTUALLY approached and then retreated from the wall.
 // A stationary touch and a continuing breakout are not reclassified.
 if(!(approached>=Math.max(tolerance*.65,step*1.5)&&
   retreated>=Math.max(tolerance*.30,step*1.15)&&
   lastLeg<=step*.15))return null;
 for(const zone of walls){
  const leadingEdge=dir>0?zone.low:zone.high;
  const peakGap=dir*(leadingEdge-peak.price);
  const spotGap=dir*(leadingEdge-spot);
  if(peakGap>Math.max(tolerance*1.5,step*2)||
    peakGap< -tolerance*.30||spotGap< -tolerance*.25)continue;
  // This is an observed counter-move against the entry side, not an
  // unconditional rejection of CALL at resistance or PUT at support.
  return {kind:'observed-level-rejection-against-entry',
    level:Number(zone.level),confirmedPivots:Number(zone.confirmedPivots),
    independentRejections:Number(zone.independentRejections),
    approach:approached,retreat:retreated};
 }
 return null;
}
