import test from 'node:test';
import assert from 'node:assert/strict';
import {specialistStructurePrediction} from '../sentinel-trading-lab/agent/src/core/specialist-structure-models.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
const ids=['price_action','support_resistance','trend','mean_reversion','breakout','trendline_breakout','fibonacci_retest','smart_confluence'];
const start=1700000000000;
const qs=Array.from({length:2400},(_,i)=>({ts:start+i*1000,price:Math.exp(.002*Math.sin(i/100)+i*.000001)}));
const now=qs.at(-1).ts;
for(const engineId of ids)test(engineId+': prospective receipt, future and delayed-input isolation',()=>{
 const input={engineId,quoteHistory:qs,asOf:now,selectedSeconds:60};
 const a=specialistStructurePrediction(input);
 assert.ok(a.prediction);assert.equal(a.engineId,engineId);
 assert.ok(a.prediction.expectedLow<=a.prediction.projectedPrice&&a.prediction.expectedHigh>=a.prediction.projectedPrice);
 assert.equal(a.prediction.modelConfidence,null);
 assert.deepEqual(a,specialistStructurePrediction({...input,quoteHistory:[...qs,{ts:now+1000,price:100},{ts:now-500,receivedAt:now+1000,price:100}]}));
 const settings={asset:'TEST',engine:engineId,orderDurationMs:60000};
 const snap={quoteHistory:qs,quoteTs:now,price:qs.at(-1).price};
 const baseline=singleEngineForecast({settings,snap,now});
 assert.deepEqual(baseline,singleEngineForecast({settings,snap,now,forecastModel:'original-67'}));
 const b=singleEngineForecast({settings,snap,now,forecastModel:'specialist-structure-v2'});
 assert.equal(b.engineId,engineId);assert.equal(b.receipt.targetAt,now+60000);
 assert.equal(b.modelVersion,'specialist-structure-v2');
});
test('Price Action corrects pressure away from an upper rejection and toward a lower rejection',()=>{
 const make=high=>Array.from({length:421},(_,i)=>({ts:start+i*1000,price:i===414?(high?1.01:.99):1}));
 const asOf=start+420000;
 const upper=specialistStructurePrediction({engineId:'price_action',quoteHistory:make(true),asOf,selectedSeconds:60});
 const lower=specialistStructurePrediction({engineId:'price_action',quoteHistory:make(false),asOf,selectedSeconds:60});
 assert.equal(upper.prediction.side,'PUT');assert.equal(lower.prediction.side,'CALL');
});
test('stale/short structure does not manufacture a specialist estimate',()=>{
 for(const engineId of ids){
  assert.equal(specialistStructurePrediction({engineId,quoteHistory:qs,asOf:now+5000,selectedSeconds:60}).prediction,null);
  assert.equal(specialistStructurePrediction({engineId,quoteHistory:qs.slice(-10),asOf:now,selectedSeconds:60}).prediction,null);
 }
});
