import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {lastTrustedExpiryForResume} from '../sentinel-trading-lab/agent/worker/native-expiry-resume-228.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick,
  verifyBrokerExpiryForOrder} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {browser} from './helpers/broker-expiry-browser.mjs';

test('238: legacy 30s timestamp is NOT evidence of an explicit 30s user choice',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-238-expiry-'));
 try{
  const selectedAt=Date.now()-5000;
  writeFileSync(join(dir,'native-expiry-preferences.json'),
   JSON.stringify({exnova:{durationMs:30000,selectedAt}}));
  const driver=new LocalPlaywrightDriver({dataDir:dir});
  await driver.nativeExpiryPreferenceReady;
  assert.equal(driver.nativeExpiryPreferences.get('exnova'),30000);
  assert.notEqual(driver.nativeExpiryExplicitThirty.get('exnova'),true);
  assert.equal(lastTrustedExpiryForResume({nativeDurationMs:30000,
   nativeSelectedAt:selectedAt,nativeExplicit30:false,currentDurationMs:60000}),null);
  assert.equal(lastTrustedExpiryForResume({nativeDurationMs:30000,
   nativeSelectedAt:selectedAt,nativeExplicit30:false,currentDurationMs:300000}),null);
  await driver.setNativeExpiryPreference('exnova',60000,{preserveExisting:false});
  let record=JSON.parse(readFileSync(join(dir,'native-expiry-preferences.json'),'utf8')).exnova;
  assert.equal(record.durationMs,60000);
  assert.equal(record.explicit30,false);
  const loaded=new LocalPlaywrightDriver({dataDir:dir});
  await loaded.nativeExpiryPreferenceReady;
  assert.equal(loaded.nativeExpiryPreferences.get('exnova'),60000);
  assert.notEqual(loaded.nativeExpiryExplicitThirty.get('exnova'),true);
 }finally{rmSync(dir,{force:true,recursive:true})}
});

test('241: stored native 30s may remain native but cannot silently replace Sentinel selected 1m on restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-238-manual-'));
 try{
  const driver=new LocalPlaywrightDriver({dataDir:dir});
  await driver.nativeExpiryPreferenceReady;
  await driver.setNativeExpiryPreference('iq_option',30000,{preserveExisting:false});
  const record=JSON.parse(readFileSync(join(dir,'native-expiry-preferences.json'),'utf8')).iq_option;
  assert.equal(record.durationMs,30000);
  assert.equal(record.explicit30,true);
  const restart=new LocalPlaywrightDriver({dataDir:dir});
  await restart.nativeExpiryPreferenceReady;
  assert.equal(restart.nativeExpiryExplicitThirty.get('iq_option'),true);
  assert.equal(lastTrustedExpiryForResume({nativeDurationMs:30000,
   nativeSelectedAt:record.selectedAt,nativeExplicit30:true,currentDurationMs:60000}),null);
  assert.equal(lastTrustedExpiryForResume({nativeDurationMs:30000,
    nativeSelectedAt:record.selectedAt,nativeExplicit30:true,currentDurationMs:30000}),null);
 }finally{rmSync(dir,{force:true,recursive:true})}
});

test('238: native page reset to 30s is seen immediately on attempted 1m entry',()=>{
 const b=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  b.step();b.step();
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs,60000);
  // Broker silently resets between the normal 2.5s polls and the order.
  b.control._text='30 s';
  const inspected=inspectNativeExpiryBeforeClick({requiredDurationMs:60000});
  assert.equal(inspected.currentMs,30000);
  assert.equal(inspected.blocked,true);
  assert.equal(verifyBrokerExpiryForOrder({inspection:inspected,
   requiredDurationMs:60000}).allowed,false);
  assert.equal(b.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),
   '60000','broker rollback must not overwrite user choice');
 }finally{b.restore()}
});

test('238: click checks fresh native picker before broker submits CALL/PUT',()=>{
 const root=new URL('../sentinel-trading-lab/agent/worker/',import.meta.url);
 const src=readFileSync(new URL('broker-ui-executor.mjs',root),'utf8');
 const click=src.indexOf('async execute(provider,order)');
 const direct=src.indexOf('c.frame.evaluate(inspectNativeExpiryBeforeClick',click);
 const observed=src.indexOf('c.frame.evaluate(observeNativeExpiryForClick',click);
 const checked=src.indexOf('verifyBrokerExpiryForOrder(',click);
 const submit=src.indexOf('this.attempt=attempt;',click);
 assert.ok(click>=0&&direct>click&&observed>direct&&checked>observed&&submit>checked);
 assert.match(src,/measuredOnClickFrame:true/);
 const worker=readFileSync(new URL('index.mjs',root),'utf8');
 assert.match(worker,/nativeExplicit30:explicitlySelected30/);
 assert.match(worker,/stored===30000&&savedRuntimeExpirySeed>30000/);
 assert.match(worker,/savedRuntimeExpirySeed>30000/);
 // The last choice remains the actual analyst duration in operation context.
 assert.match(worker,/durationMs:Number\(runtime.settings.orderDurationMs\)/);
});
