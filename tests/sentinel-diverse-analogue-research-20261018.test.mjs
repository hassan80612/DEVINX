import test from 'node:test';
import assert from 'node:assert/strict';
import {diverseAnalogueResearchRuntime} from '../experiments/diverse-analogue-research-runtime-20261018.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const candidate=await diverseAnalogueResearchRuntime();
test.after(()=>candidate.cleanup());
const T=Date.UTC(2026,9,18,15);
const path=Array.from({length:181},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,
 price:Math.exp(Math.log(1.1)+i*.000003+.0000002*Math.sin(i*2*Math.PI/36))}));
const q=path.at(-1),input={quoteHistory:path,price:q.price,quoteAt:q.ts,now:q.ts,durationMs:30000};
test('distinct completed examples cannot count the same 30s outcome interval twice',()=>{
 const result=candidate.causalPatternDirection(input);
 assert.equal(result.ready,true);
 assert.equal(result.side,'CALL');
 assert.ok(result.selected>=3);
 for(const [i,a] of result.researchExamples.entries()){
  assert.ok(a.at+30000<=q.ts);
  for(const b of result.researchExamples.slice(i+1))assert.ok(Math.abs(a.at-b.at)>=30000);
 }
});
test('future ticks and unreceived historical quotes cannot improve the candidate evidence',()=>{
 const expected=candidate.causalPatternDirection(input);
 const actual=candidate.causalPatternDirection({...input,quoteHistory:[...path,
  {ts:q.ts+1000,receivedAt:q.ts+1000,price:50},
  {ts:q.ts-750,receivedAt:q.ts+1000,price:50}]});
 assert.deepEqual(actual,expected);
});
test('inverse log-price trajectories give symmetric opposite sides',()=>{
 const mirrored=path.map(q=>({...q,price:1.1*1.1/q.price})),last=mirrored.at(-1);
 const actual=candidate.causalPatternDirection({...input,quoteHistory:mirrored,price:last.price});
 assert.equal(actual.side,'PUT');
 assert.equal(actual.selected,candidate.causalPatternDirection(input).selected);
});
test('insufficient distinct examples abstain immediately and do not remove the original structural route',()=>{
 const history=path.slice(-130),last=history.at(-1),args={...input,quoteHistory:history,price:last.price};
 assert.equal(candidate.causalPatternDirection(args).ready,false);
 // This independently verifies that the released fallback already has a
 // current directional setup; rejecting analogue votes does not need a timer.
 assert.equal(analyzeNowOpportunity({...args,engineId:'automatic'}).ready,true);
});
