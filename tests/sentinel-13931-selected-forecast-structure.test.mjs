import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
const quotes=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
// Real recorded prices, but CONTROLLED historical zones and selector state.
// This isolates the integration contract; it does not reconstruct the
// user's unseen candles or establish a market-accuracy improvement.
function scenario(index,level){
 const quoteHistory=quotes.slice(0,index+1),q=quoteHistory.at(-1);
 const tolerance=Math.max(Math.abs(q.price-level)/2.8,.000002);
 const structure={candles:100,periodMs:60000,atr:tolerance*10,tolerance,
  averages:[{period:20,value:level+.01,slope:0}],
  zones:[{low:level,high:level,level,touches:1,pivots:1,ages:[50]}]};
 const selector=new CompletedExpiryDirection();selector.reset('controlled');
 selector.completed=5;selector.loss={base:.8,wide:.1};
 const args={quoteHistory,price:q.price,quoteAt:q.ts,now:q.ts,durationMs:30000,
  engineId:'automatic',qualityPolicy:'adaptive-market-v17',
  expiryDirectionContext:'controlled',expiryDirectionSelector:selector,
  structureCache:{get:()=>structure}};
 assert.equal(thirtySecondCycleForecast(args).side,'CALL');
 assert.equal(thirtySecondCycleForecast({...args,periodSearch:'wide'}).side,'PUT');
 return analyzeNowOpportunity(args);
}
test('historical rejection cannot override the selected wide projection using the discarded narrow one',()=>{
 const result=scenario(161,.843035);
 assert.equal(result.priceStructure.reaction.side,'CALL');
 assert.equal(result.ready,false);assert.equal(result.side,null);
 assert.equal(result.reason,'historical-level-versus-expiry-conflict');
});
test('a reaction agreeing with the selected wide projection is not vetoed by the discarded narrow one',()=>{
 // Preserved 30s reference: the audited 60s extreme protection must
 // never change this independently observed short-expiry entry.
 const result=scenario(952,.842955);
 assert.equal(result.priceStructure.reaction.side,'PUT');
 assert.equal(result.ready,true);assert.equal(result.side,'PUT');
 assert.equal(result.reason,'historical-level-rejection');
});
