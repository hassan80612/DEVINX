import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {automaticForwardPrediction} from './automatic-forward-model.mjs';
import {specialistForwardPrediction} from './specialist-forward-models.mjs';
import {specialistStructurePrediction} from './specialist-structure-models.mjs';

// Selected Seletiva projection is conditioned on the last COMPLETED 30s bar.
// Prices from the candle currently forming do not overwrite the historical
// forecast direction. Its LIVE price is still checked by qualification before
// any entry indication; a sharp current price break invalidates old context.
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const limited=new Map();
export function selectiveClosedEntry({
 quoteHistory=[],now=Date.now(),delaySeconds=30,holdingSeconds=30,
 engineId='automatic',forecastModel='selected-strengths-67.5',asset='UNKNOWN',provider='unknown',
 currentQuoteAt=0,currentPrice=null
}={}){
 const empty=(status)=>({side:null,status,projectedEntryPrice:null,projectedExitPrice:null});
 const delay=Number(delaySeconds),hold=Number(holdingSeconds);
 if(!Number.isInteger(delay)||!Number.isInteger(hold)||delay<1||hold<1)return empty('invalid-interval');
 const closedAt=Math.floor(now/30000)*30000,elapsedMs=now-closedAt;
 // Observe only prices actually available before the selected historical cut.
 const known=quoteHistory.filter(q=>Number.isFinite(Number(q?.ts))&&Number(q.ts)<=closedAt&&
   Number(q.receivedAt??q.ts)<=closedAt&&positive(q.price)!==null)
   .sort((a,b)=>Number(a.ts)-Number(b.ts));
 const last=known.at(-1),at=Number(last?.ts||0);
 if(!last||closedAt-at>8000)return empty('incomplete-closed-bar');
 const liveAge=now-Number(currentQuoteAt);
 if(!(liveAge>=0&&liveAge<=2500))return empty('waiting-fresh-quote');
 // A close-based forecast is stale if the in-progress candle already made a
 // statistically extreme new price move. Do not invert the older forecast.
 const current=positive(currentPrice),start=positive(last.price);
 let sumSq=0,sumSeconds=0;
 for(let i=1;i<known.length;i++){
   if(Number(known[i].ts)<closedAt-180000)continue;
   const dt=(Number(known[i].ts)-Number(known[i-1].ts))/1000;
   if(dt<=0||dt>10)continue;
   sumSq+=Math.log(Number(known[i].price)/Number(known[i-1].price))**2;sumSeconds+=dt;
 }
 const sigma=sumSeconds>0?Math.sqrt(sumSq/sumSeconds):0;
 if(current&&start&&sigma>0&&elapsedMs>=1000&&
   Math.abs(Math.log(current/start))>3*sigma*Math.sqrt(Math.max(2,elapsedMs/1000)))
   return empty('unconfirmed-live-breakout');
 // Unlike using the quote NOW to predict the current candle, start from the
 // last COMPLETED bar and translate lead time by actual elapsed seconds.
 const futureLead=delay+Math.round(elapsedMs/1000);
 if(futureLead+hold>1800)return empty('invalid-interval');
 const historyKey=[String(provider),String(asset),engineId,forecastModel,
   closedAt,futureLead,hold,known.length,at,Number(last.price)].join('|');
 let result=limited.get(historyKey);
 if(!result){
   let learned=null;
   if(engineId==='automatic'&&(forecastModel==='selected-strengths-67.5'||
      forecastModel==='adaptive-direct-trajectory-v1')){
     learned=adaptiveDirectTrajectory({quoteHistory:known,asOf:closedAt,
       entryDelaySeconds:futureLead,holdingSeconds:hold,historicalQuoteGapMs:8000});
   }
   if(learned?.status==='adaptive-direct-trajectory'&&learned.side){
     result={side:learned.side,projectedEntryPrice:positive(learned.projectedEntryPrice),
       projectedExitPrice:positive(learned.projectedExitPrice),status:'closed-bar-learned',
       modelVersion:learned.modelVersion};
   }else{
     const project=h=>{
       const args={quoteHistory:known,asOf:closedAt,selectedSeconds:h};
       const model=engineId==='automatic'?automaticForwardPrediction(args):
         (forecastModel==='selected-strengths-67.5'&&
          ['breakout','fibonacci_retest'].includes(engineId))?
           specialistStructurePrediction({...args,engineId}):
           specialistForwardPrediction({...args,engineId});
       return positive(model?.prediction?.projectedPrice);
     };
     const entry=project(futureLead),exit=project(futureLead+hold);
     const move=entry&&exit?Math.log(exit/entry):0;
     result={side:move>1e-10?'CALL':move< -1e-10?'PUT':null,
       projectedEntryPrice:entry,projectedExitPrice:exit,
       status:entry&&exit?'closed-bar-forecast':'insufficient-completed-context',
       modelVersion:engineId==='automatic'?'original-67-closed-bars':'selected-engine-closed-bars'};
   }
   limited.set(historyKey,result);
   if(limited.size>24)limited.delete(limited.keys().next().value);
 }
 return {...result,asOf:closedAt};
}
