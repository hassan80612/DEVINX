import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';
import {readFileSync} from 'node:fs';


test('broker market frames are read passively and update live prices without broker interference',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const pageEvents=[],wsEvents={};
  const page={on(name,fn){pageEvents.push({name,fn});}};
  driver.attachNetwork('iq_option',page);
  driver.attachNetwork('iq_option',page);
  assert.deepEqual(pageEvents.map(e=>e.name),['websocket']);
  pageEvents[0].fn({on(name,fn){wsEvents[name]=fn;}});
  assert.deepEqual(Object.keys(wsEvents).sort(),['framereceived','framesent']);
  assert.equal(driver.state('iq_option').pageNetworkTap,'read-only-quote-observer');
  const st=driver.state('iq_option');
  st.symbol='EUR/USD OTC';st.uiSymbol='EUR/USD OTC';st.activeId=76;
  st.activeMap.set('EURUSDOTC',76);st.activeMap.set('GBPUSDOTC',77);st.assets.add('GBP/USD OTC');
  wsEvents.framesent({payload:JSON.stringify({name:'sendMessage',msg:{name:'get-candles',version:'2.0',body:{active_id:77,size:60}}})});
  assert.equal(st.activeId,77);
  assert.equal(st.symbol,'GBP/USD OTC');
  // Previously, a healthy but unrelated direct feed heartbeat suppressed
  // the broker's own live quotes. They must now always be considered.
  driver.feeds.set('iq_option',{ready:true,authenticated:true,lastMessageAt:Date.now()});
  st.quote=1.12345;st.lastQuoteAt=Date.now()-9500;
  const now=Date.now();
  wsEvents.framereceived({payload:JSON.stringify({name:'quote-generated',msg:[{active_id:77,price:1.1255,time:Math.floor(now/1000)}]})});
  assert.equal(st.quote,1.1255);
  assert.ok(now-st.lastQuoteAt<1000,'live quote must update from the broker page');
  assert.equal(st.quoteHistory.at(-1).price,1.1255);
  const oldTimestamp=st.lastQuoteAt;
  wsEvents.framereceived({payload:JSON.stringify({name:'quote-generated',msg:[{active_id:76,price:9.999,time:Math.floor(now/1000)}]})});
  assert.equal(st.lastQuoteAt,oldTimestamp,'another active_id must never change the quote');
});

test('historical responses do not fake a recent quote for the trading signal',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option');
  st.activeId=76;st.candleActiveId=76;st.symbol='EUR/USD OTC';
  st.quote=1.12345;st.lastQuoteAt=Date.now()-9500;
  const oldTs=st.lastQuoteAt,now=Math.floor(Date.now()/1000);
  const candles=Array.from({length:60},(_,i)=>({from:now-(60-i)*60,to:now-(59-i)*60,open:1.12345,close:1.12345,low:1.12345,high:1.12345}));
  driver.ingest('iq_option',{name:'candles',msg:{active_id:76,candles}},'direct-in');
  assert.equal(st.candles.length,60);
  assert.equal(st.lastQuoteAt,oldTs,'historical get-candles must not refresh the live quote timestamp');
});
test('an independent direct feed still updates the correct market quote',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option');
  st.activeId=76;st.symbol='EUR/USD OTC';
  driver.ingest('iq_option',{name:'quote-generated',msg:[{active_id:76,price:1.123456,time:1791580300}]},'direct-in');
  assert.equal(st.quote,1.123456);
  assert.equal(st.quoteHistory.at(-1).price,1.123456);
  assert.equal(st.lastQuoteAt,1791580300000);
});

test('a missing direct feed never injects requests into the broker page',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  driver.directFeed=async()=>null;
  assert.deepEqual(await driver.wsSend('iq_option',{name:'get-balances'}),{ok:false,error:'direct_market_feed_unavailable'});
  let called=false;
  driver.directFeed=async()=>({ready:true,send:()=>{called=true;return true;}});
  assert.deepEqual(await driver.wsSend('iq_option',{name:'get-balances'}),{ok:true,transport:'direct-websocket'});
  assert.equal(called,true);
});

test('shutdown disposes only Agent-owned browser context and market feed',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const closed=[];
  driver.sessions.set('iq_option',{context:{close:async()=>{closed.push('context')}},browser:{close:async()=>{closed.push('browser')}},profileDir:null,normal:null,cdp:null});
  driver.feeds.set('iq_option',{close:async()=>{closed.push('feed')}});
  await driver.shutdown();
  await driver.shutdown();
  assert.deepEqual(closed.sort(),['browser','context','feed']);
  assert.equal(driver.sessions.size,0);
  assert.equal(driver.feeds.size,0);
});

