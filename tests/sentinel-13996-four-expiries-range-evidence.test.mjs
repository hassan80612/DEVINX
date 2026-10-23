import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessRangeExpiryEvidence} from
 '../sentinel-trading-lab/agent/src/core/range-expiry-evidence.mjs';
import {completedRangeStructure} from
 '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const now=1800000000000+2100000;
const expiries=[30000,60000,120000,300000];
const sine=(period=47,phase=12)=>{
 const points=Array.from({length:2101},(_,i)=>({
  ts:now-2100000+i*1000,receivedAt:now-2100000+i*1000,
  price:1+.0005*Math.sin((i+phase)*2*Math.PI/period)+.0000005*Math.sin(i*.9)
 }));
 return points;
};
const run=(quoteHistory,durationMs)=>{
 const recent=quoteHistory.filter(q=>q.ts>=now-300000),older=quoteHistory.filter((q,i)=>i%2===0);
 return completedRangeStructure(recent,now,.000025,quoteHistory.at(-1).price,durationMs,older);
};
test('base can qualify independently observed outcomes for all FOUR expiries',()=>{
 const history=sine();
 for(const expiry of expiries){
  const result=run(history,expiry);
  assert.equal(result?.ready,true,String(expiry));
  assert.equal(result?.reason,'observed-range-expiry-analogue');
  assert.ok(['CALL','PUT'].includes(result.side));
  assert.equal(result.observedExpirySeconds,expiry/1000);
  assert.ok(result.expiryEvidenceCount>=4);
 }
});
test('recovery and continuation are distinct classes; neither implies a guarantee',()=>{
 const cases=[];
 for(let phase=0;phase<47;phase+=2){
  const history=sine(47,phase);
  const verdict=run(history,30000);
  if(verdict?.reason==='observed-range-expiry-analogue')cases.push(verdict.phase);
 }
 assert.ok(cases.includes('continuation'));
 assert.ok(cases.includes('recovery'));
});
test('5s 10s 15s remain unaffected by longer-expiry analogue',()=>{
 const history=sine(),recent=history.slice(-301);
 for(const expiry of [5000,10000,15000]){
  const before=completedRangeStructure(recent,now,.000025,recent.at(-1).price,expiry);
  const after=run(history,expiry);
  assert.deepEqual(after,before,String(expiry));
 }
});
test('confirmed range reversals stay ahead of any new range analogue',()=>{
 const q=Array.from({length:181},(_,i)=>({
  ts:now-180000+i*1000,receivedAt:now-180000+i*1000,
  price:1+.00055*Math.sin((i+12)*Math.PI*2/30)+.000006*Math.sin(i*1.4)
 }));
 const before=completedRangeStructure(q,now,.000028,q.at(-1).price,30000);
 const after=completedRangeStructure(q,now,.000028,q.at(-1).price,30000,sine());
 assert.equal(before?.reason,'closed-range-extreme-reversal-confirmed');
 assert.deepEqual(after,before);
});
test('real expiry evidence cannot come from fewer than 4 non-overlapping completed periods',()=>{
 const history=sine().slice(-300);
 const n=assessRangeExpiryEvidence({quotes:history,now,
   spot:history.at(-1).price,holdingMs:300000,noise:.000025,
   lower:Math.log(.99945),upper:Math.log(1.00055),regular:true});
 assert.equal(n,null);
});
test('future timestamps and late arrivals cannot alter any of the four decisions',()=>{
 const history=sine();
 for(const expiry of expiries){
  const args={quotes:history,now,spot:history.at(-1).price,holdingMs:expiry,
   noise:.000025,lower:Math.log(.99945),upper:Math.log(1.00055),regular:true};
  const clean=assessRangeExpiryEvidence(args);
  const extra=[{ts:now+1000,receivedAt:now+1000,price:.2},
    {ts:now-2000,receivedAt:now+1000,price:2}];
  assert.deepEqual(assessRangeExpiryEvidence({...args,quotes:[...history,...extra]}),clean);
 }
});
test('separate compact buffer does not replace 300-second live broker feed',()=>{
 const runtime=readFileSync(new URL(
  '../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(runtime,/lastReceivedQuoteAt-300000/);
 assert.match(runtime,/rangeExpiryQuoteCache/);
 assert.match(runtime,/Math\.floor\(ts\/2000\)/);
 assert.match(runtime,/const rangeQuoteHistory=this\.rangeExpiryQuoteCache/);
 const core=readFileSync(new URL(
  '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(core,/const input=\{quoteHistory,price,quoteAt,now,durationMs,rangeQuoteHistory\};/);
 assert.doesNotMatch(assessRangeExpiryEvidence.toString(),/await\b|fetch\(|setInterval\(|setTimeout\(|page\.click/);
});
