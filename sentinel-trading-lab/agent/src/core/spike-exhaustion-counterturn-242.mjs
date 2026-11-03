// Experimental Sentinel 242: a fast causal reversal signal after a price spike.
// Based exclusively on quotes already received. No expiry, broker, or timing writes.
import {entryFamilyOf} from './entry-family.mjs';
import {assessCarryoverSpike244} from './carryover-spike-244.mjs';
const dir=s=>s==='CALL'?1:s==='PUT'?-1:0;
const med=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||0};
const continuation=/continuation|followthrough|breakout|trend|impulse|cycle|analogue|forecast/i;
export function assessSpikeExhaustion242({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs,structure}={}){
 const none={kind:'none'},ms=Number(durationMs),at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(![30000,60000].includes(ms)||candidate?.ready!==true||
    !['CALL','PUT'].includes(candidate?.side)||
    !(at>0&&clock>=at&&clock-at<=(ms===30000?1450:1950)&&spot>0))return none;
 // At a NEW candle opening, a massively extended previous candle takes
 // priority even if the old signal was mislabeled a "reversal" while still
 // following the acceleration. Opposite-direction reversals stay intact.
 const carryover=assessCarryoverSpike244({candidate,quoteHistory,quoteAt,now,price,durationMs});
 if(carryover.kind==='flip')return carryover;
 // Other reversal families keep their original decision: only the proven
 // carry-over condition may contest a same-direction reversal label.
 if(entryFamilyOf(candidate)==='reversal'||
    !(entryFamilyOf(candidate)==='continuation'||continuation.test(String(candidate.reason||''))))
    return none;
 const s=dir(candidate.side),q=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const row=quoteHistory[i],ts=Number(row?.ts),received=Number(row?.receivedAt??ts),p=Number(row?.price);
  if(ts<at-14000)break;
  if(ts>at||received>clock||!(p>0))continue;
  q.push({ts,price:p});
 }
 q.reverse();
 if(q.length<11||q.at(-1).ts!==at||q.at(-1).price!==spot||
    q.some((x,i)=>i>0&&(x.ts<=q[i-1].ts||x.ts-q[i-1].ts>2500)))return none;
 const diff=q.slice(1).map((x,i)=>x.price-q[i].price),abs=diff.map(Math.abs).filter(x=>x>0);
 if(abs.length<8)return none;
 const typical=Math.max(med(abs),spot*1e-8);
 // The current candle may STILL be accelerating in the original direction.
 // An exceptional terminal impulse can be countertraded BEFORE any negative
 // tick exists. This is an explicitly speculative active-climax hypothesis,
 // NOT a verified reversal. Ordinary, evenly paced trends never qualify.
 const oldAbs=diff.slice(0,-4).map(Math.abs).filter(v=>v>0);
 const baseline=Math.max(med(oldAbs),spot*1e-8);
 const tail=diff.slice(-4).map(v=>s*v);
 const last2=tail[2]+tail[3],first2=tail[0]+tail[1];
 const sprint=tail.reduce((a,b)=>a+b,0),progress=s*(spot-q[0].price);
 const livePeak= q.every(x=>s*(spot-x.price)>=-baseline*.05);
 const activeClimax=oldAbs.length>=6&&livePeak&&
   tail[2]>baseline*.95&&tail[3]>baseline*1.55&&
   tail[3]>=tail[2]*1.12&&
   last2>=baseline*6.5&&last2>=Math.max(first2,baseline)*1.7&&
   sprint>=baseline*8.5&&progress>=baseline*13.5&&
   sprint/Math.max(progress,baseline)>=.52;
 if(activeClimax)return {kind:'flip',side:candidate.side==='CALL'?'PUT':'CALL',
   impulseSide:candidate.side,peak:spot,peakAt:at,
   at,slowing:false,nearWall:false,activeClimax:true,
   sprintVsBaseline:Number((sprint/baseline).toFixed(2)),
   source:'active-spike-overextension-243-no-opposite-quote'};
 const peakIndex=q.reduce((i,x,j)=>s*x.price>s*q[i].price?j:i,0),
  peak=q[peakIndex],age=at-peak.ts;
 if(!(peakIndex>=5&&peakIndex<=q.length-2&&age>=250&&age<=6500))return none;
 const advance=s*(peak.price-q[0].price),
  before=diff.slice(Math.max(0,peakIndex-4),peakIndex).map(v=>s*v),
  countPositive=before.filter(v=>v>0).length,
  largest=Math.max(...before,0);
 if(!(advance>=typical*4.6&&countPositive>=3&&largest>=typical*1.65))return none;
 const recent=diff.slice(-5),counter=recent.filter(v=>-s*v>=typical*.20),
  counterSum=counter.reduce((n,v)=>n-s*v,0),
  decline=s*(peak.price-spot),pullback=decline/advance,
  slowing=before.length>=3&&before.at(-1)<largest*.75,
  latestSigned=s*diff.at(-1);
 const wall=Array.isArray(structure?.candleLevelMap?.levels)&&
  structure.candleLevelMap.levels.some(z=>{
   const role=candidate.side==='CALL'?'resistance':'support',
    tests=Number(z?.[role+'Pivots']||0)+Number(z?.[role+'Rejections']||0),
    tol=Number(structure.candleLevelMap.tolerance),level=Number(z?.level);
   return tests>=2&&tol>0&&level>0&&Math.abs(peak.price-level)<=tol*.75;
  });
 const firstSharp=slowing&&counter.length>=1&&counterSum>=typical*.85,
  standardTurn=counter.length>=2&&counterSum>=typical*1.1,
  wallTurn=wall&&counter.length>=1&&counterSum>=typical*1.25,
  minimumPullback=(wall||slowing)?.052:.078;
 if(!((firstSharp||standardTurn||wallTurn)&&latestSigned<=typical*.2&&
   decline>=typical*.75&&pullback>=minimumPullback&&pullback<=.62))
  return {kind:'watch',impulseSide:candidate.side,peak:peak.price,
   retracement:Number(pullback.toFixed(3)),slowing,at};
 if(peakIndex<q.length-5&&diff.slice(-3).some(x=>s*x>typical*1.1))return none;
 return {kind:'flip',side:candidate.side==='CALL'?'PUT':'CALL',
  impulseSide:candidate.side,peak:peak.price,peakAt:peak.ts,
  retracement:Number(pullback.toFixed(3)),slowing,nearWall:wall,
  at,source:'received-price-spike-exhaustion-242'};
}
export function reviewBoldSpikeReversal242(input={}){
 const candidate=input.candidate,evidence=assessSpikeExhaustion242(input);
 if(evidence.kind!=='flip')return evidence.kind==='watch'?{...candidate,spikeWatch:evidence}:candidate;
 return {...candidate,side:evidence.side,
  originalDecisionSide:candidate.side,originalDecisionReason:candidate.reason,
  reason:evidence.activeClimax?'active-spike-countertrade-243':
    'observed-spike-exhaustion-reversal-242',
  experimentalSpikeReversal:true,experimentalActiveClimax:evidence.activeClimax===true,
  spikeExhaustion:evidence,
  marketPhase:evidence.activeClimax?'reversal-forming':'reversal-confirmed',
  marketPhaseLabel:(evidence.activeClimax?'PICO ACELERADO · CONTRA-TENDÊNCIA · ':
    'PICO PERDENDO FORÇA · ')+evidence.side,
  marketTrendSide:evidence.side};
}
