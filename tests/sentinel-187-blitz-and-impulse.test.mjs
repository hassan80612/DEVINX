import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectVisibleBrokerTab} from '../sentinel-trading-lab/agent/worker/visible-broker-tab.mjs';
import {recoverAlreadyOpenMarket} from '../sentinel-trading-lab/agent/worker/broker-initial-market-recovery.mjs';
import {reviewLateImpulseEntry} from '../sentinel-trading-lab/agent/src/core/late-impulse-admission.mjs';
test('Exnova Blitz tab with no active CSS marker is selected when unique',()=>{
 assert.equal(selectVisibleBrokerTab([{symbol:'EUR/GBP',selected:false},{symbol:'EUR/GBP',selected:false}]),'EUR/GBP');
 assert.equal(selectVisibleBrokerTab([{symbol:'EUR/GBP',selected:false},{symbol:'AUD/CAD',selected:false}]),null);
 assert.equal(selectVisibleBrokerTab([{symbol:'EUR/GBP',selected:true},{symbol:'AUD/CAD',selected:false}]),'EUR/GBP');
});
test('missing active_id does not repeatedly query broker initialization',async()=>{
 const st={symbol:'EUR/GBP',activeId:null,assetValidated:false},calls=[];
 const driver={state:()=>st,liveStatus:()=>st,syncVisibleAsset:async()=>true,requestBaseData:async()=>{calls.push('catalog')}};
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova'}),false);
 assert.equal(await recoverAlreadyOpenMarket({driver,provider:'exnova'}),false);
 assert.deepEqual(calls,['catalog']);
});
const T=1800000000000;
function prices({burst=false,mirror=false}={}){
 const rows=[];
 for(let i=0;i<=56;i++){
  const ts=T-14000+i*250,baseline=100+i*0.00020;
  const spike=i>=47?(i-47)*0.007:0;
  const value=burst?baseline+spike:baseline;
  rows.push({ts,price:mirror?200-value:value,receivedAt:ts});
 }
 return rows;
}
test('a terminal CALL/PUT surge is not evidence for 30s/1m continuation',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const quoteHistory=prices({burst:true,mirror}),price=quoteHistory.at(-1).price,side=mirror?'PUT':'CALL';
  const candidate={ready:true,side,reason:'closed-structure-and-live-impulse'};
  const out=reviewLateImpulseEntry({candidate,quoteHistory,price,quoteAt:T,now:T,durationMs});
  assert.equal(out.ready,false,JSON.stringify(out));
  assert.equal(out.reason,'late-impulse-spike-without-horizon-persistence');
 }
});
test('normal trend, true structural reversal and 5m keep existing entry rules',()=>{
 const tape=prices({burst:false}),price=tape.at(-1).price,candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 assert.equal(reviewLateImpulseEntry({candidate,quoteHistory:tape,price,quoteAt:T,now:T,durationMs:60000}),candidate);
 const peak=prices({burst:true});
 assert.equal(reviewLateImpulseEntry({candidate:{...candidate,reason:'historical-level-rejection'},quoteHistory:peak,price:peak.at(-1).price,quoteAt:T,now:T,durationMs:60000}).ready,true);
 assert.equal(reviewLateImpulseEntry({candidate,quoteHistory:peak,price:peak.at(-1).price,quoteAt:T,now:T,durationMs:300000}),candidate);
 assert.equal(reviewLateImpulseEntry({candidate,quoteHistory:[],price,quoteAt:T,now:T,durationMs:60000}),candidate);
});
test('shared engine uses the admission rule BEFORE firing; tab read is bounded',()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const runtime=readFileSync(new URL('agent/src/core/runtime.mjs',root),'utf8');
 const driver=readFileSync(new URL('agent/worker/local-playwright-driver.mjs',root),'utf8');
 assert.match(runtime,/eligible=reviewLateImpulseEntry\(\{candidate:eligible/);
 assert.match(driver,/slice\(0,140\)\.flatMap/);
 assert.match(driver,/deferMarketFetch:true/);
});
