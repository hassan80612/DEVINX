import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
const T=Date.UTC(2026,9,15,12);
const engines=['automatic','trend','mean_reversion','support_resistance','price_action','breakout','smart_confluence'];
const make=(kind,n=240)=>{let p=1.1;return Array.from({length:n},(_,i)=>{
 const d=kind==='up'?i*.00002:kind==='down'?-i*.00002:
  kind==='turn'?(i<130?-i*.000025:-130*.000025+(i-130)*.00006):
  .0008*Math.sin(i*.11);
 const price=1.1*Math.exp(d+.00001*Math.sin(i*.37));
 return {ts:T+i*1000,receivedAt:T+i*1000,price};
});};
for(const durationMs of [30000,60000]){
 test('same central direction for every selected strategy, '+durationMs/1000+'s',()=>{
  for(const kind of ['up','down','turn','range']){
   const qs=make(kind),q=qs.at(-1),input={quoteHistory:qs,quoteAt:q.ts,price:q.price,now:q.ts,durationMs};
   const baseline=analyzeNowOpportunity({...input,engineId:'automatic',qualityPolicy:'adaptive-market-v1'});
   for(const engineId of engines){
    const p=analyzeNowOpportunity({...input,engineId,qualityPolicy:'adaptive-market-v1'});
    assert.equal(p.side,baseline.side,kind+' '+engineId);
    assert.equal(p.ready,baseline.ready,kind+' '+engineId);
    assert.equal(p.engineId,engineId);
    assert.equal(p.signalOwner,'shared-market-base');
   }
   if(durationMs===60000){
    const old=analyzeNowOpportunity({...input,engineId:'automatic'});
    for(const field of ['ready','side','entryPrice','reason','observedAt'])
      assert.equal(baseline[field],old[field],'60s '+kind+' '+field);
   }
  }
 });
 test('one immutable CALL/PUT each '+durationMs/1000+'s expiry',()=>{
  const qs=make('turn',340),asset='EUR/USD';let state=null;
  for(let i=50;i<qs.length;i++){
   const q=qs[i],candidate=analyzeNowOpportunity({quoteHistory:qs.slice(0,i+1),quoteAt:q.ts,price:q.price,now:q.ts,durationMs,qualityPolicy:'adaptive-market-v1'});
   const next=advanceNowOpportunity({previous:state,candidate,now:q.ts,quoteAt:q.ts,asset,engineId:'automatic',durationMs});
   if(state?.phase==='fired'&&q.ts<state.exitAt){
    assert.equal(next.side,state.side);
    assert.equal(next.entryTriggeredAt,state.entryTriggeredAt);
    assert.equal(next.entryReadyNow,false);
   }
   state=next;
  }
 });
}
test('pattern learner uses only settled past periods and ignores future/unreceived quotes',()=>{
 const qs=make('range'),q=qs.at(-1),input={quoteHistory:qs,quoteAt:q.ts,price:q.price,now:q.ts,durationMs:30000};
 const expected=causalPatternDirection(input);
 const actual=causalPatternDirection({...input,quoteHistory:[...qs,
 {ts:q.ts+1000,receivedAt:q.ts+1000,price:10000},
 {ts:q.ts-1200,receivedAt:q.ts+10000,price:10000}]});
 assert.deepEqual(actual,expected);
});
test('Agent uses the shared market policy instead of independently competing strategies',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 assert.equal(r.settings.engine,'automatic');
 assert.ok(r._signalValidationGate.toString().includes("qualityPolicy:'adaptive-market-v17'"));
});
