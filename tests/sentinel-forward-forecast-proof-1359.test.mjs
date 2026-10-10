import test from 'node:test';
import assert from 'node:assert/strict';
import {recordForwardForecast,evaluateForwardForecast} from '../sentinel-trading-lab/agent/src/core/forward-forecast-receipt.mjs';
import {selectedEngineForecastRequest} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
const now=1800000000000;
function request(seconds,engine='automatic'){
 const q=selectedEngineForecastRequest({settings:{engine,orderDurationMs:seconds*1000,forecastHorizonSeconds:3600},broker:{instrument:'blitz'},now,asset:'EUR/USD OTC',provider:'iq_option'});
 return {...q,asset:'EUR/USD OTC',provider:'iq_option'};
}
const prediction={side:'CALL',projectedPrice:1.1009,expectedLow:1.1001,expectedHigh:1.1014,
 expectedPath:[{secondsFromNow:2,price:1.1003},{secondsFromNow:5,price:1.1009}],modelConfidence:72,evidence:['prior trend','near support']};
const quote={at:now-25,price:1.1000};
test('a timer or direction-only status is never a real future prediction',()=>{
 assert.equal(recordForwardForecast({request:request(5),referenceQuote:quote,prediction:{side:'CALL'},createdAt:now}).status,'no-measurable-forward-forecast');
 assert.equal(recordForwardForecast({request:request(10),referenceQuote:quote,prediction:{},createdAt:now}).status,'no-measurable-forward-forecast');
});
test('Blitz 5s model forecasts a measurable price and marks true time and reference quote',()=>{
 const x=recordForwardForecast({request:request(5),referenceQuote:quote,prediction,createdAt:now});
 assert.equal(x.status,'forecast-created');
 assert.equal(x.actionable,false);
 assert.equal(x.receipt.targetAt,now+5000);
 assert.equal(x.receipt.quoteAgeAtForecastMs,25);
 assert.equal(x.receipt.projectedPrice,1.1009);
 assert.deepEqual(x.receipt.expectedPath,[{secondsFromNow:2,price:1.1003},{secondsFromNow:5,price:1.1009}]);
 assert.equal(x.receipt.predictionStatus,'unverified');
 assert.ok(Object.isFrozen(x.receipt));assert.ok(Object.isFrozen(x.receipt.expectedPath));
});
test('all requested horizons must have their own pinned future outcome',()=>{
 for(const seconds of [5,10,15,30,45,60,120,180,300,600,900]){
  const o=recordForwardForecast({request:request(seconds,'mean_reversion'),referenceQuote:quote,prediction,createdAt:now});
  assert.equal(o.receipt.targetAt,now+seconds*1000);
  assert.equal(o.receipt.expirySeconds,seconds);
  assert.equal(o.receipt.engineId,'mean_reversion');
 }
});
test('a reversal between now and expiration cannot rewrite original forecast side',()=>{
 const p={...prediction,expectedPath:[]};
 const x=recordForwardForecast({request:request(15),referenceQuote:quote,prediction:p,createdAt:now});
 p.side='PUT';p.projectedPrice=1.0991;
 assert.equal(x.receipt.side,'CALL');
 assert.equal(x.receipt.projectedPrice,1.1009);
 assert.equal(evaluateForwardForecast({receipt:x.receipt,actualQuote:{at:now+16000,price:1.098}}).correct,false);
});
test('do not pretend accuracy before future price arrives or when quote misses target timestamp',()=>{
 const x=recordForwardForecast({request:request(5),referenceQuote:quote,prediction,createdAt:now}).receipt;
 assert.equal(evaluateForwardForecast({receipt:x,actualQuote:{at:now+4990,price:1.102}}).status,'awaiting-future-outcome');
 assert.equal(evaluateForwardForecast({receipt:x,actualQuote:{at:now+8000,price:1.102}}).status,'outcome-not-verifiable');
 assert.equal(evaluateForwardForecast({receipt:x,actualQuote:{at:now+5500,price:1.102}}).verified,true);
});
test('market outcome records correct/incorrect direction and projected-price error, not fabricated win rate',()=>{
 const x=recordForwardForecast({request:request(10),referenceQuote:quote,prediction,createdAt:now}).receipt;
 const y=evaluateForwardForecast({receipt:x,actualQuote:{at:now+10500,price:1.0995}});
 assert.equal(y.verified,true);
 assert.equal(y.source,'market-quote-not-broker-settlement');
 assert.equal(y.correct,false);
 assert.equal(y.actualSide,'PUT');
 assert.equal(y.inProjectedRange,false);
 assert.ok(y.predictionError<0);
 assert.equal(y.observedPrice,1.0995);
});
test('ties are not wins, and unknown quote quality never manufactures a win',()=>{
 const x=recordForwardForecast({request:request(30),referenceQuote:quote,prediction,createdAt:now}).receipt;
 const draw=evaluateForwardForecast({receipt:x,actualQuote:{at:now+30030,price:1.1}});
 assert.equal(draw.actualSide,'DRAW');assert.equal(draw.correct,null);
 assert.equal(evaluateForwardForecast({receipt:x,actualQuote:{at:now+30030,price:null}}).verified,false);
});
test('no missing/late quote or future quote may silently become reference price',()=>{
 assert.equal(recordForwardForecast({request:request(5),referenceQuote:{at:now+1,price:1.1},prediction,createdAt:now}).status,'missing-forecast-input');
 assert.equal(recordForwardForecast({request:request(5),referenceQuote:{at:now-10,price:null},prediction,createdAt:now}).status,'missing-forecast-input');
});
