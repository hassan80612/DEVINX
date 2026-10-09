import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

test('the broker page observes only outbound asset selections and never price frames',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const pageEvents=[],wsEvents={};
  const page={on(name,fn){pageEvents.push({name,fn});}};
  driver.attachNetwork('iq_option',page);
  driver.attachNetwork('iq_option',page);
  assert.deepEqual(pageEvents.map(e=>e.name),['websocket']);
  pageEvents[0].fn({on(name,fn){wsEvents[name]=fn;}});
  assert.deepEqual(Object.keys(wsEvents),['framesent']);
  assert.equal(driver.state('iq_option').pageNetworkTap,'outbound-asset-only');
  const st=driver.state('iq_option');
  st.symbol='EUR/USD OTC';st.uiSymbol='EUR/USD OTC';st.activeId=76;
  st.activeMap.set('EURUSDOTC',76);st.activeMap.set('GBPUSDOTC',77);st.assets.add('GBP/USD OTC');
  wsEvents.framesent({payload:JSON.stringify({name:'sendMessage',msg:{name:'get-candles',version:'2.0',body:{active_id:77,size:60}}})});
  assert.equal(st.pageActiveId,77,'visible broker tab selection must still be tracked');
  assert.equal(st.activeId,77);
  assert.equal(st.symbol,'GBP/USD OTC');
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
