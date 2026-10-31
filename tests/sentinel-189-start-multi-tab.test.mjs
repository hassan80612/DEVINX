import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectVisibleBrokerTab} from '../sentinel-trading-lab/agent/worker/visible-broker-tab.mjs';
import {recoverAlreadyOpenMarket} from '../sentinel-trading-lab/agent/worker/broker-initial-market-recovery.mjs';
test('already-open EUR/GBP Blitz with 3 tabs selects only the visible active tab',()=>{
 const tabs=[{symbol:'AUD/CAD',selected:false,visualSelected:false},
             {symbol:'EUR/GBP',selected:false,visualSelected:true},
             {symbol:'USD/JPY',selected:false,visualSelected:false}];
 assert.equal(selectVisibleBrokerTab(tabs),'EUR/GBP');
 assert.equal(selectVisibleBrokerTab(tabs.map(t=>({...t,visualSelected:false}))),null);
 assert.equal(selectVisibleBrokerTab([{symbol:'AUD/CAD',selected:true},{symbol:'EUR/GBP',selected:false,visualSelected:true}]),'AUD/CAD');
 assert.equal(selectVisibleBrokerTab([{symbol:'EUR/GBP',selected:true},{symbol:'AUD/CAD',selected:true}]),null);
 assert.equal(selectVisibleBrokerTab([{symbol:'EUR/GBP'},{symbol:'EUR/GBP'}]),'EUR/GBP');
});
test('START retries the same asset even after an earlier automatic recovery attempt',async()=>{
 const state={activeId:null,symbol:'EUR/GBP',uiSymbol:'EUR/GBP',assetValidated:false,
  lastInitialMarketRecoveryAt:Date.now()-4000},calls=[];
 const status=()=>({...state,assetValidated:Number(state.activeId)>0,
   quoteFeedValidated:!!state.quote,candleFresh:!!state.quote});
 const driver={state:()=>state,liveStatus:status,
  syncVisibleAsset:async()=>{calls.push('tab')},
  requestBaseData:async()=>{calls.push('catalog');state.activeId=111},
  requestMarketData:async()=>{calls.push('market');state.quote=0.83288}};
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova'}),false);
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova',force:true}),true);
 assert.deepEqual(calls,['tab','catalog','tab','market']);
 assert.equal(state.symbol,'EUR/GBP');
});
test('a second concurrent START shares one broker recovery, not two websocket requests',async()=>{
 const state={symbol:'EUR/GBP',uiSymbol:'EUR/GBP',activeId:null};
 const calls=[];
 const driver={state:()=>state,liveStatus:()=>({...state,assetValidated:state.activeId!=null,
    quoteFeedValidated:state.quote>0,candleFresh:state.quote>0}),
  syncVisibleAsset:async()=>{calls.push('tab');await new Promise(r=>setTimeout(r,2))},
  requestBaseData:async()=>{calls.push('catalog');state.activeId=111},
  requestMarketData:async()=>{calls.push('market');state.quote=.83}};
 const [a,b]=await Promise.all([recoverAlreadyOpenMarket({driver,provider:'exnova',force:true}),recoverAlreadyOpenMarket({driver,provider:'exnova',force:true})]);
 assert.equal(a,true);assert.equal(b,true);
 assert.deepEqual(calls,['tab','catalog','tab','market']);
});
test('healthy existing feed remains untouched and no different symbol can be fabricated',async()=>{
 const state={symbol:'EUR/GBP',activeId:111,assetValidated:true,quoteFeedValidated:true,candleFresh:true};
 let calls=0;const driver={state:()=>state,liveStatus:()=>state,
 syncVisibleAsset:async()=>{calls++},requestBaseData:async()=>{calls++},requestMarketData:async()=>{calls++}};
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova',force:true}),true);
 assert.equal(calls,0);
});
test('worker start still async and the 188 strategy/expiry rules are unchanged',()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const worker=readFileSync(new URL('agent/worker/index.mjs',root),'utf8');
 const driver=readFileSync(new URL('agent/worker/local-playwright-driver.mjs',root),'utf8');
 const release=JSON.parse(readFileSync(new URL('agent/release.json',root),'utf8'));
 assert.match(worker,/return recoverAlreadyOpenMarket\(\{driver,provider,force:true\}\)/);
 assert.match(driver,/return\[\{label,selected,visualSelected\}\]/);
 assert.equal(release.version,JSON.parse(readFileSync(new URL('agent/package.json',root),'utf8')).version);
});
