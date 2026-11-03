import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewFirstWaveCounterturn} from '../sentinel-trading-lab/agent/src/core/first-wave-counterturn-237.mjs';
import {verifiedFirstQuoteTurnAtLevel,countertrendPivotRisk} from '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';
import {reviewOneMinuteRejectionProof} from '../sentinel-trading-lab/agent/src/core/one-minute-rejection-admission.mjs';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const AT=1800000000000,LEVEL=1.10038,TOL=.00012;
const prices=[1.10000,1.10001,1.100025,1.10003,1.10005,1.10007,1.10008,
  1.10010,1.10012,1.10020,1.10029,LEVEL,1.100365,1.10034];
const rows=prices.map((price,i)=>{const ts=AT-(prices.length-1-i)*1000;return {ts,receivedAt:ts,price};});
const resistance={low:LEVEL-.00003,high:LEVEL+.00003,level:LEVEL,resistancePivots:2,
 resistanceRejections:2,supportPivots:0,supportRejections:0,
 confirmedPivots:2,independentRejections:2,independentTests:3,tests:[{age:30},{age:19}]};
const makeMap=(levels=[resistance])=>({observedCandles:65,asOf:AT-60000,
 tolerance:TOL,levels,windows:[3,10,20,50,100].map(size=>({
 size,available:true,observed:65,levels:levels.map(x=>x.level)
 }))});
const base={ready:true,side:'CALL',observedAt:AT,entryPrice:rows.at(-1).price,
 reason:'historical-level-breakout'};
