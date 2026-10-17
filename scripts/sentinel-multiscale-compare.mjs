// Coherent synthetic OHLC/tick comparison. NOT market accuracy validation.
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity as proposed,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {HistoricalPriceStructureCache} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
const T=Math.floor(1792250000000/60000)*60000;
const basePath=process.argv[2];
if(!basePath)throw Error('Pass the absolute production core directory');
const {analyzeNowOpportunity:production}=await import(pathToFileURL(basePath+'/now-opportunity-engine.mjs'));
const {HistoricalPriceStructureCache:ProductionCache}=await import(pathToFileURL(basePath+'/historical-price-structure.mjs'));
const cases=process.argv[5]?.split(',')||['uptrend','downtrend','regular-range','changing-range','sharp-turns','random-walk'];
const results=[];
for(const kind of cases){
 let seed=1267;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 let random=0;const prices=new Map();
 for(let t=-6000;t<=750;t++){
  random+=(rnd()-.5)*.000028;
  const trend=kind==='uptrend'?t*.0000008:kind==='downtrend'?-t*.0000008:0;
  const amplitude=kind==='changing-range'?(.0001+.00012*(1+Math.sin(t/109))):.0002;
  const triangle=kind==='sharp-turns'||kind.startsWith('triangle-');
  const wave=triangle?.0004*(2/Math.PI)*Math.asin(Math.sin(kind==='sharp-turns'?t/43:t*2*Math.PI/Number(kind.slice(9)))):
   kind.includes('range')?amplitude*Math.sin(t/(kind==='regular-range'?17:31)):
   kind==='random-walk'?random:.000025*Math.sin(t/9);
  prices.set(t,1.1+trend+wave);
 }
 const bars=[];
 for(let from=-6000;from<720;from+=60){
  const values=Array.from({length:60},(_,i)=>prices.get(from+i));
  bars.push({from:T+from*1000,to:T+(from+60)*1000,open:values[0],close:values.at(-1),
   high:Math.max(...values),low:Math.min(...values)});
 }
 const outputs=[];
 for(const [name,analyze] of [['production32',production],['candidate',proposed]]){
  let state=null;const selector=new CompletedExpiryDirection();
  const cache=name==='production32'?new ProductionCache():new HistoricalPriceStructureCache();
  const entries=[],cpu=[],reasons={};
  for(let t=0;t<720;t++){
   const now=T+t*1000,quoteHistory=Array.from({length:181},(_,i)=>({ts:T+(t-180+i)*1000,price:prices.get(t-180+i)}));
   const start=performance.now(),candidate=analyze({quoteHistory,quoteAt:now,price:prices.get(t),now,
    durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',
    candles:bars.filter(b=>b.to<=now).slice(-100),structureCache:cache,
    expiryDirectionSelector:selector,expiryDirectionContext:kind});
   cpu.push(performance.now()-start);
   const next=advanceNowOpportunity({previous:state,candidate,now,quoteAt:now,asset:kind,durationMs:30000});
   if(next?.entryReadyNow){
    const delta=prices.get(t+30)-prices.get(t),outcome=delta===0?'tie':(delta>0?'CALL':'PUT')===next.side?'win':'loss';
    entries.push({t,side:next.side,reason:candidate.reason,outcome});
    reasons[candidate.reason]=(reasons[candidate.reason]||0)+1;
   }
   state=next;
  }
  cpu.sort((a,b)=>a-b);
  outputs.push({name,signals:entries.length,wins:entries.filter(e=>e.outcome==='win').length,
   losses:entries.filter(e=>e.outcome==='loss').length,ties:entries.filter(e=>e.outcome==='tie').length,
   cpuMs:{mean:cpu.reduce((s,x)=>s+x,0)/cpu.length,p95:cpu[Math.floor(cpu.length*.95)],max:cpu.at(-1)},reasons,entries});
 }
 const before=outputs[0].entries,after=outputs[1].entries;
 const afterByTime=new Map(after.map(e=>[e.t,e]));
 const common=before.filter(e=>afterByTime.has(e.t));
 const matched={entries:common.length,
  productionWins:common.filter(e=>e.outcome==='win').length,
  candidateWins:common.filter(e=>afterByTime.get(e.t).outcome==='win').length,
  changedDirections:common.filter(e=>afterByTime.get(e.t).side!==e.side).length,
  removed:before.length-common.length,added:after.length-common.length};
 results.push({kind,outputs,matched});
 console.log(kind,JSON.stringify(outputs.map(({entries,...r})=>r)));
}
writeFileSync(new URL('../reports/'+(process.argv[3]||'sentinel-multiscale-synthetic-20261017.json'),import.meta.url),JSON.stringify({
 purpose:'Synthetic coherent closed OHLC and quotes only; NOT real or independent market accuracy.',
 productionVersion:'13.9.32',candidate:process.argv[4]||'unreleased candle-level-map',results},null,2)+'\n');
