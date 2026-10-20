import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

function mockBroker(provider,healthy=true){
 const d=new LocalPlaywrightDriver(),st=d.state(provider),now=Date.now();
 const candleSize=60;
 Object.assign(st,{activeId:76,candleActiveId:76,symbol:'EUR/USD OTC',
  uiSymbol:'EUR/USD OTC',mode:'demo',balance:100,balanceId:10,quote:1.1,
  candleSize,lastQuoteAt:now-(healthy?100:5100),lastCandleAt:now,
  candles:Array.from({length:55},(_,i)=>({open:1.1,close:1.1,
   high:1.1,low:1.1,from:Math.floor(now/1000)-55*60+i*60,
   to:Math.floor(now/1000)-54*60+i*60})),
  lastFullDomAt:now-91000,lastBaseRequestAt:now-31000,
  lastCandleRequest:{at:now,activeId:76},predictionPeriod:candleSize
 });
 const calls={dom:0,base:0,candles:0,prediction:0};
 d.domSnapshot=async()=>{calls.dom++};
 d.requestBaseData=async()=>{calls.base++};
 d.requestMarketData=async()=>{calls.candles++};
 d.refreshPredictionHistory=async()=>{calls.prediction++};
 return{d,st,calls,now};
}
for(const provider of ['iq_option','exnova']){
 test(provider+': normal live quote+balance operation performs NO unnecessary heavy DOM scan or base requests at 90s',async()=>{
  const{d,calls}=mockBroker(provider,true);
  await d.maintain(provider);
  assert.equal(calls.dom,0,'avoid full 70k-character page DOM traversal');
  assert.equal(calls.base,0,'broker passive account feed replaces 30s base requests');
  assert.equal(calls.candles,0,'do not add market-history requests');
 });
 test(provider+': stale live quote immediately re-enables original full DOM and broker recovery checks',async()=>{
  const{d,calls}=mockBroker(provider,false);
  await d.maintain(provider);
  assert.equal(calls.dom,1,'stale broker gets original 90s full scan');
  assert.equal(calls.base,1,'stale broker gets original 30s base request retry');
 });
 test(provider+': missing account information retains original fast recovery behavior',async()=>{
  const{d,st,calls}=mockBroker(provider,true);
  st.balance=null;st.balanceId=null;st.lastFullDomAt=Date.now()-31000;
  st.lastBaseRequestAt=Date.now()-16000;
  await d.maintain(provider);
  assert.equal(calls.dom,1);
  assert.equal(calls.base,1);
 });
}
test('market tick/click path is independent of background maintenance and redundant mobile serialization',()=>{
 const source=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 assert.match(source,/function scheduleBrokerMaintenance\(provider\)\{[\s\S]{0,400}if\(executor\.executing\|\|uiExecutor\.attempt\)return/);
 const a=source.indexOf('const tickStarted=Date.now();');
 const before=source.slice(a-350,a);
 assert.doesNotMatch(before,/void publishLiveFrame\(\);/);
 const after=source.slice(a,a+300);
 assert.match(after,/await runtime\.tick\(loopNow,\{skipStatus:true\}\);\s*executor\.pulse\(\);[\s\S]*?void publishLiveFrame\(\);/);
 assert.match(source,/driver\.setMarketUpdateHandler\?\.\(/);
 assert.match(source,/const livePublishTimer=setInterval\(\(\)=>\{void publishLiveFrame\(\)\},220\)/);
});
