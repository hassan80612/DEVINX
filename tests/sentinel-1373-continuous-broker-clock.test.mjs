import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath,forwardRegime} from '../sentinel-trading-lab/agent/src/core/causal-interval-forecast-1371.mjs';
import {QuadcodeFeed} from '../sentinel-trading-lab/agent/worker/quadcode-feed.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {readBrokerTimingFromText} from '../sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs';

const T=1800000000000;
function series(kind='bear'){
 const out=[];
 for(let i=0;i<=320;i++){
  let trend=i*.000013;
  if(kind==='reversal'&&i>302)trend=302*.000013-(i-302)*.000090;
  else if(kind==='retracement'&&i>302)trend=302*.000013-(i-302)*.000002;
  out.push({ts:T+i*1000,receivedAt:T+i*1000,price:1.22-trend+Math.sin(i/5)*.000001});
 }
 return out;
}
test('continuous distinguishes sustained structural reversal from a small retracement',()=>{
 const now=T+320000;
 const baseline=causalForwardPath({quoteHistory:series(),asOf:now,holdingSeconds:30,maxSeconds:60});
 const reverse=causalForwardPath({quoteHistory:series('reversal'),asOf:now,holdingSeconds:30,maxSeconds:60});
 const retrace=causalForwardPath({quoteHistory:series('retracement'),asOf:now,holdingSeconds:30,maxSeconds:60});
 assert.equal(baseline.status,'causal-forward-path');
 assert.equal(reverse.status,'causal-forward-path');
 assert.equal(reverse.regime,'reversal',JSON.stringify(reverse));
 assert.notEqual(retrace.regime,'reversal','a tiny bounce is not structural evidence');
 const b=Math.log(baseline.priceAt(60)/baseline.priceAt(30));
 const r=Math.log(reverse.priceAt(60)/reverse.priceAt(30));
 assert.ok(r>b,JSON.stringify({baseline:b,reversal:r}));
});
test('false Digital switch from background page get-candles cannot select OTC by active_id',()=>{
 const d=new LocalPlaywrightDriver();
 const st=d.state('iq_option');
 st.symbol='EUR/USD';st.uiSymbol='EUR/USD';st.activeId=101;st.candleActiveId=101;
 st.activeMap.set('EURUSD',101);st.activeMap.set('EURUSDOTC',202);
 st.assets.add('EUR/USD');st.assets.add('EUR/USD OTC');
 d.ingest('iq_option',{name:'sendMessage',msg:{name:'get-candles',body:{active_id:202,size:60}},request_id:'page-bg'},'page-out');
 assert.equal(st.symbol,'EUR/USD');
 assert.equal(st.activeId,101);
 assert.equal(st.pendingPageActiveId,202);
});
test('authenticated timeSync calibrates the broker clock; stale or forged time is not synchronized',()=>{
 const q=new QuadcodeFeed({onFrame:()=>{}});
 q.ws={readyState:1};q.authenticated=true;
 q._handleMessage(JSON.stringify({name:'timeSync',msg:Date.now()-18000}));
 const clock=q.brokerClock();
 assert.equal(clock.verified,true,JSON.stringify(clock));
 assert.ok(Math.abs(clock.offsetMs+18000)<1000);
 const first=q.serverTime;
 q._handleMessage(JSON.stringify({name:'timeSync',msg:Date.now()+2000000}));
 assert.equal(q.serverTime,first,'far-future broker time cannot replace calibrated clock');
 q.serverTimeReceivedAt=Date.now()-125000;
 assert.equal(q.brokerClock().verified,false);
});
test('visible broker time is explicit and does not impersonate a prediction deadline',()=>{
 const timing=readBrokerTimingFromText('CURRENT TIME: 12:05:06\nPURCHASE TIME: 00:25\nEXPIRATION: 12:06',
  {nowMs:T,instrumentKind:'digital'});
 assert.equal(timing.brokerClock.verified,true);
 assert.equal(timing.brokerClock.clockSeconds,12*3600+5*60+6);
 assert.equal(timing.selectedExpiration.kind,'fixed-clock');
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/data-sentinel-broker-clock-status/);
 assert.doesNotMatch(driver,/shown=pad\(Math\.floor\(secondsLeft\/60\)\)/);
 assert.match(driver,/const instrumentKind=\/\\bblitz\\b\/i\.test/);
});
