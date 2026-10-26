import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
test('a healthy passive broker needs no periodic full-page scan, even after repeated one-minute operations; stale feed keeps discovery recovery',async()=>{
 const d=new LocalPlaywrightDriver(),s=d.state('exnova'),now=Date.now(),end=Math.floor(now/60000)*60;
 Object.assign(s,{activeId:76,balanceId:10,balance:100,mode:'demo',balanceSource:'protocol',lastQuoteAt:now,quote:1.1,candleActiveId:76,candleSize:60,lastBaseRequestAt:now,
  candles:Array.from({length:100},(_,i)=>({from:end-(100-i)*60,to:end-(99-i)*60,open:1.1,close:1.1,high:1.1001,low:1.0999})),lastFullDomAt:now-1800000});
 let fullReads=0;
 d.domSnapshot=async()=>{fullReads++};d.refreshSelectedAccount=async()=>{};d.refreshPredictionHistory=async()=>{};d.requestBaseData=async()=>{};d.requestMarketData=async()=>{};
 await d.maintain('exnova');assert.equal(fullReads,0,'healthy websocket/account history must not read the whole page');
 s.lastMaintainAt=0;s.lastQuoteAt=now-10000;await d.maintain('exnova');assert.equal(fullReads,1,'stale recovery retains its existing page discovery');
});
