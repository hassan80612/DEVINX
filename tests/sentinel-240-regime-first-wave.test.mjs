import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decisiveMarketRegime240} from '../sentinel-trading-lab/agent/src/core/decisive-market-regime-240.mjs';
import {analyzeNowOpportunity,assessDirectionalPersistence,completedRangeStructure}
 from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {reviewFirstWaveCounterturn} from '../sentinel-trading-lab/agent/src/core/first-wave-counterturn-237.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
const AT=1800000000000;
function tape(kind){
 const data=[];
 for(let i=0;i<=190;i++){
  const slope=kind==='up'?1:kind==='down'?-1:0;
  const base=1.123+slope*.000004*i;
  const price=kind==='range'?
   1.123+.00013*Math.sin(2*Math.PI*i/24)+.000003*Math.sin(i*2.1):
   base+.000026*Math.sin(i*2.4)+.000003*Math.sin(i*.44);
  const ts=AT-190000+i*1000;
  data.push({ts,receivedAt:ts,price});
 }
 return data;
}
function decisive(rows,durationMs=30000){
 const last=rows.at(-1);
 return decisiveMarketRegime240({quoteHistory:rows,quoteAt:last.ts,
  now:last.ts,price:last.price,durationMs});
}
test('240: rising market with 1-second quote noise remains uptrend at 30s and 1m',()=>{
 const up=tape('up');
 for(const ms of [30000,60000]){
  const key=decisive(up,ms);
  assert.equal(key.kind,'trend',JSON.stringify(key));
  assert.equal(key.side,'CALL');
  assert.equal(completedRangeStructure(up,AT,.000025,up.at(-1).price,ms),null);
  const persistence=assessDirectionalPersistence({quoteHistory:up,quoteAt:AT,
   now:AT,price:up.at(-1).price,durationMs:ms});
  assert.notEqual(persistence.phase,'range',JSON.stringify(persistence));
  const result=analyzeNowOpportunity({quoteHistory:up,quoteAt:AT,now:AT,
   price:up.at(-1).price,durationMs:ms,engineId:'automatic'});
  assert.notEqual(result.reason,'choppy-sideways-structure',JSON.stringify(result));
  assert.notEqual(result.reason,'range-extreme-awaiting-confirmed-turn',JSON.stringify(result));
 }
});
test('240: declining market with heavy micro-noise is NOT sideways',()=>{
 const down=tape('down');
 for(const ms of [30000,60000]){
  const key=decisive(down,ms);
  assert.equal(key.kind,'trend',JSON.stringify(key));
  assert.equal(key.side,'PUT');
  assert.equal(completedRangeStructure(down,AT,.000025,down.at(-1).price,ms),null);
  const persistence=assessDirectionalPersistence({quoteHistory:down,quoteAt:AT,
   now:AT,price:down.at(-1).price,durationMs:ms});
  assert.notEqual(persistence.phase,'range',JSON.stringify(persistence));
  const result=analyzeNowOpportunity({quoteHistory:down,quoteAt:AT,now:AT,
   price:down.at(-1).price,durationMs:ms,engineId:'automatic'});
  assert.notEqual(result.reason,'choppy-sideways-structure',JSON.stringify(result));
 }
});
test('240: actual flat two-way oscillation is NOT manufactured as a trending order',()=>{
 const flat=tape('range');
 for(const ms of [30000,60000]){
  const key=decisive(flat,ms);
  assert.notEqual(key.kind,'trend',JSON.stringify(key));
  const result=analyzeNowOpportunity({quoteHistory:flat,quoteAt:AT,now:AT,
   price:flat.at(-1).price,durationMs:ms,engineId:'automatic'});
  assert.notEqual(result.reason,'closed-structure-and-live-impulse',
   'genuine oscillation must not be granted a trend-only continuation');
 }
});
const LEVEL=1.10038,TOL=.00012;
const prices=[1.10000,1.10001,1.100025,1.10003,1.10005,1.10007,1.10008,
 1.10010,1.10012,1.10020,1.10029,LEVEL,1.100365,1.10034];
