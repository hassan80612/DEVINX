import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brokerClockView} from '../sentinel-trading-lab/agent/worker/broker-clock-view.mjs';
import {entryOffsets,planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
const T=Date.parse('2026-10-14T13:40:00-03:00');
const read=x=>readFileSync(new URL('../sentinel-trading-lab/'+x,import.meta.url),'utf8');

test('13.7.7: signal follows the already verified broker expiration, NOT next 30s forecast window',()=>{
 const expiry=T+81000,trigger=T+20000;
 const pin={phase:'fired',entryTriggeredAt:trigger,brokerExpiresAt:expiry,exitAt:expiry};
 const first=brokerClockView({now:trigger,windowState:pin,timing:{
  brokerClock:{verified:true,source:'broker-protocol-timesync',brokerNowMs:trigger-1500,capturedAt:trigger},
  source:'broker-visible-readonly',capturedAt:trigger,
  purchaseWindow:{closesAt:trigger+27000}}});
 assert.equal(first.kind,'expiry','after SIGNAL, actual expiry outranks the purchase cutoff');
 assert.equal(first.expiresAt,expiry);
 const nextWindowClock=brokerClockView({now:trigger+50000,windowState:pin,timing:null});
 assert.equal(nextWindowClock.kind,'expiry','new analysis window or stale timeSync cannot invent another expiration');
 assert.equal(nextWindowClock.remainingMs,11000);
 const finished=brokerClockView({now:expiry,windowState:pin,timing:null});
 assert.equal(finished.kind,'expired');
 assert.equal(finished.remainingMs,0);
 assert.equal(brokerClockView({now:expiry+37000,windowState:pin,timing:null}).kind,'expired');
 assert.equal(finished.tradeExecutionObserved,false,'issuing CALL/PUT never claims proof of broker trade execution');
});
test('clock chooser never sends settings action or gets overwritten by delayed render frames',()=>{
 const source=read('agent/worker/local-playwright-driver.mjs');
 const renderAt=source.indexOf('const render=(d)=>');
 const clockState=source.indexOf("const clockKey='sentinel-broker-clock-display-mode-v1'",renderAt);
 const payload=source.indexOf('window.__sentinelLastOverlayData=d;',renderAt);
 assert.ok(renderAt>=0&&clockState>renderAt&&clockState<payload,
  'local clock choice is applied BEFORE accepting server frame');
 const selectAt=source.indexOf('const clockSelect=ev.target?.closest?');
 const selectedBlock=source.slice(selectAt,selectAt+950);
 assert.match(selectedBlock,/window\.__sentinelClockDisplayMode=next/);
 assert.match(selectedBlock,/localStorage\.setItem\('sentinel-broker-clock-display-mode-v1',next\)/);
 assert.match(selectedBlock,/sendAction\(\{action:'setting',key:'clockMode'/);
 assert.match(source,/window\.__sentinelLastClockModeSync!==selectedClock/);
 assert.match(source,/s\.lastVerifiedBrokerSignal=\{phase:'fired'/);
 assert.match(source,/s\.brokerClockSignalAsset!==selectedAsset/);
 assert.match(source,/SINAL · VENCIMENTO ATINGIDO/);
 assert.ok(source.includes("shown=pad(Math.floor(left/60))+':'+pad(left%60)"),
  'the broker-synchronized clock displays the remaining actual expiration');
});
test('single browser opening belongs to Go launcher; PowerShell never opens another page',()=>{
 const go=read('agent-launcher.go');
 const install=read('public/downloads/install-agent-v88.ps1');
 const updater=read('agent/worker/install-agent-update.ps1');
 assert.equal(install,updater);
 const matches=[...go.matchAll(/_ = exec\.Command\("rundll32\.exe", "url\.dll,FileProtocolHandler", "([^"]+)"\)\.Start\(\)/g)];
 assert.equal(matches.length,1);
 assert.equal(matches[0][1],'https://trading.devinx.com.br/console?tab=Broker%20Connection');
 assert.doesNotMatch(install,/Start-Process\s+['"]https:\/\/sentinel-trading-lab\.vercel\.app/);
 assert.doesNotMatch(updater,/Start-Process\s+['"]https:\/\/sentinel-trading-lab\.vercel\.app/);
});
test('Continuous prefers earliest comparably STRONG qualified entry; not a fixed 6-candle wait',()=>{
 const offsets=entryOffsets(30);
 const settings={asset:'EUR/USD',engine:'automatic',forecastMode:'continuous',orderDurationMs:30000};
 const early=planEntryWindow({now:T,windowSeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:settings.asset,
  evaluateLead:seconds=>({side:'CALL',
   projectedEntryPrice:1.1,projectedExitPrice:1.101,
   selectionStrength:seconds===offsets.at(-1)?1.04:1.02})});
 assert.equal(early.entryOffsetSeconds,offsets[0]);
 const clearlyBetterLate=planEntryWindow({now:T,windowSeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:settings.asset,
  evaluateLead:seconds=>({side:'CALL',
   projectedEntryPrice:1.1,projectedExitPrice:1.101,
   selectionStrength:seconds===offsets.at(-1)?1.8:1.0})});
 assert.equal(clearlyBetterLate.entryOffsetSeconds,offsets.at(-1),
   'cannot sacrifice materially better future setup for early signal');
 const conflicting=planEntryWindow({now:T,windowSeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:settings.asset,
  evaluateLead:seconds=>({side:seconds===offsets[0]?'PUT':'CALL',
   projectedEntryPrice:1.1,projectedExitPrice:seconds===offsets[0]?1.099:1.101,
   selectionStrength:seconds===offsets[0]?1.04:1.05})});
 assert.equal(conflicting.side,'CALL','do not replace strongest side with earlier OPPOSITE side');
});
