import test from 'node:test';
import assert from 'node:assert/strict';
import {FORECAST_DURATION_PRESETS,expiryDrivenForecast,expiryForecastIdentity} from '../sentinel-trading-lab/agent/src/core/expiry-driven-forecast.mjs';
const t=1800000000000;
test('every selected expiry is its own future outcome, including 5s/10s/15s Blitz',()=>{
  for(const seconds of FORECAST_DURATION_PRESETS){
    const x=expiryDrivenForecast({selectedSeconds:seconds,now:t});
    assert.equal(x.forecastHorizonMs,seconds*1000);
    assert.equal(x.forecastHorizonSeconds,seconds);
    assert.equal(x.expiresAt,t+seconds*1000);
    assert.equal(x.source,'user-selection');
    assert.equal(x.durationMismatch,false);
  }
});
test('60s and 1 minute are the same horizon, not separate independent forecasts',()=>{
 assert.equal(expiryDrivenForecast({selectedSeconds:60,now:t}).forecastHorizonSeconds,60);
});
test('5-second Blitz never silently uses a 30-second forecast',()=>{
 const x=expiryDrivenForecast({selectedSeconds:5,brokerInstrument:'Blitz',brokerAvailableSeconds:[5,10,15,30],now:t});
 assert.equal(x.forecastHorizonMs,5000);
 assert.equal(x.selectionAvailable,true);
 assert.match(expiryForecastIdentity({engine:'automatic',provider:'iq_option',asset:'EUR/USD OTC',instrument:'Blitz',forecast:x}),/vnext-user-expiry-v1/);
 assert.notEqual(expiryForecastIdentity({engine:'automatic',forecast:x}),expiryForecastIdentity({engine:'automatic',forecast:expiryDrivenForecast({selectedSeconds:30,now:t})}));
});
test('verified broker duration is a diagnostic, never overrides user forecast',()=>{
 const x=expiryDrivenForecast({selectedSeconds:30,brokerVerified:true,brokerDurationMs:10000,brokerInstrument:'blitz',now:t});
 assert.equal(x.forecastHorizonSeconds,30);
 assert.equal(x.targetAt,t+30000);
 assert.equal(x.durationMismatch,true);
 assert.equal(x.observedBrokerDurationMs,10000);
 assert.equal(x.reason,'broker-observation-differs-from-selected-expiration');
});
test('broker deadline never silently replaces the chosen 60s future target',()=>{
 const a=expiryDrivenForecast({selectedSeconds:60,brokerVerified:true,brokerExpiresAt:t+17000,now:t});
 const b=expiryDrivenForecast({selectedSeconds:60,brokerVerified:true,brokerExpiresAt:t+17000,now:t+4000});
 assert.equal(a.forecastHorizonSeconds,60);
 assert.equal(b.forecastHorizonSeconds,60);
 assert.equal(a.targetAt,t+60000);
 assert.equal(b.targetAt,t+64000);
 assert.equal(a.deadlineMismatch,true);
 assert.equal(a.source,'user-selection');
});
test('past broker deadline does not cancel a requested independent forecast',()=>{
 const x=expiryDrivenForecast({selectedSeconds:30,brokerVerified:true,brokerExpiresAt:t-10,now:t});
 assert.equal(x.forecastHorizonMs,30000);
 assert.equal(x.expired,false);
 assert.equal(x.reason,'broker-observation-differs-from-selected-expiration');
});
test('broker availability varies; do not invent eligibility for 5s',()=>{
 const x=expiryDrivenForecast({selectedSeconds:5,brokerInstrument:'blitz',brokerAvailableSeconds:[30,60],now:t});
 assert.equal(x.selectionAvailable,false);
 assert.equal(x.reason,'broker-availability-observation-differs');
 const unknown=expiryDrivenForecast({selectedSeconds:5,brokerAvailableSeconds:null,now:t});
 assert.equal(unknown.selectionAvailable,null);
});
test('unverified broker fields cannot silently override a selected expiration',()=>{
 const x=expiryDrivenForecast({selectedSeconds:10,brokerVerified:false,brokerDurationMs:60000,brokerExpiresAt:t+60000,now:t});
 assert.equal(x.forecastHorizonSeconds,10);
 assert.equal(x.source,'user-selection');
});
test('model calibration distinguishes selected motor, broker, asset and expiration',()=>{
 const p=expiryDrivenForecast({selectedSeconds:15,now:t});
 const a=expiryForecastIdentity({engine:'automatic',provider:'iq_option',asset:'EUR/USD',forecast:p});
 assert.notEqual(a,expiryForecastIdentity({engine:'mean_reversion',provider:'iq_option',asset:'EUR/USD',forecast:p}));
 assert.notEqual(a,expiryForecastIdentity({engine:'automatic',provider:'exnova',asset:'EUR/USD',forecast:p}));
 assert.notEqual(a,expiryForecastIdentity({engine:'automatic',provider:'iq_option',asset:'USD/JPY',forecast:p}));
 assert.notEqual(a,expiryForecastIdentity({engine:'automatic',provider:'iq_option',asset:'EUR/USD',forecast:expiryDrivenForecast({selectedSeconds:10,now:t})}));
});