const spike=prices.map((price,i)=>{const ts=AT-(prices.length-1-i)*1000;
 return{ts,receivedAt:ts,price};});
const resistance={low:LEVEL-.00003,high:LEVEL+.00003,level:LEVEL,
 resistancePivots:2,resistanceRejections:2,supportPivots:0,supportRejections:0,
 confirmedPivots:2,independentRejections:2,independentTests:3,tests:[{age:30},{age:19}]};
const map={observedCandles:65,asOf:AT-60000,tolerance:TOL,levels:[resistance]};
const forecast={ready:true,side:'CALL',reason:'observed-trend-and-30s-cycle-projection',
 observedAt:AT,entryPrice:spike.at(-1).price};
test('242: 30s projected continuation stays actionable while a proven PUT is prepared, then yields to actual rejection',()=>{
 const rising=spike.slice(0,12),at=rising.at(-1).ts;
 const result=reviewFirstWaveCounterturn({candidate:{...forecast,observedAt:at,
   entryPrice:rising.at(-1).price},map,quoteHistory:rising,quoteAt:at,now:at,
   price:rising.at(-1).price,durationMs:30000});
 assert.equal(result.ready,true,JSON.stringify(result));
 assert.equal(result.side,'CALL');
 assert.equal(result.reason,forecast.reason);
 assert.equal(result.reversalWatch.side,'PUT');
 assert.equal(result.spikeAnticipation.state,'armed');
 assert.match(marketReading({phase:result.marketPhase,label:result.marketPhaseLabel,
  trendSide:result.marketTrendSide,candidate:result}),/CONTINUIDADE.*CALL/);
 const fired=reviewFirstWaveCounterturn({candidate:forecast,map,
   quoteHistory:spike,quoteAt:AT,now:AT,price:spike.at(-1).price,
   durationMs:30000});
 assert.equal(fired.ready,true,JSON.stringify(fired));
 assert.equal(fired.side,'PUT');
 assert.equal(fired.reason,'confirmed-level-structure-reversal');
});
test('240: no fabricated reversal without verified level, genuine counter-move or selected 30s/1m',()=>{
 const rising=spike.slice(0,12),at=rising.at(-1).ts;
 const unproven={...resistance,resistanceRejections:0,independentTests:1};
 const candidate={...forecast,observedAt:at,entryPrice:rising.at(-1).price};
 const out=reviewFirstWaveCounterturn({candidate,map:{...map,levels:[unproven]},
  quoteHistory:rising,quoteAt:at,now:at,price:rising.at(-1).price,durationMs:30000});
 assert.strictEqual(out,candidate);
 const five=reviewFirstWaveCounterturn({candidate,map,quoteHistory:spike,
  quoteAt:AT,now:AT,price:spike.at(-1).price,durationMs:300000});
 assert.strictEqual(five,candidate);
});
test('240: no variation is not falsely displayed as LATERAL',()=>{
 const read=marketReading({phase:'insufficient',
  candidate:{reason:'insufficient-quote-variation'}});
 assert.equal(read,'MOVIMENTO SEM CONFIRMAÇÃO');
 assert.equal(marketReading({phase:'insufficient',
  candidate:{reason:'choppy-sideways-structure'}}),'MERCADO LATERAL');
});
test('240: previous early spike and native 238 expiry invariants remain available',()=>{
 const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
 const keeper=readFileSync(new URL('worker/broker-native-expiry-keeper.mjs',root),'utf8');
 const driver=readFileSync(new URL('worker/local-playwright-driver.mjs',root),'utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
 assert.match(driver,/nativeExpiryExplicitThirty/);
 assert.equal(decisiveMarketRegime240({quoteHistory:tape('up'),quoteAt:AT,now:AT,
  price:tape('up').at(-1).price,durationMs:300000}).kind,'unconfirmed');
});
