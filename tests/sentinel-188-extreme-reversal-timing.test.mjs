import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewLiveExtremeTiming,reviewEarlyDistantReversal} from '../sentinel-trading-lab/agent/src/core/historical-extreme-timing.mjs';
const T=1800000000000;
const candles=(local=false)=>{
 const rows=Array.from({length:54},(_,i)=>({
  from:T-(54-i)*60000,to:T-(53-i)*60000,
  open:.83280,close:.83288,high:.83303,low:.83260,receivedAt:T-100
 }));
 // Local three-bar peak and old wide-range position near exhaustion.
 if(local)for(let i=51;i<54;i++){rows[i].high=.833105;rows[i].low=.833005;}
 return rows;
};
const rows=(values)=>values.map((price,i)=>({ts:T-(values.length-1-i)*1000,price,receivedAt:T-(values.length-1-i)*1000}));
test('realistic 1m losing CALL at recent and distant highs rejects weak fading continuation',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 const tape=rows([.833095,.833085,.833095,.833095,.833105,.833100]);
 const out=reviewLiveExtremeTiming({candidate,original:{observedImpulse:.000018,noise:.0000649},
  quoteHistory:tape,candles:candles(true),quoteAt:T,now:T,price:.833100,durationMs:60000});
 assert.equal(out.ready,false,JSON.stringify(out));assert.equal(out.reason,'far-extreme-weak-continuation-after-pullback');
});
test('realized breakout is preserved and no distant-range data is not guessed',()=>{
 const candidate={ready:true,side:'CALL',reason:'historical-level-breakout'},tape=rows([.832925,.832935,.832955,.832965,.832975,.832980]);
 assert.equal(reviewLiveExtremeTiming({candidate,original:{observedImpulse:.00003,noise:.000066},
  quoteHistory:tape,candles:candles(true),quoteAt:T,now:T,price:.832980,durationMs:60000}),candidate);
 assert.equal(reviewLiveExtremeTiming({candidate,quoteHistory:tape,candles:[],quoteAt:T,now:T,price:.832980,durationMs:60000}),candidate);
});
test('a one-tick PUT reversal after alternating prices is WAIT, not a blind order',()=>{
 const candidate={ready:true,side:'PUT',reason:'closed-range-extreme-reversal-confirmed'};
 const tape=rows([.832985,.832985,.832995,.832990,.832995,.832980]);
 const out=reviewLiveExtremeTiming({candidate,quoteHistory:tape,quoteAt:T,now:T,price:.832980,durationMs:60000});
 assert.equal(out.ready,false);assert.equal(out.reason,'range-reversal-lacks-two-consecutive-live-confirmations');
});
test('two consecutive timely PUT reversal ticks qualify without fixed 3-candle waiting',()=>{
 const candidate={ready:true,side:'PUT',reason:'closed-range-extreme-reversal-confirmed'};
 const tape=rows([.832985,.832995,.833005,.833000,.832990,.832980]);
 assert.equal(reviewLiveExtremeTiming({candidate,quoteHistory:tape,quoteAt:T,now:T,price:.832980,durationMs:60000}),candidate);
});
test('5m, fixed mode and non-short horizons are untouched',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-range-extreme-reversal-confirmed'};
 assert.equal(reviewLiveExtremeTiming({candidate,quoteAt:T,now:T,price:.833,durationMs:300000}),candidate);
});
test('early 1m reversal never fabricates order from missing historic level, conflict or a single tick',()=>{
 const candidate={ready:false,side:null,reason:'awaiting'};
 assert.equal(reviewEarlyDistantReversal({candidate,map:null,quoteAt:T,now:T,price:100,durationMs:60000}),candidate);
 const map={observedCandles:100,asOf:T-60000,tolerance:.0005,
  windows:[{size:3,available:true,observed:3,levels:[]}],levels:[]};
 const tape=rows([99.9980,99.9998,100.0003,100.0004,100.0001,99.9998]);
 assert.equal(reviewEarlyDistantReversal({candidate,map,quoteHistory:tape,quoteAt:T,now:T,price:99.9998,durationMs:60000}),candidate);
 assert.equal(reviewEarlyDistantReversal({candidate,map,quoteHistory:tape,quoteAt:T,now:T,price:99.9998,durationMs:300000}),candidate);
});
test('a real confirmed 1m historical resistance reversal is accepted on the SECOND live move, not blind',()=>{
 const candidate={ready:false,side:null,reason:'observing'};
 const map={observedCandles:100,asOf:T-60000,tolerance:.0003,
  windows:[{size:100,available:true,observed:100,levels:[100]}],
  levels:[{level:100,low:99.9998,high:100.0002,confirmedPivots:2,
   resistancePivots:2,resistanceRejections:2,supportPivots:0,supportRejections:0,
   independentTests:3,resistanceWick:.8,supportWick:0,
   tests:[{age:36,independent:true,rejectedHigh:true}]}]};
 const confirmed=rows([99.9970,99.9980,99.9990,100.0000,100.0003,100.0003,100.0002,100.0000,99.9998]);
 const good=reviewEarlyDistantReversal({candidate,map,quoteHistory:confirmed,
  quoteAt:T,now:T,price:99.9998,durationMs:60000});
 assert.equal(good.ready,true,JSON.stringify(good));
 assert.equal(good.side,'PUT');assert.equal(good.reason,'multiscale-candle-rejection');
 const oneTick=rows([99.9970,99.9980,99.9990,100.0000,100.0003,100.0003,100.0002,100.0003,99.9998]);
 assert.equal(reviewEarlyDistantReversal({candidate,map,quoteHistory:oneTick,
  quoteAt:T,now:T,price:99.9998,durationMs:60000}),candidate);
});
test('reversal path and final extreme timing guard are actually wired to engine before orders',()=>{
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(runtime,/eligible=reviewLiveExtremeTiming\(\{/);
 assert.match(engine,/const located=reviewEarlyDistantReversal\(\{/);
});
