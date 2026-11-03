// Experimental Sentinel 242: a fast causal reversal signal after a price spike.
// Based exclusively on quotes already received. No expiry, broker, or timing writes.
import {entryFamilyOf} from './entry-family.mjs';
const dir=s=>s==='CALL'?1:s==='PUT'?-1:0;
const med=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||0};
const continuation=/continuation|followthrough|breakout|trend|impulse|cycle|analogue|forecast/i;
export function assessSpikeExhaustion242({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs,structure}={}){
 const none={kind:'none'},ms=Number(durationMs),at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(![30000,60000].includes(ms)||candidate?.ready!==true||
    !['CALL','PUT'].includes(candidate?.side)||entryFamilyOf(candidate)==='reversal'||
    !(entryFamilyOf(candidate)==='continuation'||continuation.test(String(candidate.reason||'')))||
    !(at>0&&clock>=at&&clock-at<=(ms===30000?1450:1950)&&spot>0))return none;
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
  reason:'observed-spike-exhaustion-reversal-242',
  experimentalSpikeReversal:true,spikeExhaustion:evidence,
  marketPhase:'reversal-confirmed',
  marketPhaseLabel:'PICO PERDENDO FORÇA · '+evidence.side,marketTrendSide:evidence.side};
}
