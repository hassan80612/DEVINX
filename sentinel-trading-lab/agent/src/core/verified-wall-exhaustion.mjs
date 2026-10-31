// Conservative NOW market-base admission screen. Never changes an expiry,
// candle period, selector, scheduled entry, broker, martingale or WIN/LOSS.
const finitePositive=p=>typeof p==='number'&&Number.isFinite(p)&&p>0;
const validated=x=>Number.isFinite(Number(x))?Number(x):NaN;
import {levelRoleEvidence} from './level-role-evidence.mjs';

export function verifiedWallExhaustionRisk({
 candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price
}={}){
 // A setup name cannot exempt an approach to a DIFFERENT opposing wall.
 // A breakout already beyond that wall and an accelerating continuation
 // still pass the geometric and observed-deceleration checks below.
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side))return null;
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
   levelRoleEvidence(z,side==='CALL'?'PUT':'CALL').pivots>=1&&
   levelRoleEvidence(z,side==='CALL'?'PUT':'CALL').rejections>=2&&
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
 const observed=(target,slack=1600)=>{
  let last=-Infinity,out=null;
  for(const q of quoteHistory){
   const at=validated(q?.ts),received=validated(q?.receivedAt??q?.ts);
   const p=validated(q?.price);
   if(at<=target&&target-at<=slack&&at>last&&at<=ts&&received<=clock&&finitePositive(p)){
    last=at;out=p;
   }
  }
  return out;
 };
 if(observed(ts,0)!==spot)return null;
 const start=observed(ts-7000),middle=observed(ts-3000);
 if(start===null||middle===null)return null;
 const initial=sign*(middle-start),final=sign*(spot-middle);
 // The trend must have actually approached the wall but visibly slowed
 // BEFORE the order. Fast, strong continuation remains permitted.
 if(!(initial>=tolerance*.8&&sign*(spot-start)>tolerance*.4&&
   final<=initial*.2))return null;
 return {kind:'verified-level-fading-approach',
   level:barrier.level,confirmedPivots:barrier.confirmedPivots,
   independentRejections:barrier.independentRejections};
}
