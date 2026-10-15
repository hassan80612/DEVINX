import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=Date.UTC(2026,9,15,12);
const runtime=()=>new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
const quotes=Array.from({length:240},(_,i)=>({
 ts:T+i*1000,receivedAt:T+i*1000,
 price:1.1*Math.exp(i*.000016+.000005*Math.sin(i*.32))
}));
test('vNext never restores old parallel strategy owner',()=>{
 const r=runtime();
 r.patchSettings({engine:'smart_confluence',strategy2:'trend',strategy3:'mean_reversion'});
 assert.equal(r.settings.engine,'automatic');
 assert.equal(r.settings.strategy2,'none');
 assert.equal(r.settings.strategy3,'none');
 const persisted=r.snapshotPersistent();
 persisted.settings.engine='smart_confluence';
 persisted.settings.strategy2='trend';
 persisted.settings.strategy3='mean_reversion';
 const restored=runtime().restore(persisted);
 assert.equal(restored.settings.engine,'automatic');
 assert.equal(restored.settings.strategy2,'none');
 assert.equal(restored.settings.strategy3,'none');
});
for(const durationMs of [30000,60000]){
 test('single automatic owner never double-fires during '+durationMs/1000+'-second hold',()=>{
  let prior=null,signals=0;
  for(let i=60;i<quotes.length;i++){
   const q=quotes[i],source=quotes.slice(0,i+1);
   const candidate=analyzeNowOpportunity({
    quoteHistory:source,price:q.price,quoteAt:q.ts,now:q.ts,
    durationMs,engineId:'automatic',qualityPolicy:'regime-verification'
   });
   const current=advanceNowOpportunity({
    previous:prior,candidate,now:q.ts,quoteAt:q.ts,asset:'EUR/USD',
    engineId:'automatic',durationMs
   });
   if(current.phase==='fired'&&current.entryTriggeredAt!==prior?.entryTriggeredAt)signals++;
   if(prior?.phase==='fired'&&q.ts<prior.exitAt){
    assert.equal(current.side,prior.side);
    assert.equal(current.entryTriggeredAt,prior.entryTriggeredAt);
   }
   prior=current;
  }
  assert.ok(signals>0,'quality review must not disable all trend entries');
 });
}
test('published engines remain unchanged until this experimental branch is separately promoted',()=>{
 const source=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(source,/single-automatic-owner/);
 assert.match(source,/Automático Sentinel · único motor/);
 const runtimeSource=readFileSync('sentinel-trading-lab/agent/src/core/runtime.mjs','utf8');
 assert.match(runtimeSource,/qualityPolicy:'regime-verification'/);
});
