import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareMarketPaths} from '../sentinel-trading-lab/agent/src/core/competing-market-path-study.mjs';
const T=1800000000000;
const stream=(fn,n=61)=>Array.from({length:n},(_,i)=>({
 ts:T-(n-1-i)*1000,receivedAt:T-(n-1-i)*1000,price:fn(i)}));
const callTrend=stream(i=>100+i*.02);
const deepTurn=stream(i=>i<=45?100-i*.08:96.4+(i-45)*.03);
const args=(q,opts={})=>({
 quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,durationMs:60000,
 support:{level:99},resistance:{level:102},...opts
});
test('a genuine multi-horizon continuation can be recognized without waiting for a new candle',()=>{
 const x=compareMarketPaths(args(callTrend));
 assert.equal(x.scenario,'CONFIRMED_CONTINUATION');
 assert.equal(x.hypothesisSide,'CALL');
 assert.equal(x.ready,true);
 for(const seconds of [5,15,30,60])assert.equal(x.windows[seconds].side,'CALL');
});
test('mirror symmetry preserves evidence for an observed PUT continuation',()=>{
 const q=callTrend.map(p=>({...p,price:200-p.price}));
 const x=compareMarketPaths(args(q,{support:{level:98},resistance:{level:101}}));
 assert.equal(x.scenario,'CONFIRMED_CONTINUATION');assert.equal(x.hypothesisSide,'PUT');
});
test('a deep 60s trend can give way to a level-confirmed 15s reversal with room',()=>{
 const q=deepTurn;
 const x=compareMarketPaths(args(q,{
  support:{level:96.65},resistance:{level:97.9},
  reaction:{kind:'rejection',side:'CALL',zone:{level:96.78,touches:3},
    zoneTolerance:.10}
 }));
 assert.equal(x.scenario,'CONFIRMED_LEVEL_REVERSAL');
 assert.equal(x.hypothesisSide,'CALL');assert.equal(x.windows[60].side,'PUT');
});
test('one shallow counter-trend tick cannot be called a confirmed reversal',()=>{
 const q=stream(i=>i<59?100-i*.03:98.26+(i-59)*.015);
 const x=compareMarketPaths(args(q,{support:{level:98},resistance:{level:100},
  reaction:{kind:'rejection',side:'CALL',zone:{level:98.28,touches:5},zoneTolerance:.1}}));
 assert.equal(x.ready,false);assert.equal(x.hypothesisSide,null);
});
test('unknown/opposing wall makes trend evidence unresolved, not an invented safe trade',()=>{
 const a=compareMarketPaths(args(callTrend,{resistance:null}));
 const b=compareMarketPaths(args(callTrend,{resistance:{level:101.25}}));
 assert.equal(a.ready,false);assert.equal(b.ready,false);
});
test('a future-received quote cannot manufacture a 60-second win signal',()=>{
 const q=callTrend.map(p=>({...p}));
 for(const p of q)if(p.ts>=T-45000)p.receivedAt=T+10000;
 const x=compareMarketPaths(args(q));
 assert.equal(x.ready,false);
});
test('sparse, gapped or stale source data never gets conflated with flat markets',()=>{
 assert.equal(compareMarketPaths(args(callTrend.slice(-35))).reason,'incomplete-causal-horizons');
 assert.equal(compareMarketPaths(args(callTrend.filter(p=>p.ts<T-18000||p.ts>T-10000))).ready,false);
 assert.equal(compareMarketPaths(args(callTrend,{now:T+3000})).reason,'stale-or-invalid-market');
});
test('study remains entirely outside the live signal executor and original shared market base',()=>{
 for(const file of ['agent/src/core/now-opportunity-engine.mjs','agent/src/core/runtime.mjs','agent/worker/signal-executor.mjs']){
  const content=readFileSync(new URL('../sentinel-trading-lab/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(content,/competing-market-path-study|compareMarketPaths/);
 }
});
