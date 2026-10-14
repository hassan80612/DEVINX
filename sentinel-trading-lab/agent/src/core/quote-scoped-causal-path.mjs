import {causalForwardPath as intervalPath} from './causal-interval-forecast-1371.mjs';
import {causalForwardPath as closedStructurePath} from './causal-closed-structure-1379.mjs';

// Memoize ONLY repeated computations on the exact same in-memory quote
// snapshot and exact time/horizon. The chosen model, inputs and outputs
// are unchanged. Every new quote timestamp/time or horizon re-fits.
// WeakMap prevents retaining entire historical price streams.
const memo=new WeakMap();
export function quoteScopedCausalPath({
 forecastModel,quoteHistory=[],candles=[],asOf=Date.now(),holdingSeconds=30,maxSeconds=90
}={}){
 const fit=forecastModel==='causal-closed-structure-1379'?closedStructurePath:intervalPath;
 if(!Array.isArray(quoteHistory))
   return fit({quoteHistory,candles,asOf,holdingSeconds,maxSeconds});
 const last=quoteHistory.at(-1)||{};
 const candleKey=(Array.isArray(candles)?candles:[]).slice(-3).map(c=>[c.from,c.to,c.high??c.max,c.low??c.min].join(',')).join(';');
 const key=[
   forecastModel,asOf,holdingSeconds,maxSeconds,quoteHistory.length,candleKey,
   Number(last.ts),Number(last.price),Number(last.receivedAt??last.ts)
 ].join('|');
 let cached=memo.get(quoteHistory);
 if(cached?.has(key))return cached.get(key);
 const result=fit({quoteHistory,candles,asOf,holdingSeconds,maxSeconds});
 if(!cached){cached=new Map();memo.set(quoteHistory,cached)}
 cached.set(key,result);
 if(cached.size>8)cached.delete(cached.keys().next().value);
 return result;
}
