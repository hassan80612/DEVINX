import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {evaluatePreEntryRisk,reviewPreEntryRisk,evaluateOneMinuteAlignment,reviewOneMinuteAlignment} from '../sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs';
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
 const input=price=>({candidate:{ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',observedAt:at,entryPrice:price},price,quoteAt:at,now:at,durationMs:60000,structure,quoteHistory:Array.from({length:80},(_,i)=>({ts:at-(79-i)*1000,receivedAt:at-(79-i)*1000,price:price-(79-i)*.0001}))});
 const inside=input(100.01),rejected=reviewPreEntryRisk(inside);
 assert.equal(rejected.ready,false);assert.equal(rejected.side,null);assert.equal(rejected.provisionalSide,'CALL');
 const crossed=input(100.04);assert.equal(reviewPreEntryRisk(crossed),crossed.candidate);
});
test('204: runtime attaches the reviewer after closed-price admission and before the immutable one-shot entry',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.ok(source.indexOf('eligible=reviewPreEntryRisk(')>source.indexOf('eligible=reviewPreviousClosedCandlePrice('));
 assert.ok(source.indexOf('eligible=reviewPreEntryRisk(')<source.indexOf('let next=advanceNowOpportunity('));
});

const ALIGNMENT_MINUTE=1800000000000; // Exact minute boundary.
function oneMinuteCase({side='CALL',second=12,five=1,sixty=2,count=70}={}){
 const quoteAt=ALIGNMENT_MINUTE+second*1000,price=100,sign=side==='CALL'?1:-1;
 const quoteHistory=Array.from({length:count+1},(_,index)=>{
  const age=count-index,move=age>=60?sixty:age>=5?five:0;
  return {ts:quoteAt-age*1000,receivedAt:quoteAt-age*1000,price:price-sign*move};
 });
 const candidate={ready:true,side,reason:'closed-structure-and-live-impulse',observedAt:quoteAt,entryPrice:price};
 return {candidate,quoteAt,now:quoteAt,price,durationMs:60000,quoteHistory};
}
test('208: 1m confirmation uses early candle and both 5s/60s directional movements',()=>{
 for(const side of ['CALL','PUT']){
  for(const second of [0,1,12,29]){
   const input=oneMinuteCase({side,second});
   assert.equal(evaluateOneMinuteAlignment(input).blocked,false,side+' '+second);
   assert.equal(reviewOneMinuteAlignment(input),input.candidate);
  }
  for(const second of [30,35,59]){
   const input=oneMinuteCase({side,second}),review=evaluateOneMinuteAlignment(input);
   assert.deepEqual(review.reasons,['one-minute-late-in-candle']);
   const rejected=reviewOneMinuteAlignment(input);
   assert.equal(rejected.ready,false);assert.equal(rejected.side,null);
   assert.equal(rejected.provisionalSide,side);
  }
  for(const values of [{five:0},{sixty:0},{five:-1},{sixty:-1}]){
   const input=oneMinuteCase({side,...values}),unchanged=structuredClone(input);
   assert.deepEqual(evaluateOneMinuteAlignment(input).reasons,['one-minute-directional-momentum-not-aligned']);
   assert.deepEqual(input,unchanged,'read only '+side);
  }
 }
});
test('208: 30s and 5m, unready candidates and nonmatching confirmed quotes remain unchanged',()=>{
 const input=oneMinuteCase({side:'PUT',second:55,five:-1,sixty:-2});
 for(const durationMs of [30000,300000]){
  const candidate={...input.candidate};
  assert.equal(reviewOneMinuteAlignment({...input,candidate,durationMs}),candidate);
 }
 for(const candidate of [{...input.candidate,ready:false},{...input.candidate,entryPrice:99},{...input.candidate,observedAt:input.quoteAt-1000}]){
  assert.equal(reviewOneMinuteAlignment({...input,candidate}),candidate);
 }
 const stale={...input,now:input.quoteAt+1951};
 assert.equal(reviewOneMinuteAlignment(stale),input.candidate);
});
test('208: incomplete history does not replace 207 admissions and future quotes cannot prove alignment',()=>{
 const base=oneMinuteCase();
 for(const count of [0,4,5,58,59]){
  const input=oneMinuteCase({count});
  const result=evaluateOneMinuteAlignment(input);
  assert.equal(result.blocked,false,'defer to existing 207 rules until full 60s history '+count);
 }
 const later={...base,quoteHistory:[...base.quoteHistory,
  {ts:base.quoteAt+1000,receivedAt:base.quoteAt+1000,price:1e9}]};
 assert.deepEqual(evaluateOneMinuteAlignment(later),evaluateOneMinuteAlignment(base));
 const unreceived={...base,quoteHistory:base.quoteHistory.map(q=>({...q,receivedAt:base.now+1000}))};
 assert.equal(evaluateOneMinuteAlignment(unreceived).blocked,false);
});
test('208: the production review only vetoes a real, otherwise eligible 1m signal',()=>{
 const original=oneMinuteCase({second:37});
 const blocked=reviewPreEntryRisk(original);
 assert.equal(blocked.ready,false);
 assert.equal(blocked.side,null);
 assert.equal(blocked.entryRisk?.kind,'one-minute-causal-alignment');
 const other=oneMinuteCase({second:37});
 const pass=reviewPreEntryRisk({...other,durationMs:300000});
 assert.equal(pass,other.candidate);
});

test('208: previously confirmed 207 reversals remain eligible after second 30',()=>{
 for(const reason of ['confirmed-fast-level-reversal','failed-breakout-structure-change','confirmed-level-structure-reversal','multiscale-candle-rejection']){
  const input=oneMinuteCase({second:44,five:-1,sixty:-2});
  const candidate={...input.candidate,reason};
  assert.equal(evaluateOneMinuteAlignment({...input,candidate}).blocked,false,reason);
  assert.equal(reviewOneMinuteAlignment({...input,candidate}),candidate,reason);
 }
});
