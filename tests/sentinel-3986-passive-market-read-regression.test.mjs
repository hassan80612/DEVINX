import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';

for(const provider of ['iq_option','exnova']){
  const setup=()=>{
    const d=new LocalPlaywrightDriver({dataDir:'unused-passive-3986'});
    const st=d.state(provider);
    st.symbol='EUR/USD OTC';st.uiSymbol=st.symbol;st.uiSymbolSource='dom-active';
    st.candleSize=120;st.expirationDurationMs=300000;st.expirationRaw='5m';
    return {d,st};
  };
  test(provider+': native catalog identifies active symbol without broker requests',()=>{
    const {d,st}=setup();
    d.ingest(provider,{name:'initialization-data',
      msg:{actives:{'76':{name:'EURUSD-OTC'},'90':{name:'GBPUSD-OTC'}}}},'page-in');
    assert.equal(st.activeMap.get('EURUSDOTC'),76);
    assert.equal(st.activeId,76);
    assert.equal(st.symbol,'EUR/USD OTC');
    assert.equal(st.candleSize,120);assert.equal(st.expirationDurationMs,300000);
    d.ingest(provider,{name:'quote-generated',
      msg:{active_id:76,price:1.130275,time:Date.now()/1000}},'page-in');
    assert.equal(st.quote,1.130275);
    assert.equal(d.liveStatus(provider).quoteFeedValidated,true);
  });
  test(provider+': explicit symbol in native quote recovers active_id even without catalog',()=>{
    const {d,st}=setup();
    d.ingest(provider,{name:'quote-generated',msg:{
      active_id:76,symbol:'EUR/USD OTC',price:1.130275,time:Date.now()/1000}},'page-in');
    assert.equal(st.activeId,76);assert.equal(st.quote,1.130275);
    assert.equal(st.activeMap.get('EURUSDOTC'),76);
  });
  test(provider+': unknown active ID never becomes a blind signal',()=>{
    const {d,st}=setup();
    d.ingest(provider,{name:'quote-generated',msg:{
      active_id:999,price:1.130275,time:Date.now()/1000}},'page-in');
    assert.equal(st.activeId,null);
    assert.equal(st.quote,null);
    assert.equal(d.liveStatus(provider).quoteFeedValidated,false);
  });
  test(provider+': cold START can read 16 seconds of broker quotes without 50 historical candles',()=>{
    const {d,st}=setup();
    d.ingest(provider,{name:'initialization-data',msg:{actives:{
      '76':{name:'EURUSD-OTC'}}}},'page-in');
    const now=Date.now();
    for(let i=0;i<17;i++)d.ingest(provider,{name:'quote-generated',msg:{
      active_id:76,price:1.1302+i*.000001,time:(now-16000+i*1000)/1000}},'page-in');
    assert.equal(st.candles.length,0);
    assert.equal(st.quoteHistory.length,17);
    const live=d.liveStatus(provider);
    assert.equal(live.quoteFeedValidated,true);
    assert.equal(live.analysisFeedValidated,false,'old 50-candle path may still be collecting');
    const rt=new DemoTradingRuntime({enableVNext:true});
    rt.setExternalMarket(runtimeMarketFromLive(provider,live,live.symbol));
    const market=rt._marketSnapshot();
    assert.equal(market.waitingLive,false,'verified live quotes independently start NOW reading');
    assert.equal(market.feedValidated,true);
    assert.equal(market.quoteHistory.length,17);
  });
  test(provider+': old native WebSocket CDP accepts >120KB catalog but never changes period',async()=>{
    const {d,st}=setup(),listeners=new Map(),sent=[];
    const cdp={on:(event,fn)=>listeners.set(event,fn),send:async()=>{}};
    const page={on:(event,fn)=>listeners.set(event,fn),
      context:()=>({newCDPSession:async()=>cdp}),isClosed:()=>false};
    d.sessions.set(provider,{page});
    d.wsSend=async(_p,msg)=>{sent.push(msg);return {ok:false}};
    d.attachNetwork(provider,page);
    await page.__sentinelNetworkReady;
    const received=listeners.get('Network.webSocketFrameReceived');
    assert.equal(typeof received,'function');
    received({response:{opcode:1,payloadData:JSON.stringify({
      name:'initialization-data',msg:{actives:{'76':{name:'EURUSD-OTC'}},
      nonSensitivePadding:'x'.repeat(135000)}
    })}});
    assert.equal(st.activeId,76);
    received({response:{opcode:1,payloadData:JSON.stringify({name:'quote-generated',msg:{
      active_id:76,price:1.130275,time:Date.now()/1000}})}});
    assert.equal(st.quote,1.130275);
    await d.requestBaseData(provider);
    assert.equal(sent.length,0,'NO GET or period write with native broker open');
    assert.equal(st.candleSize,120);assert.equal(st.expirationDurationMs,300000);
    assert.equal(st.expirationRaw,'5m');
  });
}
