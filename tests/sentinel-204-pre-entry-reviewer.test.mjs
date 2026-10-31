import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {evaluatePreEntryRisk,reviewPreEntryRisk} from '../sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-204-recorded-review.json',import.meta.url)));
const cases=JSON.parse(gunzipSync(Buffer.from(fixture.payload,'base64')));
const totals={};
test('204: production reviewer exactly reproduces all 104 settled recorded entry decisions',()=>{
 for(const row of cases){
  const review=evaluatePreEntryRisk(row.input);
  assert.deepEqual(review.reasons,row.expectedReasons,row.session+' #'+row.index);
  const tally=totals[row.session]??={win:0,loss:0,tie:0};
  if(!review.blocked)tally[row.result]++;
 }
 assert.deepEqual(totals['13.9.202'],{win:18,loss:12,tie:1});
 assert.deepEqual(totals['13.9.197'],{win:6,loss:3,tie:0});
 assert.deepEqual(totals['13.9.199'],{win:6,loss:10,tie:0});
 assert.deepEqual(totals['13.9.196'],{win:6,loss:11,tie:1});
});
test('204: no future quote/candle can affect the entry veto',()=>{
 for(const {input} of cases){
  const expected=evaluatePreEntryRisk(input);
  const future=input.now+60000;
  assert.deepEqual(evaluatePreEntryRisk({...input,
   quoteHistory:[...input.quoteHistory,{ts:future,receivedAt:future,price:input.price*2}],
   candles:[...input.candles,{from:future/1000,to:(future+60000)/1000,open:1,high:2,low:.5,close:1.5,receivedAt:future}]
  }),expected);
 }
});
test('204: 30s/5m candidates, waiting states and stale/mismatched observations remain owned by existing guards',()=>{
 const input=cases.find(r=>r.expectedReasons.length).input;
 const candidate={ready:true,side:input.side,reason:input.reason,observedAt:input.quoteAt,entryPrice:input.price};
 assert.equal(reviewPreEntryRisk({...input,candidate,durationMs:300000}),candidate);
 assert.equal(reviewPreEntryRisk({...input,candidate,durationMs:30000}),candidate);
 const waiting={...candidate,ready:false};assert.equal(reviewPreEntryRisk({...input,candidate:waiting}),waiting);
 const mismatched={...candidate,entryPrice:input.price+.01};assert.equal(reviewPreEntryRisk({...input,candidate:mismatched}),mismatched);
 assert.equal(reviewPreEntryRisk({...input,candidate,now:input.quoteAt+1951}),candidate);
});
test('204: a real breakout beyond the far edge is preserved; inside the same opposing zone is rejected',()=>{
 const at=1800000000000,zone={low:100,high:100.02,level:100.01,resistancePivots:2,resistanceRejections:3,supportPivots:0,supportRejections:0};
 const structure={asOf:at-60000,atr:.1,tolerance:.01,candleLevelMap:{asOf:at-60000,observedCandles:100,levels:[zone]}};
 const input=price=>({candidate:{ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',observedAt:at,entryPrice:price},price,quoteAt:at,now:at,durationMs:60000,structure,quoteHistory:Array.from({length:25},(_,i)=>({ts:at-(24-i)*1000,receivedAt:at-(24-i)*1000,price:price-(24-i)*.0001}))});
 const inside=input(100.01),rejected=reviewPreEntryRisk(inside);
 assert.equal(rejected.ready,false);assert.equal(rejected.side,null);assert.equal(rejected.provisionalSide,'CALL');
 const crossed=input(100.04);assert.equal(reviewPreEntryRisk(crossed),crossed.candidate);
});
test('204: runtime attaches the reviewer after closed-price admission and before the immutable one-shot entry',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.ok(source.indexOf('eligible=reviewPreEntryRisk(')>source.indexOf('eligible=reviewPreviousClosedCandlePrice('));
 assert.ok(source.indexOf('eligible=reviewPreEntryRisk(')<source.indexOf('let next=advanceNowOpportunity('));
});
