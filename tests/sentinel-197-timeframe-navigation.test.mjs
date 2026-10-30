import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const src=path=>readFileSync(new URL('../sentinel-trading-lab/agent/worker/'+path,import.meta.url),'utf8');

test('197: restored main frame and embedded frame receive chart preference after navigation',()=>{
 const driver=src('local-playwright-driver.mjs');
 assert.match(driver,/page\.on\('framenavigated',installFrame\)/);
 assert.match(driver,/page\.on\('domcontentloaded',\(\)=>installFrame\(page\.mainFrame\(\)\)\)/);
 assert.match(driver,/const installFrame=frame=>\{/);
 assert.match(driver,/allowEmbedded:frame!==page\.mainFrame\(\)/);
 assert.match(driver,/frame\.evaluate\(installBrokerChartPeriodKeeper,chart\)/);
 assert.match(driver,/frame\.evaluate\(installBrokerNativeExpiryKeeper,expiry\)/);
 assert.doesNotMatch(driver,/page\.reload\(\)/);
});
test('197: durable manual chart selection survives Agent restart; untouched expiry remains independent',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-197-durable-'));
 try{
  const first=new LocalPlaywrightDriver({dataDir:dir});
  await Promise.all([first.chartPeriodPreferenceReady,first.nativeExpiryPreferenceReady]);
  await first.rememberChartPeriodChoice('exnova',300,Date.now());
  await first.setNativeExpiryPreference('exnova',60000,{preserveExisting:false});
  const second=new LocalPlaywrightDriver({dataDir:dir});
  await Promise.all([second.chartPeriodPreferenceReady,second.nativeExpiryPreferenceReady]);
  assert.equal(second.chartPeriodPreferences.get('exnova').seconds,300);
  assert.equal(second.nativeExpiryPreferences.get('exnova'),60000);
  await second.rememberChartPeriodChoice('exnova',60,Date.now()+1000);
  const third=new LocalPlaywrightDriver({dataDir:dir});
  await Promise.all([third.chartPeriodPreferenceReady,third.nativeExpiryPreferenceReady]);
  assert.equal(third.chartPeriodPreferences.get('exnova').seconds,60);
  assert.equal(third.nativeExpiryPreferences.get('exnova'),60000);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('197: revision 7 tracks actual chart control only; expiry remains its own rev 17',()=>{
 const chart=src('broker-chart-period-keeper.mjs');
 const expiry=src('broker-native-expiry-keeper.mjs');
 assert.match(chart,/revision:7/);
 assert.match(chart,/window\.top!==window/);
 assert.match(chart,/requestedSeconds/);
 assert.match(expiry,/revision:17/);
});
