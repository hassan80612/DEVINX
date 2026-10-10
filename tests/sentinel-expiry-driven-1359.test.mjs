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
 assert.match(expiryForecastIdentity({engine:'automatic',provider:'iq_option',asset:'EUR/USD OTC',instrument:'Blitz',forecast:x}),/vnext-expiry-driven/);
 assert.notEqual(expiryForecastIdentity({engine:'automatic',forecast:x}),expiryForecastIdentity({engine:'automatic',forecast:expiryDrivenForecast({selectedSeconds:30,now:t})}));
});
test('an eligible broker-verified duration supersedes an out-of-sync manual setting transparently',()=>{
 const x=expiryDrivenForecast({selectedSeconds:30,brokerVerified:true,brokerDurationMs:10000,brokerInstrument:'blitz',now:t});
 assert.equal(x.forecastHorizonSeconds,10);
 assert.equal(x.durationMismatch,true);
 assert.equal(x.reason,'broker-expiration-differs-from-selection');
});
test('when broker gives exact clock deadline, predict remaining time and never pretend nominal minute remains',()=>{
 const a=expiryDrivenForecast({selectedSeconds:60,brokerVerified:true,brokerExpiresAt:t+17000,now:t});
 const b=expiryDrivenForecast({selectedSeconds:60,brokerVerified:true,brokerExpiresAt:t+17000,now:t+4000});
 assert.equal(a.forecastHorizonSeconds,17);
 assert.equal(b.forecastHorizonSeconds,13);
 assert.equal(b.expiresAt,t+17000);
 assert.equal(a.source,'broker-deadline');
});
test('past broker expiration cannot spawn a new future prediction',()=>{
 const x=expiryDrivenForecast({selectedSeconds:30,brokerVerified:true,brokerExpiresAt:t-10,now:t});
 assert.equal(x.forecastHorizonMs,null);
 assert.equal(x.expired,true);
 assert.equal(x.reason,'broker-expiration-passed');
});
test('broker availability varies; do not invent eligibility for 5s',()=>{
 const x=expiryDrivenForecast({selectedSeconds:5,brokerInstrument:'blitz',brokerAvailableSeconds:[30,60],now:t});
 assert.equal(x.selectionAvailable,false);
 assert.equal(x.reason,'selected-expiration-not-offered-by-broker');
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
