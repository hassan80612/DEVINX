import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewFirstWaveCounterturn} from '../sentinel-trading-lab/agent/src/core/first-wave-counterturn-237.mjs';
import {reviewFirstImpulseReversal} from '../sentinel-trading-lab/agent/src/core/impulse-lifecycle-227.mjs';
import {verifiedFirstQuoteTurnAtLevel,countertrendPivotRisk} from '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {entryFamilyOf} from '../sentinel-trading-lab/agent/src/core/entry-family.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const AT=1800000000000,TOL=.00012;
const prices=[1.10020,1.10022,1.10024,1.10026,1.10028,1.10030,1.10032,
 1.10034,1.10036,1.10038,1.10040,1.10039,1.10038,1.100355];
const quotes=prices.map((price,i)=>{const ts=AT-(prices.length-i-1)*1000;return{ts,receivedAt:ts,price};});
const price=prices.at(-1),peak=prices[10];
const z=(offset=0)=>({level:peak+offset,low:peak+offset-.00003,
 high:peak+offset+.00003,resistancePivots:2,resistanceRejections:1,
 supportPivots:0,supportRejections:0,independentTests:3,
 confirmedPivots:2,independentRejections:1,tests:[{age:22},{age:15}]});
const map=levels=>({observedCandles:65,asOf:AT-60000,tolerance:TOL,levels,
 windows:[3,10,20,50,100].map(size=>({size,available:true,observed:65,levels:levels.map(x=>x.level)}))});
const original={ready:true,side:'CALL',reason:'historical-level-breakout',
 observedAt:AT,entryPrice:price};
const ctx={candidate:original,quoteHistory:quotes,quoteAt:AT,now:AT,price,durationMs:60000};

test('237: first small opposite wave can select PUT while current candle remains net green',()=>{
 assert.ok(price>prices[0]);
 const old=reviewFirstImpulseReversal({...ctx,map:map([z()]),candles:[]});
 assert.equal(old.side,'CALL','old impulse proof would still chase continuation here');
 const result=reviewFirstWaveCounterturn({...ctx,map:map([z()])});
 assert.equal(result.ready,true);
 assert.equal(result.side,'PUT');
 assert.equal(result.reason,'confirmed-level-structure-reversal');
 assert.equal(entryFamilyOf(result),'reversal');
 assert.equal(result.priceStructure.confirmedReversal.microTurn.extremeAt,AT-3000);
 assert.equal(verifiedFirstQuoteTurnAtLevel({reversalEvidence:result.priceStructure.confirmedReversal,
  quoteHistory:quotes,quoteAt:AT,now:AT,price,side:'PUT',durationMs:60000}),true);
 assert.equal(reviewH207UnifiedAdmission({...ctx,candidate:result,allowVerifiedEarlyReversal:true}).ready,true);
});
test('237: complete analyzer route gives the independent first-wave signal priority',()=>{
 const levels=[z()],candleLevelMap=map(levels);
 const st={candles:65,averages:[],zones:[],tolerance:TOL,atr:TOL,
  periodMs:60000,candleLevelMap,asOf:AT-60000};
 const result=analyzeNowOpportunity({
  quoteHistory:quotes,quoteAt:AT,now:AT,price,
  durationMs:60000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',
  entryFamily:'automatic',candles:[],structureCache:{get:()=>st}
 });
 assert.equal(result.ready,true,'shared analyzer must issue qualified first-wave reversal');
 assert.equal(result.side,'PUT');
 assert.equal(result.reason,'confirmed-level-structure-reversal');
});

test('237: the same first-wave recognition works for CALL at support while prior leg remains red',()=>{
 const mirror=p=>2.2-p,rows=quotes.map(q=>({...q,price:mirror(q.price)}));
 const level=z(),support={...level,level:mirror(level.level),
   low:mirror(level.high),high:mirror(level.low),
   resistancePivots:0,resistanceRejections:0,supportPivots:2,supportRejections:1};
 const baseline={...original,side:'PUT',entryPrice:mirror(price)};
 const changed=reviewFirstWaveCounterturn({...ctx,candidate:baseline,
  quoteHistory:rows,price:mirror(price),map:map([support])});
 assert.equal(changed.side,'CALL');
 assert.equal(changed.reason,'confirmed-level-structure-reversal');
 assert.equal(verifiedFirstQuoteTurnAtLevel({reversalEvidence:changed.priceStructure.confirmedReversal,
  quoteHistory:rows,quoteAt:AT,now:AT,price:mirror(price),side:'CALL',durationMs:60000}),true);
});
test('237: multiple supporting same-direction levels corroborate, never cancel',()=>{
 const result=reviewFirstWaveCounterturn({...ctx,map:map([z(),z(.000008)])});
 assert.equal(result.side,'PUT');
 assert.equal(result.ready,true);
});
test('237: no guessed reversal from bare extreme or from missing historical proof',()=>{
 const rising=quotes.map(q=>({...q}));
 rising[rising.length-2].price=peak+.00001;
 rising[rising.length-1].price=peak+.00002;
 const noRetreat=reviewFirstWaveCounterturn({...ctx,quoteHistory:rising,
  price:rising.at(-1).price,map:map([z()])});
 assert.equal(noRetreat.side,'CALL');
 const unverified=z();
 unverified.resistancePivots=0;unverified.resistanceRejections=0;
 const noRole=reviewFirstWaveCounterturn({...ctx,map:map([unverified])});
 assert.equal(noRole.side,'CALL');
 const stale=reviewFirstWaveCounterturn({...ctx,map:map([z()]),now:AT+2400});
 assert.equal(stale.side,'CALL');
 const invalidated=z();
 invalidated.high=peak-.00012;
 invalidated.low=peak-.00022;
 invalidated.level=peak-.00017;
 const noFakeLevel=reviewFirstWaveCounterturn({...ctx,map:map([invalidated])});
 assert.equal(noFakeLevel.side,'CALL');
});
test('237: old native expiry and other durations remain unchanged',()=>{
 for(const durationMs of [30000,300000]){
  assert.deepEqual(reviewFirstWaveCounterturn({...ctx,durationMs,map:map([z()])}),original);
 }
 const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
 const native=readFileSync(new URL('worker/broker-native-expiry-keeper.mjs',root),'utf8');
 const engine=readFileSync(new URL('src/core/now-opportunity-engine.mjs',root),'utf8');
 assert.match(native,/defaultRollback=current===30000&&preferredMs!==30000/);
 assert.ok(engine.indexOf('const firstWave=reviewFirstWaveCounterturn')>
   engine.indexOf('const impulseTurn=reviewFirstImpulseReversal'));
 assert.ok(engine.indexOf('const firstWave=reviewFirstWaveCounterturn')<
   engine.indexOf('const located=reviewFreshPullbackContinuation'));
});
