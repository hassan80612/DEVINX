import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRetryAlreadyOpenMarket,recoverAlreadyOpenMarket}
 from '../sentinel-trading-lab/agent/worker/broker-initial-market-recovery.mjs';

const incomplete={activeId:null,symbol:'EUR/GBP',uiSymbol:'EUR/GBP',
 assetValidated:false,quoteFeedValidated:false,analysisFeedValidated:false,candleFresh:false};
const ready={...incomplete,activeId:111,assetValidated:true,quoteFeedValidated:true,
 analysisFeedValidated:true,candleFresh:true};
test('START retries current selected Exnova tab after a late catalog without any asset click',async()=>{
 const st={...incomplete,lastInitialMarketRecoveryAt:0},calls=[];
 let baseCount=0,expiry=60000;
 const driver={
  state:()=>st,
  liveStatus:()=>({...st}),
  syncVisibleAsset:async()=>{calls.push('read-existing-visible-tab')},
  requestBaseData:async()=>{
   calls.push('request-catalog');baseCount++;
   if(baseCount===2)st.activeId=111;
   return true;
  },
  requestMarketData:async()=>{
   calls.push('request-existing-market');
   assert.equal(st.symbol,'EUR/GBP','never switch the current broker instrument');
   assert.equal(st.activeId,111);
   st.quote=0.83288;st.quoteFeedValidated=true;st.analysisFeedValidated=true;st.candleFresh=true;
   return true;
  }
 };
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova',force:true}),false);
 assert.equal(st.symbol,'EUR/GBP');assert.equal(st.activeId,null);
 assert.equal(shouldRetryAlreadyOpenMarket({running:true,connected:true,market:driver.liveStatus('exnova'),
  lastAttemptAt:100000,now:105001}),true);
 st.lastInitialMarketRecoveryAt=Date.now()-6000;
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova',force:true}),true);
 assert.deepEqual(calls,[
  'read-existing-visible-tab','request-catalog','read-existing-visible-tab',
  'read-existing-visible-tab','request-catalog','read-existing-visible-tab','request-existing-market'
 ]);
 assert.equal(expiry,60000,'the broker native expiration is not changed by market recovery');
 assert.equal(st.symbol,'EUR/GBP');
 assert.equal(st.activeId,111);
});
test('no market recovery when stopped, disconnected, closed, ambiguous tab, or fully healthy',()=>{
 const config={running:true,connected:true,market:incomplete,lastAttemptAt:100000,now:105001};
 assert.equal(shouldRetryAlreadyOpenMarket(config),true);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,now:104999}),false);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,running:false}),false);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,connected:false}),false);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,market:{...incomplete,marketStatus:'closed'}}),false);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,market:{...incomplete,screenCandidateSymbol:'USD/JPY'}}),false);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,market:ready}),false);
});
test('valid identity with stale history retries less often and preserves independent expiry',()=>{
 const partial={...ready,quoteFeedValidated:true,analysisFeedValidated:false,candleFresh:false};
 const config={running:true,connected:true,market:partial,lastAttemptAt:100000,now:106000};
 assert.equal(shouldRetryAlreadyOpenMarket(config),false);
 assert.equal(shouldRetryAlreadyOpenMarket({...config,now:110000}),true);
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const worker=readFileSync(new URL('agent/worker/index.mjs',root),'utf8');
 assert.match(worker,/retryAlreadyOpenMarketIfMissing\(loopNow\)/);
 assert.match(worker,/return recoverAlreadyOpenMarket\(\{driver,provider,force:true\}\)/);
 assert.match(worker,/alreadyOpenMarketRecoveryAt\.set\(provider,Date\.now\(\)\)/);
 assert.doesNotMatch(worker,/await retryAlreadyOpenMarketIfMissing/);
 const chart=readFileSync(new URL('agent/worker/broker-chart-period-keeper.mjs',root),'utf8');
 const expiry=readFileSync(new URL('agent/worker/broker-native-expiry-keeper.mjs',root),'utf8');
 assert.match(chart,/revision:6/);
 assert.match(expiry,/revision:17/);
});
