import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
const T=Date.UTC(2026,9,15,12);
const quotes=(kind,n=240)=>Array.from({length:n},(_,i)=>({
 ts:T+i*1000,receivedAt:T+i*1000,
 price:1.2*Math.exp(kind==='trend'?i*.000014+.000004*Math.sin(i*.31):
 .00062*Math.sin(i*2*Math.PI/48))
}));
for(const durationMs of [30000,60000]){
 test('combined owner agrees with automatic and specialist at '+durationMs/1000+'s',()=>{
  for(const kind of ['trend','range']){
   const data=quotes(kind);
   let released=0,blocked=0,previous=null;
   for(let i=60;i<data.length;i++){
    const q=data[i],input={quoteHistory:data.slice(0,i+1),price:q.price,quoteAt:q.ts,now:q.ts,durationMs};
    const primary=analyzeNowOpportunity({...input,engineId:'automatic'});
    const trial=analyzeNowOpportunity({...input,engineId:'automatic_trend_support'});
    if(trial.ready){
     assert.equal(primary.ready,true);
     assert.equal(trial.side,primary.side);
     const expected=primary.regime==='observed-range-turn'?'support_resistance':'trend';
     const specialist=analyzeNowOpportunity({...input,engineId:expected});
     assert.equal(specialist.ready,true);
     assert.equal(specialist.side,trial.side);
     released++;
    }else if(primary.ready)blocked++;
    const next=advanceNowOpportunity({previous,candidate:trial,now:q.ts,quoteAt:q.ts,
      durationMs,asset:'EUR/USD',engineId:'automatic_trend_support'});
    if(previous?.phase==='fired'&&q.ts<previous.exitAt){
      assert.equal(next.phase,'fired');
      assert.equal(next.side,previous.side);
      assert.equal(next.entryTriggeredAt,previous.entryTriggeredAt);
      assert.equal(next.entryReadyNow,false);
    }
    previous=next;
   }
   if(kind==='trend')assert.ok(released>0,'the combined mode cannot permanently block a clean trend');
  }
 });
}
test('future ticks, stale quotes and mismatched prices cannot create combined signals',()=>{
 const data=quotes('trend'),q=data.at(-1);
 const input={quoteHistory:data,price:q.price,quoteAt:q.ts,now:q.ts,durationMs:30000,
  engineId:'automatic_trend_support'};
 const baseline=analyzeNowOpportunity(input);
 assert.equal(analyzeNowOpportunity({...input,quoteHistory:[...data,
  {ts:q.ts+1000,receivedAt:q.ts+1000,price:999}]}).ready,baseline.ready);
 assert.equal(analyzeNowOpportunity({...input,now:q.ts+3000}).ready,false);
 assert.equal(analyzeNowOpportunity({...input,price:777}).ready,false);
});
test('now-mode UI exposes only automatic and automatic combined to new selection',()=>{
 const catalog=SCENARIO_ENGINES.find(x=>x.id==='automatic_trend_support');
 assert.ok(catalog);
 const source=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(source,/\['automatic','automatic_trend_support'\]\.includes\(e\.id\)/);
 assert.match(source,/Estratégia antiga/);
});
