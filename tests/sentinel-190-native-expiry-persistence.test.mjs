import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
test('190: last explicit native expiry is durable outside browser tabs and frames',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-expiry-choice-'));
 try{
  const first=new LocalPlaywrightDriver({dataDir:dir});
  await first.nativeExpiryPreferenceReady;
  assert.equal(await first.setNativeExpiryPreference('exnova',60000,{preserveExisting:false}),true);
  const second=new LocalPlaywrightDriver({dataDir:dir});
  await second.nativeExpiryPreferenceReady;
  assert.equal(second.nativeExpiryPreferences.get('exnova'),60000);
  await second.setNativeExpiryPreference('exnova',30000,{preserveExisting:true});
  assert.equal(second.nativeExpiryPreferences.get('exnova'),60000,'old automatic 30s fallback must not replace 1m');
  await second.setNativeExpiryPreference('exnova',30000,{preserveExisting:false});
  const third=new LocalPlaywrightDriver({dataDir:dir});
  await third.nativeExpiryPreferenceReady;
  assert.equal(third.nativeExpiryPreferences.get('exnova'),30000,'genuine manual 30s remains selectable');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
