import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareMarketPaths,EXPIRY_PATH_WINDOWS} from '../sentinel-trading-lab/agent/src/core/competing-market-path-study.mjs';
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

const EXPIRIES=[5000,15000,30000,60000,120000,300000];
test('all six expiries use their own causal windows; 5s never demands 60s and 5m requires 300s',()=>{
 assert.deepEqual(Object.keys(EXPIRY_PATH_WINDOWS).map(Number),EXPIRIES);
 for(const expiry of EXPIRIES){
  const holding=expiry/1000,q=stream(i=>100+i*.01,holding+1);
  const verdict=compareMarketPaths(args(q,{durationMs:expiry,
    support:{level:98},resistance:{level:q.at(-1).price+2}}));
  assert.equal(verdict.ready,true,JSON.stringify({expiry,verdict}));
  assert.equal(verdict.hypothesisSide,'CALL');
  assert.equal(verdict.horizons.at(-1),holding);
  assert.equal(verdict.scenario,'CONFIRMED_CONTINUATION');
 }
});
test('no expiry can use future, absent or stale quotes to validate a 5m trend',()=>{
 for(const expiry of EXPIRIES){
  const seconds=expiry/1000,q=stream(i=>100+i*.01,seconds+1);
  const opts={durationMs:expiry,resistance:{level:200},support:{level:50}};
  const missing=q.filter(x=>x.ts>=T-1000*(seconds-1));
  assert.equal(compareMarketPaths(args(missing,opts)).ready,false);
  const tampered=q.map(x=>({...x,receivedAt:x.ts>=T-1000*seconds/2?T+1000:x.receivedAt}));
  assert.equal(compareMarketPaths(args(tampered,opts)).ready,false);
 }
});
test('confirm breakout instead of mistaking a strong level departure for reversal, all six durations',()=>{
 for(const expiry of EXPIRIES){
  const seconds=expiry/1000,q=stream(i=>100+i*.01,seconds+1),spot=q.at(-1).price;
  const x=compareMarketPaths(args(q,{durationMs:expiry,
   resistance:{level:spot+2},support:{level:spot-2},
   reaction:{kind:'breakout',side:'CALL',zone:{level:spot-.02,touches:3},
    zoneTolerance:.02}}));
  assert.equal(x.scenario,'CONFIRMED_BREAKOUT',JSON.stringify({expiry,x}));
  assert.equal(x.hypothesisSide,'CALL');
 }
});
test('unverified level touch cannot be treated as confirmed breakout',()=>{
 const q=stream(i=>100+i*.02,121);
 const x=compareMarketPaths(args(q,{durationMs:120000,
  resistance:{level:105},support:{level:95},
  reaction:{kind:'breakout',side:'PUT',zone:{level:102,touches:1},zoneTolerance:.04}}));
 assert.equal(x.scenario,'CONFIRMED_CONTINUATION');
 assert.equal(x.hypothesisSide,'CALL');
});
test('no expiry invents an outcome or predicts a win rate',()=>{
 for(const expiry of EXPIRIES){
  const sec=expiry/1000,q=stream(i=>100+i*.01,sec+1);
  const x=compareMarketPaths(args(q,{durationMs:expiry,
   support:{level:90},resistance:{level:120}}));
  for(const key of ['winRate','correct','settlement','payout','brokerOutcome'])
   assert.equal(Object.hasOwn(x,key),false);
 }
});
