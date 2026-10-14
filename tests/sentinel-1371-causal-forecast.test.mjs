import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath} from '../sentinel-trading-lab/agent/src/core/causal-interval-forecast-1371.mjs';
import {confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';

const T=1800000000000,asOf=T+300000;
const settings={asset:'EUR/USD OTC',engine:'automatic',forecastMode:'continuous',
 orderDurationMs:30000};
function quoteSeries(kind='bear',end=300){
 const rows=[];
 for(let i=0;i<end;i++){
  let value=1.2-i*.000015+Math.sin(i/5)*.000008;
  if(kind==='reversal'&&i>=264){
   const origin=1.2-264*.000015+Math.sin(264/5)*.000008;
   value=origin+(i-264)*.000060+Math.sin(i/6)*.000005;
  }
  rows.push({ts:T+i*1000,receivedAt:T+i*1000,price:value});
 }
 return rows;
}
test('13.7.1 forecasts a future entry-to-expiration interval, not the current candle',()=>{
 const q=quoteSeries('bear'),m=causalForwardPath({quoteHistory:q,asOf,
  holdingSeconds:30,maxSeconds:60});
 assert.equal(m.status,'causal-forward-path');
 assert.ok(m.priceAt(5)>0&&m.priceAt(35)>0);
 assert.ok(m.priceAt(30)>m.priceAt(60),'bearish history predicts lower forward price, rather than auto CALL');
 const snap={quoteHistory:q,quoteTs:T+299000,price:q.at(-1).price,provider:'iq_option'};
 const c=confirmWindowEntry({settings,snap,now:asOf,adaptiveHistory:q,
  forecastModel:'causal-interval-1371',entryAt:asOf});
 assert.ok(['CALL','PUT',null].includes(c.side));
 assert.equal(c.projectedEntryPrice,m.priceAt(0));
 assert.equal(c.projectedExitPrice,m.priceAt(30));
});
test('a persistent rebound changes the FUTURE estimate instead of continuing a stale PUT lock',()=>{
 const bear=causalForwardPath({quoteHistory:quoteSeries('bear'),asOf,holdingSeconds:30,maxSeconds:60});
 const rev=causalForwardPath({quoteHistory:quoteSeries('reversal'),asOf,holdingSeconds:30,maxSeconds:60});
 assert.equal(rev.status,'causal-forward-path');
 const b=Math.log(bear.priceAt(60)/bear.priceAt(30));
 const r=Math.log(rev.priceAt(60)/rev.priceAt(30));
 assert.ok(r>b,JSON.stringify({bear:b,reversal:r}));
});
test('future or late-arriving quotes cannot alter a prediction issued earlier',()=>{
 const q=quoteSeries();
 const baseline=causalForwardPath({quoteHistory:q,asOf,holdingSeconds:30,maxSeconds:60});
 const forged=[...q,{ts:asOf+1000,price:5},{ts:T+298000,
  receivedAt:asOf+9000,price:5}];
 const after=causalForwardPath({quoteHistory:forged,asOf,holdingSeconds:30,maxSeconds:60});
 assert.equal(after.priceAt(30),baseline.priceAt(30));
 assert.equal(after.priceAt(60),baseline.priceAt(60));
});
test('selected automatic engine and actual entry confirmation use the new owner',()=>{
 const q=quoteSeries('reversal');
 const snap={quoteHistory:q,quoteTs:T+299000,price:q.at(-1).price,provider:'iq_option'};
 const model=singleEngineForecast({settings,snap,now:asOf,
  forecastModel:'causal-interval-1371',adaptiveHistory:q});
 assert.equal(model.modelVersion,'causal-interval-1371');
 const confirm=confirmWindowEntry({settings,snap,now:asOf,
  forecastModel:'causal-interval-1371',adaptiveHistory:q,entryAt:asOf});
 assert.ok(confirm.projectedEntryPrice>0&&confirm.projectedExitPrice>0);
 assert.equal(confirm.projectedExitPrice,causalForwardPath({
  quoteHistory:q,asOf,holdingSeconds:30,maxSeconds:30}).priceAt(30));
});
test('13.7.1 runtime does not impose the 13.7 candle-colour veto or duplicate counterpressure veto',()=>{
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/guardOpeningCandidate\(\{candidate:currentEntry/);
 assert.doesNotMatch(runtime,/counterpressure\?\.blocked!==true/);
 assert.match(runtime,/confirmedStructuralReversal\(/);
});