function check(quoteHistory,durationMs,side='CALL',map=makeMap()){
 return reviewFirstWaveCounterturn({candidate:{...base,side,entryPrice:quoteHistory.at(-1).price},
  map,quoteHistory,quoteAt:quoteHistory.at(-1).ts,
  now:quoteHistory.at(-1).ts,price:quoteHistory.at(-1).price,durationMs});
}
test('239: engine arms opposite PUT BEFORE bullish velocity peak reverses on BOTH horizons',()=>{
 const stillRising=rows.slice(0,12);
 for(const ms of [30000,60000]){
  const armed=check(stillRising,ms);
  assert.equal(armed.ready,false);
  assert.equal(armed.side,null);
  assert.equal(armed.provisionalSide,'PUT');
  assert.equal(armed.reason,'terminal-spike-at-proven-wall-awaiting-first-rejection');
  assert.equal(armed.spikeAnticipation.state,'armed');
  assert.equal(armed.spikeAnticipation.level,LEVEL);
 }
});
test('239: two real counter-ticks at old ceiling take priority on 30s and 1m; candle still net green',()=>{
 assert.ok(rows.at(-1).price>rows[0].price);
 for(const ms of [30000,60000]){
  const signal=check(rows,ms);
  assert.equal(signal.ready,true);
  assert.equal(signal.side,'PUT');
  assert.equal(signal.reason,'confirmed-level-structure-reversal');
  assert.equal(signal.priceStructure.confirmedReversal.earlyLevelProof.source,'terminal-spike-first-wave-239');
  const p=signal.priceStructure.confirmedReversal;
  const proof={reversalEvidence:p,quoteHistory:rows,quoteAt:AT,now:AT,price:rows.at(-1).price,
   side:'PUT',durationMs:ms};
  assert.equal(verifiedFirstQuoteTurnAtLevel(proof),true);
  assert.equal(countertrendPivotRisk(proof),false);
  assert.equal(reviewH207UnifiedAdmission({candidate:signal,
    quoteHistory:rows,quoteAt:AT,now:AT,price:rows.at(-1).price,
    durationMs:ms,allowVerifiedEarlyReversal:true}).ready,true);
  assert.equal(reviewOneMinuteRejectionProof({candidate:signal,original:base,
    quoteHistory:rows,quoteAt:AT,now:AT,price:rows.at(-1).price,durationMs:ms}).ready,true,
    'stale bullish 3/6/12 or 4/10/20s movement cannot erase a VERIFIED fresh counterturn');
 }
});
test('239: same early mechanism supports CALL at an old floor',()=>{
 const reflect=p=>2.2-p;
 const mirrored=rows.map(q=>({...q,price:reflect(q.price)}));
 const support={...resistance,low:reflect(resistance.high),high:reflect(resistance.low),
  level:reflect(LEVEL),supportPivots:2,supportRejections:2,
  resistancePivots:0,resistanceRejections:0};
 for(const ms of [30000,60000]){
  const old={...base,side:'PUT',entryPrice:mirrored.at(-1).price};
  const turn=reviewFirstWaveCounterturn({candidate:old,map:makeMap([support]),
   quoteHistory:mirrored,quoteAt:AT,now:AT,price:mirrored.at(-1).price,durationMs:ms});
  assert.equal(turn.side,'CALL');
  assert.equal(turn.priceStructure.confirmedReversal.earlyLevelProof.source,'terminal-spike-first-wave-239');
  assert.equal(verifiedFirstQuoteTurnAtLevel({reversalEvidence:turn.priceStructure.confirmedReversal,
   quoteHistory:mirrored,quoteAt:AT,now:AT,price:mirrored.at(-1).price,side:'CALL',durationMs:ms}),true);
 }
});
test('239: cannot invert a spike still moving up, an untested level, or a live breakout',()=>{
 const weak={...resistance,resistanceRejections:0,resistancePivots:0};
 const noProof=check(rows.slice(0,12),30000,'CALL',makeMap([weak]));
 assert.equal(noProof.ready,true);
 assert.equal(noProof.side,'CALL');
 const far={...resistance,level:1.102,low:1.10197,high:1.10203};
 assert.equal(check(rows.slice(0,12),60000,'CALL',makeMap([far])).side,'CALL');
 const breaking=rows.slice(0,12).map(q=>({...q}));
 breaking[11].price=resistance.high+TOL*.65;
 assert.equal(check(breaking,30000).side,'CALL','genuine breakout is not a reversal');
 const oneCounter=rows.slice(0,13);
 assert.equal(check(oneCounter,60000).side,'CALL','one noisy opposing tick is not a PUT');
});
test('239: older valid reversals, 5m mode, and native 238 expiry keeper stay unchanged',()=>{
 const oldReverse={...base,side:'PUT',reason:'confirmed-level-structure-reversal'};
 for(const ms of [30000,60000]){
  assert.equal(reviewFirstWaveCounterturn({candidate:oldReverse,map:makeMap(),
   quoteHistory:rows,quoteAt:AT,now:AT,price:rows.at(-1).price,durationMs:ms}),oldReverse);
 }
 assert.deepEqual(check(rows,300000),base);
 const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
 const keeper=readFileSync(new URL('worker/broker-native-expiry-keeper.mjs',root),'utf8');
 const driver=readFileSync(new URL('worker/local-playwright-driver.mjs',root),'utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
 assert.match(driver,/nativeExpiryExplicitThirty/);
});
test('239: complete shared market analyzer retains a verified spike reversal on 30s and 1m',()=>{
 const map=makeMap(),structure={candles:65,averages:[],zones:[],
  tolerance:TOL,atr:TOL,periodMs:60000,candleLevelMap:map,asOf:AT-60000};
 for(const ms of [30000,60000]){
  const out=analyzeNowOpportunity({quoteHistory:rows,quoteAt:AT,now:AT,
   price:rows.at(-1).price,durationMs:ms,
   engineId:'automatic',qualityPolicy:'adaptive-market-v17',
   entryFamily:'automatic',candles:[],structureCache:{get:()=>structure}});
  assert.equal(out.ready,true);
  assert.equal(out.side,'PUT');
  assert.equal(out.priceStructure?.confirmedReversal?.earlyLevelProof?.source,'terminal-spike-first-wave-239');
 }
});
