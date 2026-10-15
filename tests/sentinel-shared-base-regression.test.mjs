import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedMarketDirection} from '../sentinel-trading-lab/agent/src/core/shared-market-direction.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=Date.UTC(2026,9,15,12);
const make=(kind,n=130)=>{
 let p=1.1;
 return Array.from({length:n},(_,i)=>{
  let d=kind==='up'?.000025:kind==='down'?-.000025:
   kind==='turn-up'?(i<89?-.000036:.00011):
   kind==='turn-down'?(i<89?.000036:-.00011):
   .000035*Math.sin(i*.4);
  p*=Math.exp(d);
  return {ts:T+i*1000,receivedAt:T+i*1000,price:p};
 });
};
const engines=['automatic','trend','mean_reversion','support_resistance','price_action','smart_confluence','breakout'];
for(const kind of ['up','down','turn-up','turn-down']){
 for(const durationMs of [30000,60000]){
  test('shared base makes identical market-direction judgement with every strategy: '+kind+' '+durationMs,()=>{
   const q=make(kind),last=q.at(-1),base=sharedMarketDirection({
    quoteHistory:q,price:last.price,quoteAt:last.ts,now:last.ts,durationMs
   });
   assert.equal(base.ready,true,kind+' '+JSON.stringify(base));
   for(const engineId of engines){
    const o=analyzeNowOpportunity({quoteHistory:q,price:last.price,quoteAt:last.ts,
     now:last.ts,durationMs,engineId,qualityPolicy:'shared-base-v1'});
    assert.equal(o.side,base.side,engineId);
    assert.equal(o.ready,base.ready,engineId);
    assert.equal(o.signalOwner,'shared-market-base');
    assert.equal(o.contextStrategy,engineId==='automatic'?base.selectedStrategy:engineId);
    assert.equal(o.observedAt,last.ts);
   }
   if(kind==='turn-up')assert.equal(base.side,'CALL');
   if(kind==='turn-down')assert.equal(base.side,'PUT');
  });
 }
}
test('shared base does not consume tomorrow quotes or unreceived prices',()=>{
 const quotes=make('turn-up'),last=quotes.at(-1),args={
  quoteHistory:quotes,price:last.price,quoteAt:last.ts,now:last.ts,durationMs:30000
 };
 const expected=sharedMarketDirection(args);
 const actual=sharedMarketDirection({...args,quoteHistory:[...quotes,
  {ts:last.ts-2000,receivedAt:last.ts+4000,price:last.price+4},
  {ts:last.ts+1000,receivedAt:last.ts+1000,price:last.price+4}]});
 assert.deepEqual(actual,expected);
});
test('one CALL/PUT is immutable until expiry for shared market engine',()=>{
 const q=make('turn-up',220);
 let state=null,signals=0;
 for(const durationMs of [30000,60000]){
  state=null;
  for(let i=40;i<q.length;i++){
   const now=q[i].ts,candidate=analyzeNowOpportunity({
    quoteHistory:q.slice(0,i+1),price:q[i].price,quoteAt:now,
    now,durationMs,engineId:'automatic',qualityPolicy:'shared-base-v1'
   });
   const next=advanceNowOpportunity({previous:state,candidate,now,quoteAt:now,
     durationMs,engineId:'automatic',asset:'EUR/USD'});
   if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt)signals++;
   if(state?.phase==='fired'&&now<state.exitAt){
    assert.equal(next.side,state.side);
    assert.equal(next.entryTriggeredAt,state.entryTriggeredAt);
   }
   state=next;
  }
 }
 assert.ok(signals>0);
});
test('baseline strategy path remains exactly unchanged without experimental flag',()=>{
 const q=make('up'),last=q.at(-1);
 for(const engineId of engines){
  const args={quoteHistory:q,price:last.price,quoteAt:last.ts,now:last.ts,
   durationMs:30000,engineId};
  assert.deepEqual(analyzeNowOpportunity(args),
   analyzeNowOpportunity({...args,qualityPolicy:'baseline'}));
 }
});
