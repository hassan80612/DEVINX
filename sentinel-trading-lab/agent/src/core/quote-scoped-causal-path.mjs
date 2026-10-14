import {causalForwardPath as intervalPath} from './causal-interval-forecast-1371.mjs';
import {causalForwardPath as closedStructurePath} from './causal-closed-structure-1379.mjs';

// Memoize ONLY repeated computations on the exact same in-memory quote
// snapshot and exact time/horizon. The chosen model, inputs and outputs
// are unchanged. Every new quote timestamp/time or horizon re-fits.
// WeakMap prevents retaining entire historical price streams.
const memo=new WeakMap();
export function quoteScopedCausalPath({
 forecastModel,quoteHistory=[],asOf=Date.now(),holdingSeconds=30,maxSeconds=90
}={}){
 const fit=forecastModel==='causal-closed-structure-1379'?closedStructurePath:intervalPath;
 if(!Array.isArray(quoteHistory))
   return fit({quoteHistory,asOf,holdingSeconds,maxSeconds});
 const last=quoteHistory.at(-1)||{};
 const key=[
   forecastModel,asOf,holdingSeconds,maxSeconds,quoteHistory.length,
   Number(last.ts),Number(last.price),Number(last.receivedAt??last.ts)
 ].join('|');
 const cached=memo.get(quoteHistory);
 if(cached?.key===key)return cached.result;
 const result=fit({quoteHistory,asOf,holdingSeconds,maxSeconds});
 memo.set(quoteHistory,{key,result});
 return result;
}
