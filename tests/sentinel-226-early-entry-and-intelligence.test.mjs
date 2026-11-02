import test from 'node:test';
import assert from 'node:assert/strict';
import {adxDmi,confirmedRsiDivergence,pullbackResumption}
 from '../sentinel-trading-lab/agent/src/core/market-intelligence-226.mjs';
import {reviewFreshPullbackContinuation}
 from '../sentinel-trading-lab/agent/src/core/early-continuation-226.mjs';
import {reviewH207UnifiedAdmission}
 from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {entryFamilyOf} from '../sentinel-trading-lab/agent/src/core/entry-family.mjs';
import {smoothMarketCondition}
 from '../sentinel-trading-lab/agent/worker/market-condition-indicator.mjs';
const T=1800000000000;
const upBars=Array.from({length:65},(_,i)=>({high:100+i*.3+.13,
 low:100+i*.3-.11,close:100+i*.3,open:100+i*.3-.08}));
test('226 ADX/DMI reads only past candles and identifies both directions',()=>{
 const up=adxDmi(upBars,14),down=adxDmi(upBars.map(c=>({
  high:300-c.low,low:300-c.high,open:300-c.open,close:300-c.close
 })),14);
 assert.equal(up.ready,true);
 assert.equal(up.direction,'CALL');
 assert.ok(up.adx>=20);
 assert.equal(down.direction,'PUT');
 assert.equal(adxDmi(upBars.slice(0,8),14).ready,false);
});
test('226 divergence needs closed-confirmed pivots, never predicts an unseen candle',()=>{
 assert.equal(confirmedRsiDivergence(upBars.slice(0,6)).ready,false);
 const evaluated=confirmedRsiDivergence(upBars);
 assert.equal(evaluated.ready,true);
 assert.equal(evaluated.side,null);
});
test('226 resumption requires an actual EMA and a real pullback',()=>{
 const c=[{close:102,high:102.2,low:101.8},
 {close:103,high:103.2,low:102.8},
 {close:104,high:104.2,low:103.8},
 {close:105,high:105.2,low:104.8},
 {close:104.5,high:105.1,low:104.4},
 {close:104.8,high:104.8,low:104.5}];
 assert.equal(pullbackResumption(c,{tolerance:1,fast:105,slow:104}).call,true);
 assert.equal(pullbackResumption(c,{tolerance:1,fast:null,slow:null}).call,false);
 assert.equal(pullbackResumption(c,{tolerance:1,fast:105,slow:104}).put,false);
});
function quotes(mirror=false){
 const closes=[100,100.5,101,101.5,102,102.5,103,103.5,104,104.5,105.3,104.7];
 const rows=[];
 const points=[...closes,105.05];
 for(let k=0;k<points.length;k++){
  const start=k?points[k-1]:99.75;
  for(let j=0;j<(k===points.length-1?4:5);j++){
   const price=start+(points[k]-start)*(j+1)/(k===points.length-1?4:5);
   rows.push({ts:T+k*5000+j*1000,receivedAt:T+k*5000+j*1000,
    price:mirror?300-price:price});
  }
 }
 return rows;
}
test('226 fresh 30s and 1m continuation is current, not terminal or retroactive',()=>{
 const c={ready:false,reason:'completed-structure-not-ready',side:null};
 for(const durationMs of [30000,60000]){
  const q=quotes(),last=q.at(-1);
  const result=reviewFreshPullbackContinuation({candidate:c,quoteHistory:q,quoteAt:last.ts,
    now:last.ts,price:last.price,durationMs});
  assert.equal(result.ready,true);
  assert.equal(result.reason,'fresh-pullback-continuation');
  assert.equal(result.side,'CALL');
  assert.equal(result.entryPrice,last.price);
  assert.equal(entryFamilyOf(result),'continuation');
  const stale=reviewFreshPullbackContinuation({candidate:c,quoteHistory:q,quoteAt:last.ts,
    now:last.ts+3000,price:last.price,durationMs});
  assert.strictEqual(stale,c);
  assert.strictEqual(reviewFreshPullbackContinuation({candidate:c,quoteHistory:q,
    quoteAt:last.ts,now:last.ts,price:last.price,durationMs:300000}),c);
  const settled={ready:true,side:'PUT',reason:'historical-level-rejection'};
  assert.strictEqual(reviewFreshPullbackContinuation({candidate:settled,quoteHistory:q,
    quoteAt:last.ts,now:last.ts,price:last.price,durationMs}),settled);
 }
});
test('226 keeps H207 late-breakout veto and admits only verified current structural turns',()=>{
 const at=T+10000,price=1.1006;
 const proposed=(side='CALL')=>({ready:true,side,reason:'confirmed-level-structure-reversal',
  observedAt:at,entryPrice:price,
  earlyTurnEvidence:{kind:'level-microstructure-first-turn',withoutThreeClosedBars:true},
  priceStructure:{confirmedReversal:{kind:'confirmed-level-structure-reversal',side,
   confirmedAt:at,level:{level:1.1001},
   microTurn:{observedAt:at,extreme:1.0995,firstBreak:1.1004,retest:1.1002}}}});
 for(const durationMs of [30000,60000]){
  const c=proposed();
  const input={candidate:c,quoteAt:at,now:at,price,durationMs};
  assert.equal(reviewH207UnifiedAdmission(input).ready,false,'legacy default remains');
  assert.strictEqual(reviewH207UnifiedAdmission({...input,allowVerifiedEarlyReversal:true}),c);
  assert.equal(reviewH207UnifiedAdmission({...input,allowVerifiedEarlyReversal:true,now:at+4000}).ready,false);
  assert.equal(reviewH207UnifiedAdmission({...input,allowVerifiedEarlyReversal:true,
    candidate:{...c,earlyTurnEvidence:null}}).ready,false);
 }
 const five=proposed();
 assert.strictEqual(reviewH207UnifiedAdmission({candidate:five,quoteAt:at,
  now:at,price,durationMs:300000,allowVerifiedEarlyReversal:true}),five);
});
test('226 graph status stabilizes for 8 seconds, with instant risk/freshness downgrade',()=>{
 const ctx='exnova|EURUSD|60000',good={state:'good',reason:'aligned'},bad={state:'bad',reason:'risk'};
 let x=smoothMarketCondition(null,good,{at:1000,context:ctx});
 for(const at of [1500,2300,3500,6500])x=smoothMarketCondition(x,good,{at,context:ctx});
 assert.equal(x.state,'watch');
 x=smoothMarketCondition(x,good,{at:9100,context:ctx});
 assert.equal(x.state,'good');
 x=smoothMarketCondition(x,bad,{at:9200,context:ctx});
 assert.equal(x.state,'watch');
 x=smoothMarketCondition(x,{state:'sync',reason:'quote stale'},{at:9300,context:ctx});
 assert.equal(x.state,'sync');
});
