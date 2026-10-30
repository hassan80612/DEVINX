// A late 2-second spike is not evidence of persistence for a 30s/1m entry.
// Use only causally available quote history; never infer an opposite trade.
import {entryFamilyOf} from './entry-family.mjs';
const before=(rows,at)=>{
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)return rows[i];
 return null;
};
export function reviewLateImpulseEntry({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(!candidate||candidate.ready!==true||!['CALL','PUT'].includes(candidate.side)||
  ![30000,60000].includes(Number(durationMs))||
  entryFamilyOf(candidate)!=='continuation')return candidate;
 const at=Number(quoteAt),time=Number(now),spot=Number(price);
 if(!(at>0&&at<=time&&time-at<=2000&&spot>0))return candidate;
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
  const ts=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??ts);
  return ts>=at-14000&&ts<=at&&received<=time&&p>0;
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.length<14||rows.at(-1).ts!==at||rows.at(-1).price!==spot)return candidate;
 const ref2=before(rows,at-2200),ref11=before(rows,at-11000);
 if(!ref2||!ref11||at-ref2.ts>3500||at-ref11.ts>13000)return candidate;
 const dir=candidate.side==='CALL'?1:-1;
 const burst=dir*Math.log(spot/ref2.price),older=dir*Math.log(ref2.price/ref11.price);
 const path=rows.filter(q=>q.ts>=ref11.ts);
 const hi=Math.max(...path.map(q=>q.price)),lo=Math.min(...path.map(q=>q.price));
 const range=Math.log(hi/lo);
 if(!(range>0&&burst>0&&older>0))return candidate;
 const pastMs=Math.max(1,ref2.ts-ref11.ts),burstMs=Math.max(1,at-ref2.ts);
 const burstRatio=burst/(Math.abs(older)/pastMs*burstMs+1e-12);
 const atExtreme=dir>0?(hi-spot)/Math.max(1e-12,hi-lo)<.08:(spot-lo)/Math.max(1e-12,hi-lo)<.08;
 const surgeFraction=burst/range,noiseMoves=[];
 for(let i=1;i<path.length;i++){
  const q=path[i],p=path[i-1];
  if(q.ts>ref2.ts||q.ts-p.ts<=0||q.ts-p.ts>2000)continue;
  noiseMoves.push(Math.abs(Math.log(q.price/p.price)));
 }
 noiseMoves.sort((a,b)=>a-b);
 const typical=noiseMoves[Math.floor(noiseMoves.length/2)]||0;
 const exceptional=noiseMoves.length>=6&&typical>0&&burst>=typical*5;
 if(!(exceptional&&atExtreme&&burstRatio>=3.5&&surgeFraction>=.56))return candidate;
 return{...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'late-impulse-spike-without-horizon-persistence',lateImpulse:{
   burstRatio:Number(burstRatio.toFixed(2)),surgeFraction:Number(surgeFraction.toFixed(2))}};
}
