import test from 'node:test';
import assert from 'node:assert/strict';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=Date.UTC(2026,9,16,22,0,27),value=t=>Math.exp(.0006*Math.sin(t*2*Math.PI/40+5.3));
const rows=Array.from({length:1801},(_,i)=>({ts:T-180000+i*100,price:value(i*.1)}));
const input={quoteHistory:rows,quoteAt:T,price:rows.at(-1).price,now:T,durationMs:30000};
test('the same observed wave can reverse between :57 and :00; projection must use the selected expiry',()=>{
 const current=thirtySecondCycleForecast(input),synchronized=thirtySecondCycleForecast({...input,projectionTargetAt:T+33000});
 assert.equal(current.side,'PUT');assert.equal(synchronized.side,'CALL');
 assert.equal(current.horizonMs,30000);assert.equal(synchronized.horizonMs,33000);
 assert.equal(synchronized.projectionTargetAt,T+33000);
 assert.ok(value(210)<value(180));assert.ok(value(213)>value(180));
});
test('actual runtime keeps the :27 release and :00 counter, and forecasts that same deadline',()=>{
 for(const [mode,side,exitAt]of [['current','PUT',T+30000],['broker','CALL',T+33000]]){
  const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  r.settings={...r.settings,clockMode:mode};
  r.setExternalMarket({provider:'iq_option',symbol:'EUR/USD',quote:input.price,quoteTs:T,quoteHistory:rows,
   quoteFeedValidated:true,brokerTiming:{brokerClock:{verified:true,source:'broker-protocol-timesync',capturedAt:T,brokerNowMs:T,ageMs:0}}});
  const a=r._signalValidationGate({analysis:{},snap:r._marketSnapshot(),settings:r.settings,now:T,monotonicNow:()=>0}).analysis.vnext.futureEntryAnchor;
  assert.equal(a.entryAt,T);assert.equal(a.side,side);assert.equal(a.exitAt,exitAt);
  assert.equal(a.projectedEntryPrice,input.price);
 }
});
test('target is relative to the quote timestamp, excludes future evidence, and rejects passed deadlines',()=>{
 const args={...input,now:T+300,projectionTargetAt:T+33000},expected=thirtySecondCycleForecast(args);
 assert.equal(expected.horizonMs,33000);
 assert.deepEqual(thirtySecondCycleForecast({...args,quoteHistory:[...rows,{ts:T+1,price:99},
  {ts:T-10,price:9,receivedAt:T+301}]}),expected);
 assert.equal(thirtySecondCycleForecast({...input,projectionTargetAt:T}).ready,false);
});
