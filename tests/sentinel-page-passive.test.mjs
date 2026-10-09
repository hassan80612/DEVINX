import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

test('live broker page has no CDP network observers',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const page={on(){throw new Error('Attaching to broker page traffic is forbidden')}};
  driver.attachNetwork('iq_option',page);
  driver.attachNetwork('iq_option',page);
  assert.equal(page.__sentinelAttached,true);
  assert.equal(driver.state('iq_option').pageNetworkTap,'disabled');
});

test('independent direct feed still updates the selected market price',()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  const st=driver.state('iq_option');
  st.activeId=76;st.symbol='EUR/USD OTC';
  driver.ingest('iq_option',{name:'quote-generated',msg:[{active_id:76,price:1.123456,time:1791580300}]},'direct-in');
  assert.equal(st.quote,1.123456);
  assert.equal(st.quoteHistory.at(-1).price,1.123456);
  assert.equal(st.lastQuoteAt,1791580300000);
});

test('missing independent market connection cannot inject commands into the trade page',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
  driver.directFeed=async()=>null;
  const rejected=await driver.wsSend('iq_option',{name:'get-balances'});
  assert.deepEqual(rejected,{ok:false,error:'direct_market_feed_unavailable'});
  let called=false;
  driver.directFeed=async()=>({ready:true,send:()=>{called=true;return true;}});
  assert.deepEqual(await driver.wsSend('iq_option',{name:'get-balances'}),{ok:true,transport:'direct-websocket'});
  assert.equal(called,true);
});
