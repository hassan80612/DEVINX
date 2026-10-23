import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

// No live broker is contacted. A mock CDP client reproduces an already-open
// traderoom's real WebSocket frames, which Playwright itself may miss.
function setup(provider){
 const d=new LocalPlaywrightDriver({dataDir:'unused-native-chart-passive-test'});
 const listeners=new Map();
 const cdp={on:(name,fn)=>listeners.set(name,fn),send:async()=>{}};
 let closed=false;
 const page={on:(name,fn)=>listeners.set(name,fn),
  context:()=>({newCDPSession:async()=>cdp}),
  isClosed:()=>closed};
 d.sessions.set(provider,{page});
 const st=d.state(provider);
 st.activeId=76;st.uiSymbol='EUR/USD OTC';st.symbol=st.uiSymbol;
 st.activeMap.set('EURUSDOTC',76);
 // Native chart is healthy only with an actual account-ID-bound balance
 // observed from the broker, not a bare figure typed into state.
 d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:50}]},'page-in');
 return {d,st,page,listeners,closePage:()=>{closed=true}};
}
for(const provider of ['iq_option','exnova']){
// The request concerns exactly 30s, 60s, 2m and 5m expiry,
 // NOT 10 minutes. 10 seconds remains an existing short-term setting.
 for(const seconds of [30,60,120,300]){
  test(provider+': selected '+seconds+'s expiry and chart interval survive Agent refresh',async()=>{
   const {d,st}=setup(provider);
   const savedChart=seconds, savedExpiry=seconds*1000;
   st.candleSize=savedChart;
   st.expirationDurationMs=savedExpiry;
   st.expirationRaw=String(seconds)+'s';
   let sent=0;
   d.directFeed=async()=>{sent++;return {ready:true,
     send:()=>true,request:async()=>({})}};
   await d._requestCandles(provider,{symbol:st.symbol,activeId:76,force:true});
   await d.requestQuoteHistory(provider,{symbol:st.symbol,activeId:76});
   st.predictionPeriod=30;
   await d.refreshPredictionHistory(provider);
   await d.requestBaseData(provider);
   const write=await d.wsSend(provider,{name:'sendMessage',msg:{
    name:'get-candles',body:{active_id:76,size:30}}});
   assert.equal(write.ok,false);
   assert.equal(st.candleSize,savedChart);
   assert.equal(st.expirationDurationMs,savedExpiry);
   assert.equal(st.expirationRaw,String(seconds)+'s');
   assert.equal(sent,0);
  });
 }

 test(provider+': existing native socket emits usable live quotes without a second market subscription',async()=>{
  const {d,st,page,listeners}=setup(provider);
  await d.attachNetwork(provider,page);
  await page.__sentinelNetworkReady;
  const send=listeners.get('Network.webSocketFrameReceived');
  assert.equal(typeof send,'function');
  const now=Date.now();
  send({response:{opcode:1,payloadData:JSON.stringify({name:'quote-generated',
   msg:{active_id:76,price:1.12345,time:now/1000}})}});
  assert.equal(st.quote,1.12345);
  assert.ok(st.quoteHistory.length>0,'CDP must forward price frames from old sockets');
  assert.ok(st.lastQuoteAt>0);
 });
 test(provider+': maintenance, refresh and explicit candle-recovery cannot rewrite native chart or option period',async()=>{
  const {d,st}=setup(provider);
  let messages=0;
  d.directFeed=async()=>{messages++;return {ready:true,
   send:()=>true,request:async()=>({name:'candles'})}};
  st.candleSize=120;st.predictionPeriod=30;
  assert.equal(d.nativeChartOpen(provider),true);
  assert.equal(await d._requestCandles(provider,{symbol:st.symbol,activeId:76,force:true}),false);
  assert.equal(await d.requestQuoteHistory(provider,{symbol:st.symbol,activeId:76}),false);
  assert.equal(await d.refreshPredictionHistory(provider),false);
  const attempted=await d.wsSend(provider,{
   name:'sendMessage',msg:{name:'get-candles',version:'2.0',body:{active_id:76,size:30}}
  });
  assert.equal(attempted.ok,false);
  assert.equal(await d.requestBaseData(provider),true);
  assert.equal(st.candleSize,120,'native timeframe must not be assigned by Agent');
  assert.equal(messages,0,'NO Agent-owned broker websocket for healthy native chart');
 });
 test(provider+': stale candle history must not trigger repeated broker market writes',async()=>{
  const {d,st}=setup(provider);
  let outbound=0;
  st.candles=[];st.lastMaintainAt=0;st.lastFullDomAt=Date.now();
  st.lastBaseRequestAt=Date.now();
  d.domSnapshot=async()=>({});
  d.requestMarketData=async()=>{outbound++;return false};
  d.refreshPredictionHistory=async()=>false;
  d.liveStatus=()=>({provider});
  await d.maintain(provider);
  assert.equal(outbound,0);
 });
 test(provider+': a genuinely closed page does not permanently block recovery',async()=>{
  const {d,closePage}=setup(provider);
  closePage();
  assert.equal(d.nativeChartOpen(provider),false);
  d.directFeed=async()=>({ready:true,send:()=>true});
  assert.equal((await d.wsSend(provider,{
   name:'sendMessage',msg:{name:'get-candles',body:{active_id:76,size:30}}
  })).ok,true);
 });
}
