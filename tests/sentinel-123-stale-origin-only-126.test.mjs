import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyObservedLevelSequence,observedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const make=(vertices,spacingMs=500,mirror=false)=>{
 const rows=[];
 for(let k=0;k<vertices.length-1;k++){
  for(let i=0;i<10;i++)
   rows.push({ts:T+rows.length*spacingMs,price:vertices[k]+(vertices[k+1]-vertices[k])*i/10});
 }
 rows.push({ts:T+rows.length*spacingMs,price:vertices.at(-1)});
 if(mirror)for(const q of rows)q.price=200-q.price;
 return rows;
};
const z=p=>({low:p,high:p,level:p,confirmedPivots:2,independentTests:3,tests:[{age:1},{age:3},{age:5}],windows:[3,10,20,50,100]});
const baseRows=mirror=>make([102,100.4,100.9,99,100,99.7,98.6],500,mirror);
const input=(rows,mirror=false)=>({quoteHistory:rows,quoteAt:rows.at(-1).ts,now:rows.at(-1).ts,price:rows.at(-1).price,
 map:{observedCandles:100,asOf:T-60000,tolerance:.15,levels:[z(mirror?100:100)],windows:[]}});
test('13.9.123 BASE is retained: a current break/retest is immediately eligible both CALL and PUT',()=>{
 for(const mirror of [false,true])for(const ms of [5000,10000,15000,30000,60000,120000,300000]){
  const rows=baseRows(mirror),a=input(rows,mirror);
  const event=observedLevelSequence(a).structureChange;
  assert.equal(event?.kind,'break-retest-continuation');
  assert.equal(event.confirmedAt,a.quoteAt);
  const candidate={ready:true,side:mirror?'PUT':'CALL',observedAt:a.quoteAt,entryPrice:a.price,reason:'baseline-direction'};
  const out=applyObservedLevelSequence({candidate,...a,durationMs:ms});
  assert.equal(out.ready,true);assert.equal(out.side,mirror?'CALL':'PUT');
 }
});
test('old continuation is never stamped NEW from flat or backward price action',()=>{
 for(const mirror of [false,true]){
  const rows=baseRows(mirror);
  const first=observedLevelSequence(input(rows,mirror)).structureChange;
  const last=rows.at(-1);
  const aged=[...rows,...Array.from({length:12},(_,i)=>({ts:last.ts+500*(i+1),price:last.price}))];
  const older=observedLevelSequence(input(aged,mirror)).structureChange;
  assert.equal(older?.confirmedAt,first.confirmedAt,'market structure still visible at ORIGINAL proof timestamp');
  const baseline={ready:true,side:mirror?'CALL':'PUT',reason:'independent-current-setup',observedAt:aged.at(-1).ts,entryPrice:aged.at(-1).price};
  const out=applyObservedLevelSequence({candidate:baseline,...input(aged,mirror),durationMs:60000});
  assert.equal(out.side,baseline.side);
  assert.equal(out.reason,baseline.reason);
  assert.equal(out.observedAt,baseline.observedAt);
  const waiting=applyObservedLevelSequence({candidate:{ready:false,side:null},...input(aged,mirror),durationMs:60000});
  assert.equal(waiting.ready,false);
 }
});
test('actual NEW expansion beyond the retest keeps continuation eligibility immediately',()=>{
 for(const mirror of [false,true]){
  const rows=baseRows(mirror),last=rows.at(-1),sign=mirror?1:-1;
  const expanded=[...rows,{ts:last.ts+500,price:last.price+sign*.1},{ts:last.ts+1000,price:last.price+sign*.22}];
  const a=input(expanded,mirror),event=observedLevelSequence(a).structureChange;
  assert.equal(event?.confirmedAt,a.quoteAt);
  assert.equal(event?.side,mirror?'CALL':'PUT');
 }
});
test('unchanged confirmed reversals do not require an extra candle or clock wait',()=>{
 const rows=make([102,100.6,101.3,99.4,100.2,99.9,101.8]);
 const a=input(rows),e=observedLevelSequence(a).structureChange;
 assert.equal(e?.kind,'failed-breakout-structure-change');
 const outcome=applyObservedLevelSequence({candidate:{ready:false,side:null},...a,durationMs:60000});
 assert.equal(outcome.ready,true);assert.equal(outcome.side,'CALL');
});
test('no change to expiry lock or broker controls',()=>{
 const rows=baseRows(false),a=input(rows),signal=applyObservedLevelSequence({candidate:{ready:true,side:'CALL'},...a,durationMs:30000});
 const opened=advanceNowOpportunity({candidate:signal,now:a.now,quoteAt:a.quoteAt,asset:'EUR/USD OTC',durationMs:30000});
 assert.equal(opened.side,'PUT');
 const later=advanceNowOpportunity({previous:opened,candidate:{...signal,side:'CALL',observedAt:a.now+1000},now:a.now+1000,quoteAt:a.now+1000,asset:'EUR/USD OTC',durationMs:30000});
 assert.equal(later.side,'PUT');assert.equal(later.entryReadyNow,false);
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/setTimeout\s*\(|setInterval\s*\(|\bawait\b|page\.evaluate\s*\(/);
});
