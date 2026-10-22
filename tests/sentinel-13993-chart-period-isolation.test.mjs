import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const src=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

for(const provider of ['exnova','iq_option']){
 test(provider+': modern NOW clears an inherited 30-second secondary history period',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'unused-broker-period-test'});
  const state=driver.state(provider);
  state.activeId=76;state.symbol='EUR/GBP OTC';state.uiSymbol='EUR/GBP OTC';
  state.candleSize=60;state.expirationDurationMs=120000;
  driver.setPredictionPeriod(provider,30);
  assert.equal(state.predictionPeriod,30);
  driver.setPredictionPeriod(provider,null);
  assert.equal(state.predictionPeriod,null);
  let requests=0;
  driver.directFeed=async()=>{requests++;throw Error('should not request secondary candles')};
  const outcome=await driver.refreshPredictionHistory(provider,Date.now());
  assert.equal(outcome,false);
  assert.equal(requests,0);
  assert.equal(state.candleSize,60,'preserve base 1-minute candles');
  assert.equal(state.expirationDurationMs,120000,'never change broker option expiry');
 });
 test(provider+': older explicitly configured forecast period still uses an isolated read-only request',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'unused-broker-period-test'}),state=driver.state(provider);
  state.activeId=76;state.uiSymbol='EUR/GBP OTC';state.candleSize=60;
  driver.setPredictionPeriod(provider,30);
  const requests=[];
  driver.directFeed=async()=>({ready:true,serverTimeSeconds:()=>Math.floor(Date.now()/1000),
    request:async q=>{requests.push(q);return {name:'candles',msg:{}}}});
  const ok=await driver.refreshPredictionHistory(provider,Date.now());
  assert.equal(ok,true);
  assert.equal(requests.length,1);
  assert.equal(requests[0].msg.body.size,30);
  assert.equal(requests[0].name,'sendMessage');
  assert.equal(requests[0].msg.name,'get-candles');
 });
}
test('healthy feed never sends a periodic chart/candle refresh; a stale feed still recovers',async()=>{
 const driver=new LocalPlaywrightDriver({dataDir:'unused-broker-period-test'});
 const st=driver.state('exnova'),now=Date.now();
 st.activeId=76;st.candleActiveId=76;st.symbol='EUR/GBP OTC';st.uiSymbol=st.symbol;
 st.balance=87;st.balanceId=10;st.mode='demo';
 st.candles=Array.from({length:80},(_,i)=>({
  from:now-(80-i)*60000,to:now-(79-i)*60000,
  open:1.123,close:1.123,high:1.124,low:1.122
 }));
 st.quote=1.123;st.lastQuoteAt=now;st.lastCandleAt=now;
 st.lastFullDomAt=now;st.lastBaseRequestAt=now;
 st.lastCandleRequest={at:now-40000};
 let requests=0;
 driver.requestMarketData=async()=>{requests++;return true};
 driver.refreshPredictionHistory=async()=>false;
 await driver.maintain('exnova');
 assert.equal(requests,0,'fully healthy stream should NOT request candle history every 30s');
 // A genuinely stale quote enables the existing recovery path.
 st.lastMaintainAt=0;st.lastQuoteAt=now-12000;
 await driver.maintain('exnova');
 assert.equal(requests,1,'broken/stale quote requires fresh market data');
});
test('local worker disables auxiliary period only when the real-time NOW analyst is active',()=>{
 const script=src('sentinel-trading-lab/agent/worker/index.mjs');
 assert.match(script,/runtime\.settings\.engine\?null:runtime\.lastResult\?\.analysis\?\.predictionInputQuality\?\.periodSeconds/);
 assert.match(script,/driver\.setPredictionPeriod\?\.\(activeProvider,/);
 // The visible broker retains its own native interval and native expiry.
 assert.match(script,/await runtime\.tick\(loopNow,\{skipStatus:true\}\)/);
 const driver=src('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 assert.match(driver,/setPredictionPeriod\(provider,period\)/);
 assert.match(driver,/if\(period==null\)\{this\.state\(provider\)\.predictionPeriod=null;return\}/);
 assert.match(driver,/size=Number\(st\.predictionPeriod\)/);
 assert.match(driver,/if\(!size\|\|size===Number\(st\.candleSize\)/);
 assert.match(driver,/const size=Number\(st\.candleSize\|\|60\)/);
 assert.match(driver,/const needHistoryRecovery=st\.candles\.length<50\|\|stale\|\|\(!streamingHealthy&&historyDue\)/);
});