test('validated non-OTC market candles unlock ANALYSIS without broker balance or mode',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option');
  const now=Math.floor(Date.now()/1000);
  st.activeId=77;st.candleActiveId=77;st.symbol='EUR/USD';st.uiSymbol='EUR/USD';
  st.quote=1.12345;st.lastQuoteAt=Date.now();st.balance=null;st.mode=null;
  st.candles=Array.from({length:60},(_,i)=>({
    from:now-(60-i)*60,to:now-(59-i)*60,
    open:1.12345,high:1.12345,low:1.12345,close:1.12345
  }));
  const live=driver.liveStatus('iq_option');
  assert.equal(live.assetValidated,true);
  assert.equal(live.analysisFeedValidated,true);
  assert.equal(live.feedValidated,false,'unverified account must remain execution-unsafe');
  const runtime=new DemoTradingRuntime();
  runtime.setExternalMarket(runtimeMarketFromLive('iq_option',live,'EUR/USD'));
  const snap=runtime._marketSnapshot();
  assert.equal(snap.waitingLive,false,'the analysis must not depend on account balance');
  assert.equal(snap.feedValidated,true);
  st.lastQuoteAt=Date.now()-25000;
  assert.equal(driver.liveStatus('iq_option').analysisFeedValidated,false,'stale quotes must block analysis');
  st.lastQuoteAt=Date.now();
  st.screenCandidateSymbol='GBP/USD';
  assert.equal(driver.liveStatus('iq_option').analysisFeedValidated,false,'unresolved instrument switch must block analysis');
});

test('digital/non-OTC selected tabs are adopted only after lightweight visual confirmation',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option');
  st.activeId=76;st.symbol='EUR/USD OTC';st.uiSymbol='EUR/USD OTC';
  st.activeMap.set('EURUSD',77);st.activeMap.set('EURUSDOTC',76);
  st.assets.add('EUR/USD');
  let reads=0;
  driver.sessions.set('iq_option',{page:{evaluate:async()=>{reads++;return ['EUR/USD']}}});
  driver.requestMarketData=async()=>true;
  assert.equal(driver.applyActiveSelection('iq_option',{symbol:'EUR/USD',source:'tab-click-hint'}),false);
  assert.equal(st.symbol,'EUR/USD OTC','do not switch to unverified click hints');
  await new Promise(resolve=>setTimeout(resolve,360));
  assert.equal(reads,1);
  assert.equal(st.symbol,'EUR/USD');
  assert.equal(st.activeId,77);
  assert.equal(st.screenCandidateSymbol,null);
});

test('card updates coalesce rather than hammering a slow broker renderer',async()=>{
  const calls=[];
  let release;
  const blocked=new Promise(resolve=>{release=resolve});
  const sched=new LatestOverlayScheduler(async(_,data)=>{
    calls.push(data);
    if(data==='first')await blocked;
  },{minIntervalMs:30,slowThresholdMs:500,slowCooldownMs:100});
  sched.publish('iq_option','first');
  await new Promise(resolve=>setTimeout(resolve,12));
  sched.publish('iq_option','obsolete-1');
  sched.publish('iq_option','obsolete-2');
  sched.publish('iq_option','newest');
  assert.deepEqual(calls,['first']);
  release();
  await new Promise(resolve=>setTimeout(resolve,85));
  assert.deepEqual(calls,['first','newest']);
  const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(driver,/__sentinelOverlayClock\s*=\s*setInterval/);
});

test('1s IQ Option candle stream keeps the market fresh without altering strategy candle history',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option');
  st.symbol='EUR/USD OTC';st.uiSymbol=st.symbol;st.activeId=76;st.candleActiveId=76;st.candleSize=60;
  const now=Math.floor(Date.now()/1000);
  st.candles=Array.from({length:60},(_,i)=>({from:now-(60-i)*60,to:now-(59-i)*60,open:1.12345,close:1.12345,high:1.12345,low:1.12345}));
  st.quote=1.12345;st.lastQuoteAt=Date.now()-10000;
  const oldCandles=JSON.stringify(st.candles);
  const tick={name:'candle-generated',msg:{active_id:76,size:1,from:now-1,to:now,open:1.12345,close:1.12348,high:1.12348,low:1.12345}};
  driver.ingest('iq_option',tick,'direct-in');
  assert.equal(st.quote,1.12348);
  assert.ok(Date.now()-st.lastQuoteAt<1500);
  assert.equal(st.lastTickQuoteAt,st.lastQuoteAt);
  assert.equal(JSON.stringify(st.candles),oldCandles,'1s candles must never pollute the 60s history');
  assert.equal(driver.liveStatus('iq_option').analysisFeedValidated,true);
  const lastTickAt=st.lastQuoteAt;
  driver.ingest('iq_option',{...tick,msg:{...tick.msg,active_id:77,close:4.56}},'direct-in');
  assert.equal(st.lastQuoteAt,lastTickAt,'ticks from other instruments must not update the active quote');
  assert.equal(st.quote,1.12348);
});

test('discard unsuccessful one-second feed subscriptions and preserve strategy history',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option'),outbound=[];
  st.symbol='EUR/USD OTC';st.uiSymbol=st.symbol;st.activeId=76;st.candleActiveId=76;st.candleSize=60;
  st.activeMap.set('EURUSDOTC',76);
  const now=Math.floor(Date.now()/1000);
  st.candles=Array.from({length:60},(_,i)=>({from:now-(60-i)*60,to:now-(59-i)*60,open:1.12345,close:1.12345,low:1.12345,high:1.12345}));
  st.quote=1.12345;st.lastQuoteAt=Date.now()-9000;
  driver.directFeed=async()=>null;
  driver.wsSend=async(_p,msg)=>{outbound.push(msg);return{ok:true}};
  await driver._requestCandles('iq_option',{symbol:st.symbol,activeId:76,force:true});
  assert.equal(outbound.filter(x=>x.name==='subscribeMessage'&&x.msg?.params?.routingFilters?.size===1).length,0);
  assert.ok(outbound.some(x=>x.name==='subscribeMessage'&&x.msg?.params?.routingFilters?.size===60));
});
