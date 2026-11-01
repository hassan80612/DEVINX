import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateLateBreakoutTransition,reviewLateBreakoutTransition} from '../sentinel-trading-lab/agent/src/core/late-breakout-transition-review.mjs';
const read = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blob = s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const T=1800000037000;
const make=({side='CALL',second=37,five=5,minute=-12,reason='historical-level-breakout',
 durationMs=60000,nowLag=0}={})=>{
 const at=T+(second-37)*1000,price=1.2,sign=side==='CALL'?1:-1;
 const history=Array.from({length:61},(_,i)=>{
  const age=60-i,move=age>=5?minute+(five-minute)*(60-age)/55:five*(age/5);
  return {ts:at-age*1000,receivedAt:at-age*1000,price:price-sign*move*.00001};
 });
 history[60].price=price;
 const candidate={ready:true,side,reason,observedAt:at,entryPrice:price};
 return {candidate,quoteAt:at,now:at+nowLag,price,durationMs,quoteHistory:history};
};
test('212: four-like late historical breakouts against the previous minute are vetoed, CALL and PUT symmetric',()=>{
 for(const side of ['CALL','PUT']){
  for(const second of [33,46,51,58]){
   const input=make({side,second,five:3,minute:-13}),copy=structuredClone(input);
   const out=reviewLateBreakoutTransition(input);
   assert.equal(out.ready,false,side+'/'+second);
   assert.equal(out.side,null);
   assert.equal(out.provisionalSide,side);
   assert.equal(out.entryRisk.kind,'late-breakout-transition');
   assert.deepEqual(input,copy,'review must never mutate input');
  }
 }
});
test('212: preserve genuine 207 late breakout supported by last minute and all early opportunities',()=>{
 for(const side of ['CALL','PUT']){
  for(const second of [30,38,47,59]){
   const supported=make({side,second,five:5,minute:15});
   assert.strictEqual(reviewLateBreakoutTransition(supported),supported.candidate);
  }
  for(const second of [0,12,22,29]){
   const early=make({side,second,five:5,minute:-12});
   assert.strictEqual(reviewLateBreakoutTransition(early),early.candidate);
  }
 }
});
test('212: scope is ONLY 1m historical breakout; structural reversals/continuation/5m/30s remain unchanged',()=>{
 for(const durationMs of [30000,300000]){
  const input=make({durationMs});
  assert.strictEqual(reviewLateBreakoutTransition(input),input.candidate);
 }
 for(const reason of ['confirmed-level-structure-reversal','confirmed-fast-level-reversal',
   'failed-breakout-structure-change','closed-structure-and-live-impulse',
   'break-retest-continuation','historical-level-rejection']){
  const input=make({reason});
  assert.strictEqual(reviewLateBreakoutTransition(input),input.candidate,reason);
 }
 const notReady=make();notReady.candidate.ready=false;
 assert.strictEqual(reviewLateBreakoutTransition(notReady),notReady.candidate);
});
test('212: no future quote, unreceived quote or stale decision can cause a veto',()=>{
 const x=make(),baseline=evaluateLateBreakoutTransition(x);
 const future={...x,quoteHistory:[...x.quoteHistory,{ts:x.quoteAt+1000,receivedAt:x.now+1000,price:9}]};
 assert.deepEqual(evaluateLateBreakoutTransition(future),baseline);
 const unreceived={...x,quoteHistory:x.quoteHistory.map(q=>({...q,receivedAt:x.now+4000}))};
 assert.strictEqual(reviewLateBreakoutTransition(unreceived),x.candidate);
 const missing={...x,quoteHistory:x.quoteHistory.slice(-20)};
 assert.strictEqual(reviewLateBreakoutTransition(missing),x.candidate);
 const stale=make({nowLag:1951});
 assert.strictEqual(reviewLateBreakoutTransition(stale),stale.candidate);
 const mismatch={...x,candidate:{...x.candidate,entryPrice:x.price+.001}};
 assert.strictEqual(reviewLateBreakoutTransition(mismatch),mismatch.candidate);
});
test('212: no blanket late-second cutoff; no timers or broker control, only pre-click review',()=>{
 const r=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
 const module=read('sentinel-trading-lab/agent/src/core/late-breakout-transition-review.mjs');
 assert.ok(r.indexOf('eligible=reviewLateBreakoutTransition(')>r.indexOf('eligible=reviewDistinctOpportunity('));
 assert.ok(r.indexOf('eligible=reviewLateBreakoutTransition(')<r.indexOf('let next=advanceNowOpportunity('));
 assert.doesNotMatch(module,/setTimeout|setInterval|orderDurationMs\s*=|\.click\(|waitFor|brokerNative/);
 for(const [p,sha] of [
  ['sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs','be2aa95874922b94564400979aad4dedd1d61485'],
  ['sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs','a59968654723e4c8124164844745eee30ef89655'],
  ['sentinel-trading-lab/agent/worker/index.mjs','a376e187ae5d8456ca7500439317727fc9afb861'],
  ['sentinel-trading-lab/src/components/LiveScenarioCard.tsx','c8a71e287acaa552dc871b028e8142c35a81d383']
 ])assert.equal(blob(read(p)),sha,p);
});
