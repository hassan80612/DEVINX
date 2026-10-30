import test from 'node:test';import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const newIsolatedDriver=()=>new LocalPlaywrightDriver({dataDir:mkdtempSync(join(tmpdir(),'sentinel-native-expiry-test-'))});

import {observeNativeExpiryForClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
for(const [name,receipts,expected] of [
 ['newest manual choice across frames',[{value:30000,selectedAt:10},{value:60000,selectedAt:20}],60000],
 ['explicit manual 30s after 5m',[{value:300000,selectedAt:10},{value:30000,selectedAt:20,explicitDefault:true}],30000],
 ['inherited default cannot dominate a saved non-default choice',[{value:30000,selectedAt:0},{value:300000,selectedAt:0}],300000]
])test(name,async()=>{
 const received=[],frames=receipts.map(receipt=>({evaluate:async(fn,arg)=>{if(fn.name==='updateBrokerNativeExpiryPreference'){received.push(arg);return true;}return receipt;}}));
 const d=newIsolatedDriver();await d.nativeExpiryPreferenceReady;d.sessions.set('exnova',{page:{frames:()=>frames,isClosed:()=>false}});await d.setNativeExpiryPreference('exnova',60000);
 assert.equal(d.nativeExpiryPreferences.get('exnova'),expected);assert.ok(received.every(x=>x.preferredMs===expected));
});
test('cached read-only expiry evidence can come from the mapped child frame; conflicting or stale frames never invent a value',()=>{
 const old=globalThis.window,now=Date.now();try{
  globalThis.window={__sentinelNativeExpiryKeeperV3:{revision:16,snapshot:()=>({preferredMs:60000,currentMs:null})},__sentinelNativeExpiryReportsV1:{a:{id:'a',provider:'exnova',at:now,currentMs:60000,mappingStatus:'mapped'}}};
  assert.equal(observeNativeExpiryForClick({provider:'exnova',requiredDurationMs:60000}).currentMs,60000);
  window.__sentinelNativeExpiryReportsV1.b={id:'b',provider:'exnova',at:now,currentMs:30000,mappingStatus:'mapped'};
  const ambiguous=observeNativeExpiryForClick({provider:'exnova',requiredDurationMs:60000});assert.equal(ambiguous.currentMs,null);assert.equal(ambiguous.blocked,false);
  window.__sentinelNativeExpiryReportsV1={a:{id:'a',provider:'exnova',at:now-10000,currentMs:60000}};assert.equal(observeNativeExpiryForClick({provider:'exnova'}).currentMs,null);
 }finally{globalThis.window=old;}
});
