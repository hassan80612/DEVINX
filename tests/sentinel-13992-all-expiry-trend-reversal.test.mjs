import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adjudicateExpiryTrend} from '../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
const horizons=[5000,10000,15000,30000,60000,120000,300000],origin=1792709000000;
const candles=(side='CALL',n=230)=>{
 const sign=side==='CALL'?1:-1;
 // Clearly observed independent rising/falling prices over 230s.
 return Array.from({length:n+1},(_,i)=>({ts:origin+i*1000,receivedAt:origin+i*1000,
  price:1.14+sign*(i*.000012+Math.sin(i*1.6)*.00000013)}));
};
const base=(side,reason='closed-structure-and-live-impulse')=>
 ({ready:true,side,reason,strength:72,observedAt:origin+230000,entryPrice:1.14});
const choose=(cand,quotes,ms,estimate=null,now=quotes.at(-1).ts)=>{
 const q=quotes.at(-1);
 return adjudicateExpiryTrend({candidate:cand,quoteHistory:quotes,quoteAt:q.ts,price:q.price,
  durationMs:ms,now,estimate});
};
test('ALL seven expiries: sustained real uptrend may correct stale PUT BEFORE entry',()=>{
 const q=candles('CALL');
 for(const ms of horizons){
  const z=choose(base('PUT'),q,ms,ms>=30000?{pCall:.70,pPut:.30}:null);
  assert.equal(z.side,'CALL',String(ms)+'ms');
  assert.equal(z.reason,'observed-multi-interval-trend-correction');
  assert.equal(z.originalSide,'PUT');
  assert.equal(z.entryPrice,q.at(-1).price);
  assert.equal(z.observedAt,q.at(-1).ts);
 }
});
test('ALL seven expiries: symmetric real downtrend may correct stale CALL',()=>{
 const q=candles('PUT');
 for(const ms of horizons){
  const z=choose(base('CALL'),q,ms,ms>=30000?{pCall:.30,pPut:.70}:null);
  assert.equal(z.side,'PUT',String(ms)+'ms');
  assert.equal(z.reason,'observed-multi-interval-trend-correction');
 }
});
test('trend continuation does NOT need an unnecessary second vote or calibrated probability',()=>{
 const q=candles('CALL');
 for(const ms of horizons){
  const z=choose(base('CALL'),q,ms,null);
  assert.equal(z.ready,true);assert.equal(z.side,'CALL');
  assert.equal(z.reason,'closed-structure-and-live-impulse');
 }
});
test('a brief opposing bounce is not enough to reverse a meaningful structural forecast',()=>{
 const q=candles('PUT');
 const t=q.at(-1).ts;
 // Two reversing ticks are NOT 4 independent segments of a reversal.
 q[q.length-2]={...q.at(-2),price:q.at(-3).price+.000002};
 q[q.length-1]={...q.at(-1),price:q.at(-2).price+.000001};
 for(const ms of horizons){
  const z=choose(base('PUT'),q,ms,{pCall:.7,pPut:.3});
  assert.equal(z.side,'PUT',String(ms)+'ms');
 }
});
test('a genuine confirmed rejection/reversal remains authoritative for ALL durations',()=>{
 const q=candles('CALL');
 for(const ms of horizons){
  for(const reason of ['closed-range-extreme-reversal-confirmed',
    'multiscale-candle-rejection','failed-breakout-structure-change']){
    const z=choose(base('PUT',reason),q,ms,{pCall:.95,pPut:.05});
    assert.equal(z.side,'PUT',reason+' '+ms);
    assert.equal(z.ready,true);
  }
 }
});
test('short-lived historical rejection does not automatically outrank four time-matched current trend segments',()=>{
 const q=candles('CALL'),spot=q.at(-1).price;
 for(const ms of horizons){
  const candidate={...base('PUT','historical-level-rejection'),
   priceStructure:{reaction:{kind:'rejection',side:'PUT',zone:{level:spot-.00002,touches:2}}}};
  const out=choose(candidate,q,ms,{pCall:.2,pPut:.8});
  assert.equal(out.side,'CALL',ms+'ms');
  assert.equal(out.reason,'observed-multi-interval-trend-correction');
 }
});
test('a two-tick bounce or uncertain expiry trend cannot overwrite a real level reversal',()=>{
 const q=candles('PUT');
 const ts=q.at(-1).ts;
 q[q.length-2]={...q.at(-2),price:q.at(-3).price+.000002};
 q[q.length-1]={...q.at(-1),price:q.at(-2).price+.000001};
 for(const ms of horizons){
  const p={...base('CALL','historical-level-rejection'),
   priceStructure:{reaction:{kind:'rejection',side:'CALL',zone:{level:1.13,touches:4}}}};
  const result=choose(p,q,ms,{pCall:.96,pPut:.04});
  assert.equal(result.side,'CALL',ms+'ms');
  assert.equal(result.reason,'historical-level-rejection');
 }
});
test('confirmed opposite wall refuses both trend chase and the old contrary entry',()=>{
 const q=candles('CALL'),spot=q.at(-1).price;
 const cand={...base('PUT'),priceStructure:{nearestResistance:{level:spot+.00000005}}};
 const z=choose(cand,q,60000,{pCall:.73,pPut:.27});
 assert.equal(z.ready,false);assert.equal(z.side,null);
 assert.equal(z.reason,'opposite-trend-near-confirmed-wall');
});
test('never uses quotes from after the decision and preserves entry expiry and click ownership',()=>{
 const q=candles('CALL'),ts=q.at(-1).ts;const old=base('PUT');
 const a=choose(old,q,60000,{pCall:.73,pPut:.27});
 const future={ts:ts+1000,receivedAt:ts+1000,price:.3};
 const b=adjudicateExpiryTrend({candidate:old,quoteHistory:[...q,future],
   quoteAt:ts,price:q.at(-1).price,now:ts,durationMs:60000,
   estimate:{pCall:.73,pPut:.27}});
 assert.deepEqual(b,a);
 const helper=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/\bawait\b|setInterval\s*\(|setTimeout\s*\(|page\.click|playwright|fetch\s*\(/i);
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(runtime,/const observation=this.forecastModel/);
 assert.match(runtime,/adjudicateExpiryTrend\(\{candidate:combine66WithProbability/);
 assert.match(runtime,/expiryCalibration=this.forecastModel/);
});
test('same historical broker quotes: disclose retained/changed results for EVERY comparable expiry',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url),'utf8'));
 const quotes=f.quoteHistory;
 for(const durationMs of horizons){
  const stat={durationMs,base:0,corrected:0,baseCorrect:0,correctedCorrect:0,flips:0,missedOutcome:0};
  let nextAt=quotes[0].ts+100000;
  for(let i=0;i<quotes.length;i++){
   const q=quotes[i];
   if(q.ts<nextAt||q.ts+durationMs>quotes.at(-1).ts)continue;
   const history=quotes.slice(0,i+1);
   const candidate=analyzeNowOpportunity({quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,
    durationMs,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
   if(!candidate.ready)continue;
   const probability=durationMs>=30000?shortProbability({quoteHistory:history,price:q.price,
    quoteAt:q.ts,now:q.ts,durationMs}):null;
   const final=adjudicateExpiryTrend({candidate,quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,
    durationMs,estimate:probability});
   const exit=quotes.find(v=>v.ts>=q.ts+durationMs);
   if(!exit||exit.ts>q.ts+durationMs+1000){stat.missedOutcome++;continue}
   const correctSide=exit.price>q.price?'CALL':exit.price<q.price?'PUT':null;
   nextAt=q.ts+durationMs;
   if(!correctSide)continue;
   stat.base++;if(candidate.side===correctSide)stat.baseCorrect++;
   if(final.ready){stat.corrected++;if(final.side===correctSide)stat.correctedCorrect++;}
   if(final.ready&&final.side!==candidate.side)stat.flips++;
  }
  console.log('EXPIRY_TREND_SHADOW_REPLAY '+JSON.stringify(stat));
  assert.ok(stat.corrected<=stat.base);
 }
});
