import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brokerClockView} from '../sentinel-trading-lab/agent/worker/broker-clock-view.mjs';
import {readBrokerTimingFromText} from '../sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs';
const at=Date.parse('2026-10-14T13:41:03-03:00');
const fromPage=()=>({
 ...readBrokerTimingFromText(
 'HORA DE COMPRA\n00:27\nEXPIRAÇÃO\n13:42\nHORA ATUAL: 14 OUTUBRO, 13:41:03 (UTC-3)',
 {nowMs:at,instrumentKind:'digital'}),symbol:'EUR/USD'
});
test('broker-clock selects the REAL Exnova purchase countdown, not the Sentinel prediction window',()=>{
 const timing=fromPage(),v=brokerClockView({timing,now:at});
 assert.equal(v.verified,true,JSON.stringify(v));
 assert.equal(v.kind,'purchase');
 assert.equal(v.purchaseEndsAt,at+27000);
 assert.equal(v.timeSeconds,13*3600+41*60+3);
 const tenLater=brokerClockView({timing,now:at+4000});
 assert.equal(tenLater.purchaseEndsAt,at+27000);
 assert.equal(tenLater.kind,'purchase');
 assert.equal(brokerClockView({timing,now:at+8000}).kind,'unavailable');
});
test('an authenticated broker timeSync alone displays BROKER TIME, not a fake purchase period',()=>{
 const timing={brokerClock:{verified:true,source:'broker-protocol-timesync',
  brokerNowMs:at-18000,capturedAt:at}};
 const v=brokerClockView({timing,now:at+1500});
 assert.equal(v.kind,'time');
 assert.equal(v.verified,true);
 assert.ok(v.wallTimeMs===at-18000+1500);
 assert.equal(brokerClockView({timing,now:at+31000}).verified,false);
});
test('a stale or unobserved broker clock is NOT replaced by local prediction timer',()=>{
 assert.equal(brokerClockView({timing:null,now:at}).verified,false);
 assert.equal(brokerClockView({timing:{brokerClock:{verified:false}},now:at}).kind,'unavailable');
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/if\(brokerMode\)\{/);
 assert.match(driver,/view\.kind==='purchase'/);
 assert.match(driver,/shown='—:—'/);
 assert.match(driver,/ATÉ FECHAR COMPRA · CORRETORA/);
 assert.match(driver,/payload\.brokerClockView=brokerClockView/);
 assert.doesNotMatch(driver,/payload\.clockMode==='broker'&&!s\.pendingBrokerTimeScan/);
 assert.match(driver,/payload\.brokerTiming=this\.liveStatus\(provider\)\.brokerTiming/);
});
test('startup never opens IQ Option or Exnova without an explicit Corretora click',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const tray=readFileSync(new URL('../sentinel-trading-lab/agent/worker/tray-host.ps1',import.meta.url),'utf8');
 const install=readFileSync(new URL('../sentinel-trading-lab/public/downloads/install-agent-v88.ps1',import.meta.url),'utf8');
 assert.doesNotMatch(worker,/bootstrapSavedBrokers\(/);
 assert.match(worker,/p\.action==='login'&&method==='POST'/);
 assert.match(tray,/Broker%20Connection/);
 assert.match(install,/console\?tab=Broker%20Connection/);
 assert.doesNotMatch(install,/Start-Process\s+['"]https:\/\/iqoption/);
 assert.doesNotMatch(install,/Start-Process\s+['"]https:\/\/exnova/);
});
