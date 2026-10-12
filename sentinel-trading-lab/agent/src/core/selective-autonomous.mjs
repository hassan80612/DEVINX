import {automaticForwardPrediction} from './automatic-forward-model.mjs';

// Independent interval estimate: compare the predicted price at the actual
// future ENTRY with the predicted price at its actual EXIT. No strategy votes,
// fixed candle-count gate or invented observations. Never authorizes a trade.
export function autonomousSelectiveEntry({quoteHistory=[],now=Date.now(),delaySeconds=30,
 holdingSeconds=delaySeconds,quoteTs=0,asset='UNKNOWN',engineId='automatic'}={}){
 const h=Number(delaySeconds),hold=Number(holdingSeconds),at=Number(quoteTs);
 const blank=(status)=>({engineId,asset,delaySeconds:h,holdingSeconds:hold,issuedAt:now,
  entryAt:now+h*1000,exitAt:now+(h+hold)*1000,side:null,
  projectedEntryPrice:null,projectedExitPrice:null,status,
  forecastOwner:'selective-autonomous-v1',actionable:false,calibrated:false});
 if(!(Number.isInteger(h)&&h>=1&&h<=3600&&Number.isInteger(hold)&&hold>=1&&hold<=3600))
   return blank('invalid-interval');
 if(!(at>0&&at<=now&&now-at<=2500))return blank('waiting-fresh-quote');
 const recent=quoteHistory.filter(q=>Number(q?.ts)<=now&&Number(q?.receivedAt??q?.ts)<=now&&
  Number(q?.price)>0&&Number.isFinite(Number(q?.ts))).sort((a,b)=>a.ts-b.ts);
 const latest=recent.at(-1);
 if(!latest||now-Number(latest.ts)>2500)return blank('waiting-fresh-quote');
 // A small but genuine observation window is enough to start. It is not a
 // count of three fully closed bars; longer history remains available.
 const observed=recent.filter(q=>Number(q.ts)>=now-180000);
 if(observed.length<8||Number(latest.ts)-Number(observed[0].ts)<15000)
   return blank('insufficient-observations');
 let sum=0,duration=0;
 for(let i=1;i<observed.length;i++){
  const dt=(Number(observed[i].ts)-Number(observed[i-1].ts))/1000;
  if(dt<=0||dt>8)continue;
  const move=Math.log(Number(observed[i].price)/Number(observed[i-1].price));
  sum+=move*move;duration+=dt;
 }
 if(duration<12||sum<=0)return blank('insufficient-volatility');
 const sigma=Math.sqrt(sum/duration);
 const entry=automaticForwardPrediction({quoteHistory:observed,asOf:now,selectedSeconds:h});
 const exit=automaticForwardPrediction({quoteHistory:observed,asOf:now,selectedSeconds:h+hold});
 const p1=Number(entry?.prediction?.projectedPrice),p2=Number(exit?.prediction?.projectedPrice);
 if(!(p1>0&&p2>0))return blank('insufficient-projection');
 const change=Math.log(p2/p1),noise=sigma*Math.sqrt(hold);
 // Modest noise floor, not a simulated confidence / hit-rate. This avoids
 // filling the card with directions smaller than typical observed variation.
 const minMove=Math.max(1e-12,noise*.2);
 const side=change>=minMove?'CALL':change<=-minMove?'PUT':null;
 return {...blank(side?'forecast':'low-directional-edge'),side,
  projectedEntryPrice:p1,projectedExitPrice:p2,
  evidenceSeconds:duration,signalToNoise:Math.abs(change)/Math.max(noise,1e-12)};
}
