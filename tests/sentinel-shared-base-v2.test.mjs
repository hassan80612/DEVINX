import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedMarketBase} from '../sentinel-trading-lab/agent/src/core/shared-market-base.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=Date.UTC(2026,9,15,12);
const known=(kind,n=130)=>{let p=1.101;return Array.from({length:n},(_,i)=>{const v=
 kind==='up'?.000018:kind==='down'?-.000018:
 kind==='turn-up'?(i<103?-.000025:.00018):
 kind==='turn-down'?(i<103?.000025:-.00018):
 .000035*Math.sin(i*.4);
 p*=Math.exp(v);return {ts:T+i*1000,receivedAt:T+i*1000,price:p};});};
for(const durationMs of [30000,60000]){
 test('one shared direction for all selected strategies at '+durationMs/1000+'s',()=>{
  const q=known('turn-up'),at=q.at(-1),data={quoteHistory:q,quoteAt:at.ts,price:at.price,now:at.ts,durationMs};
  const shared=sharedMarketBase({...data,selectedStrategy:'automatic'});
  for(const engineId of ['automatic','trend','support_resistance','mean_reversion','smart_confluence','price_action','breakout']){
   const proposal=analyzeNowOpportunity({...data,engineId,qualityPolicy:'shared-base-v2'});
   assert.equal(proposal.side,analyzeNowOpportunity({...data,engineId:'automatic',qualityPolicy:'shared-base-v2'}).side);
   assert.equal(proposal.engineId,engineId);
   assert.equal(proposal.signalOwner,'shared-market-base');
   assert.equal(proposal.observedAt,at.ts);
  }
  assert.equal(shared.side,'CALL');
 });
 test('fired entries are immutable through '+durationMs/1000+'s',()=>{
  const rows=known('turn-down',220);let state=null,count=0;
  for(let i=60;i<rows.length;i++){
   const q=rows[i];const proposal=analyzeNowOpportunity({quoteHistory:rows.slice(0,i+1),quoteAt:q.ts,price:q.price,now:q.ts,durationMs,qualityPolicy:'shared-base-v2'});
   const next=advanceNowOpportunity({previous:state,candidate:proposal,now:q.ts,quoteAt:q.ts,asset:'EUR/USD',engineId:'automatic',durationMs});
   if(next?.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt)count++;
   if(state?.phase==='fired'&&q.ts<state.exitAt){assert.equal(next.side,state.side);assert.equal(next.entryTriggeredAt,state.entryTriggeredAt)}
   state=next;
  }
  assert.ok(count>0);
 });
}
test('no future quotes or delayed arrivals influence direction',()=>{
 const q=known('turn-up'),last=q.at(-1),args={quoteHistory:q,quoteAt:last.ts,price:last.price,now:last.ts,durationMs:30000};
 const expected=sharedMarketBase(args);
 const actual=sharedMarketBase({...args,quoteHistory:[...q,{ts:last.ts+1000,receivedAt:last.ts+1000,price:5},
  {ts:last.ts-1000,receivedAt:last.ts+5000,price:5}]});
 assert.deepEqual(actual,expected);
});
test('original production mode remains bytewise decision-equivalent',()=>{
 for(const k of ['up','down','turn-up','turn-down']){
  const q=known(k),last=q.at(-1),args={quoteHistory:q,quoteAt:last.ts,price:last.price,now:last.ts,durationMs:30000,engineId:'automatic'};
  assert.deepEqual(analyzeNowOpportunity(args),analyzeNowOpportunity({...args,qualityPolicy:'baseline'}));
 }
});
