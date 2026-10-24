import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {observedLevelContestRisk as adjudicate} from '../sentinel-trading-lab/agent/src/core/observed-level-contest-risk.mjs';

const T=1800000000000;
const resistance={low:1.10098,high:1.10102,level:1.101,confirmedPivots:2,
 independentRejections:1,resistanceWick:.8,supportWick:.1};
const prices=[1.10060,1.10064,1.10070,1.10080,1.10094,1.100985,1.100965,1.10092,1.10088];
const history=x=>x.map((price,i)=>({ts:T-(x.length-1-i)*1000,
 receivedAt:T-(x.length-1-i)*1000,price}));
function inputs(x=prices,side='CALL',zone=resistance,reason='historical-level-breakout'){
 const quoteHistory=history(x),price=x.at(-1);
 return {candidate:{ready:true,side,reason,observedAt:T,entryPrice:price},
  structure:{tolerance:.00005,candleLevelMap:{observedCandles:60,asOf:T-1000,
    levels:[zone]}},quoteHistory,price,quoteAt:T,now:T};
}
test('observed retreat from independently rejected resistance catches late CALL',()=>{
 const a=adjudicate(inputs());
 assert.equal(a?.kind,'observed-level-rejection-against-entry');
 assert.equal(a.level,resistance.level);
 assert.ok(a.approach>0);assert.ok(a.retreat>0);
});
test('mirror support catches late PUT symmetrically; no direction flip is invented',()=>{
 const mirrored=prices.map(p=>2.2-p);
 const zone={low:2.2-resistance.high,high:2.2-resistance.low,
  level:2.2-resistance.level,confirmedPivots:2,independentRejections:1,
  resistanceWick:.1,supportWick:.8};
 const a=adjudicate(inputs(mirrored,'PUT',zone,'historical-level-rejection'));
 assert.equal(a?.kind,'observed-level-rejection-against-entry');
});
test('a genuine upward OR downward breakout through the entire zone still passes',()=>{
 const above=[1.10060,1.1007,1.1008,1.1009,1.10097,1.101035,1.10108,1.10112,1.10116];
 assert.equal(adjudicate(inputs(above)),null);
 const mirrored=above.map(p=>2.2-p);
 const support={low:2.2-resistance.high,high:2.2-resistance.low,
  level:2.2-resistance.level,confirmedPivots:2,independentRejections:1,
  resistanceWick:0,supportWick:.8};
 assert.equal(adjudicate(inputs(mirrored,'PUT',support)),null);
});
test('proximity only, fast trend, or an unconfirmed single touch never blocks',()=>{
 const steady=[1.10060,1.10065,1.1007,1.10076,1.10081,1.10085,1.10089,1.10092,1.10095];
 assert.equal(adjudicate(inputs(steady)),null);
 for(const key of ['confirmedPivots','independentRejections','resistanceWick']){
  const a=inputs();
  a.structure.candleLevelMap.levels[0]={...resistance,[key]:0};
  assert.equal(adjudicate(a),null,key);
 }
});
test('fades are NOT inferred from future, stale, swapped or missing quotes',()=>{
 const a=inputs();
 assert.equal(adjudicate({...a,now:T+2000}),null);
 assert.equal(adjudicate({...a,quoteHistory:a.quoteHistory.slice(0,-1)}),null);
 const late=inputs();late.quoteHistory=late.quoteHistory.map(q=>q.ts<T-3000?
   {...q,receivedAt:T+5000}:q);
 assert.equal(adjudicate(late),null);
 const gap=inputs();gap.quoteHistory=gap.quoteHistory.filter(q=>q.ts!==T-4000&&q.ts!==T-5000);
 assert.equal(adjudicate(gap),null);
 const swapped=inputs();swapped.quoteHistory=[...swapped.quoteHistory].reverse();
 assert.equal(adjudicate(swapped),null);
});
test('all seven holding durations share the exact same causal base, without artificial wait',()=>{
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const a=inputs();a.candidate.expirySeconds=durationMs/1000;
  assert.equal(adjudicate(a)?.kind,'observed-level-rejection-against-entry');
  const above=[1.10060,1.1007,1.1008,1.1009,1.10097,1.101035,1.10108,1.10112,1.10116];
  const b=inputs(above);b.candidate.expirySeconds=durationMs/1000;
  assert.equal(adjudicate(b),null);
 }
});
test('the shared entry base calls risk exactly once and never changes broker code',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(source,/!pivotRisk&&!wallRisk&&proposed\.ready\?observedLevelContestRisk/);
 assert.match(source,/shared-base-observed-level-rejection/);
 const moduleSource=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/observed-level-contest-risk.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(moduleSource,/\bawait\b|setInterval\s*\(|setTimeout\s*\(|fetch\s*\(|Date\.now\(/);
});
test('only last 9.5 seconds are scanned; long-price-tape CPU stays negligible',()=>{
 const early=Array.from({length:6000},(_,i)=>({ts:T-6008000+i*1000,
  receivedAt:T-6008000+i*1000,price:1.09}));
 const a=inputs();a.quoteHistory=[...early,...a.quoteHistory];
 for(let i=0;i<100;i++)adjudicate(a);
 const t=performance.now();
 for(let i=0;i<1000;i++)adjudicate(a);
 const elapsed=performance.now()-t;
 console.log('LEVEL_CONTEST_CPU '+JSON.stringify({calls:1000,elapsedMs:+elapsed.toFixed(3),
  avgMs:+(elapsed/1000).toFixed(5)}));
 assert.ok(elapsed<350,'This synchronous guard must not slow the broker chart');
});
