import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalPriceStructure,applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {applyCandleLevelRoute} from '../sentinel-trading-lab/agent/src/core/candle-level-map.mjs';
import {applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {terminalConflictPolicy} from '../experiments/terminal-conflict-policy-20261018.mjs';
const T=1792250000000;
function fixture(mirror=false){
 const flip=x=>mirror?220-x:x;
 const candles=Array.from({length:100},(_,i)=>{const c={from:T-(100-i)*60000,to:T-(99-i)*60000,open:107,close:106,high:110,low:i===79?90:i===97?100:103};return mirror?{...c,open:flip(c.open),close:flip(c.close),high:flip(c.low),low:flip(c.high)}:c;});
 const quoteHistory=[104,101,99,95,90,90.4,91.2].map((x,i)=>({ts:T-(6-i)*1000,price:flip(x)}));
 const input={quoteHistory,price:quoteHistory.at(-1).price,quoteAt:T,now:T,durationMs:30000},side=mirror?'CALL':'PUT',structure=historicalPriceStructure({candles,now:T});
 const candidate={ready:true,side,pendingForecast:{ready:true,side,predictedPrice:flip(80)},predictedPrice:flip(80)};
 const historical=applyHistoricalPriceStructure({candidate,structure,...input});
 const candle=applyCandleLevelRoute({candidate:historical,map:structure.candleLevelMap,...input});
 const final=applyObservedLevelSequence({candidate:candle,map:structure.candleLevelMap,...input});return{input,historical,candle,final};
}
for(const mirror of [false,true])test('actual chain reopens explicit forecast conflict '+(mirror?'PUT':'CALL'),()=>{
 const f=fixture(mirror);assert.equal(f.historical.ready,false);assert.equal(f.historical.reason,'historical-level-versus-expiry-conflict');assert.equal(f.historical.side,null);
 assert.equal(f.candle.ready,true);assert.equal(f.final.side,mirror?'PUT':'CALL');assert.equal(f.candle.reason,'multiscale-candle-rejection');
 const before=JSON.stringify(f),fixed=terminalConflictPolicy({...f,durationMs:30000});assert.equal(fixed.ready,false);assert.equal(fixed.side,null);assert.equal(JSON.stringify(f),before);
});
test('research rule preserves working non-conflict directions and other horizons',()=>{
 const final={ready:true,side:'CALL'};
 for(const reason of ['closed-structure-and-live-impulse','historical-level-pressure-unconfirmed','historical-level-rejection'])assert.equal(terminalConflictPolicy({historical:{ready:false,reason},final,durationMs:30000}),final);
 assert.equal(terminalConflictPolicy({historical:{ready:false,reason:'historical-level-versus-expiry-conflict'},final,durationMs:60000}),final);
});
test('unready final and resolved historical result pass through unchanged',()=>{
 const final={ready:false,side:null};assert.equal(terminalConflictPolicy({historical:{ready:false,reason:'historical-level-versus-expiry-conflict'},final,durationMs:30000}),final);
 const ready={ready:true,side:'PUT'};assert.equal(terminalConflictPolicy({historical:ready,final:ready,durationMs:30000}),ready);
});
test('terminal policy never changes a previously issued side or expiry',()=>{
 const f=fixture(),old=advanceNowOpportunity({candidate:{ready:true,side:'PUT',entryPrice:104,observedAt:T-5000},now:T-5000,quoteAt:T-5000,asset:'EUR/USD',durationMs:30000});
 const changed=terminalConflictPolicy({...f,durationMs:30000});const held=advanceNowOpportunity({previous:old,candidate:changed,now:T,quoteAt:T,asset:'EUR/USD',durationMs:30000});assert.equal(held.side,'PUT');assert.equal(held.exitAt,T+25000);assert.equal(held.entryReadyNow,false);
});
