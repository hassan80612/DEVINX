import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {models,replay,matchedEntries} from '../research/base-direction-study.mjs';
const rows=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
const inputAt=i=>({quoteHistory:rows.slice(0,i+1),price:rows[i].price,quoteAt:rows[i].ts,now:rows[i].ts,
 engineId:'automatic',durationMs:30000,qualityPolicy:'adaptive-market-v17'});
test('six-decimal video data preserves observation gaps and one audited OCR correction',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
 assert.equal(rows.length,1065);assert.equal(f.samplingMs,500);
 assert.ok(rows.every((q,i)=>!i||q.ts>rows[i-1].ts));
 assert.ok(rows.some((q,i)=>i&&q.ts-rows[i-1].ts>1000));
 assert.equal(rows.find(q=>q.frame===1091).price,.842785);
 assert.match(f.limitations.join(' '),/not independent out-of-sample/);
});
test('all research hypotheses ignore later prices and late-arriving historical observations',()=>{
 for(const index of [400,650,950]){
  const input=inputAt(index);
  for(const [name,predict]of Object.entries(models)){
   const expected=predict(input);
   const polluted={...input,quoteHistory:[...rows,{ts:input.now-100,receivedAt:input.now+1000,price:99}]};
   assert.deepEqual(predict(polluted),expected,name);
  }
 }
});
test('same-input model replay preserves non-overlapping 30s lifecycles without hidden extra timers',()=>{
 const reports=replay(rows,{modelNames:['published','contextual_neighbours','contextual_ridge','independent_outcomes','fast_slow_flow']});
 for(const [name,r]of Object.entries(reports)){
  assert.equal(r.signals,r.wins+r.losses+r.ties+r.unknown,name);
  for(let i=1;i<r.entries.length;i++)assert.ok(r.entries[i].at-r.entries[i-1].at>=30000,name);
 }
});
test('matched comparison uses exactly the published entry times and counts abstentions separately',()=>{
 const r=replay(rows,{modelNames:['published']}),entries=r.published.entries;
 const matched=matchedEntries(rows,entries);
 for(const [name,r]of Object.entries(matched)){
  assert.deepEqual(r.decisions.map(x=>x.at),entries.map(x=>x.at),name);
  assert.equal(r.wins+r.losses+r.ties+r.unknown+r.abstained,entries.length,name);
 }
});
test('rolling-clock experiment removes dependence on an arbitrary wall-clock origin',()=>{
 const input=inputAt(950),expected=models.rolling_clock(input);
 for(const shiftMs of [-1000,-500,500,1000]){
  const shifted={...input,now:input.now+shiftMs,quoteAt:input.quoteAt+shiftMs,
   quoteHistory:input.quoteHistory.map(q=>({...q,ts:q.ts+shiftMs,receivedAt:q.receivedAt+shiftMs}))};
  const value=models.rolling_clock(shifted);
  assert.equal(value.ready,expected.ready);assert.equal(value.side,expected.side);
  assert.equal(value.reason,expected.reason);
 }
});
