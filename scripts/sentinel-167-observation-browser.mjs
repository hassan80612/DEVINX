// Isolated overlay: no broker session and no order controls.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {entryObservationStatus} from '../sentinel-trading-lab/agent/src/core/entry-observation-status.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html><body>Isolated overlay test</body></html>'}));
 await page.goto('https://exnova.com/isolated-overlay');page.on('pageerror',e=>errors.push(e.message));
 const driver=new LocalPlaywrightDriver();driver.session=async()=>({page,background:false});
 const payload=reason=>{const now=Date.now();return {engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,
  analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.167',durationMs:60000,price:1.1,
  vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason,observedAt:now,evaluatedAt:now,
   ...entryObservationStatus({candidate:{ready:false,reason},durationMs:60000})}}};};
 const first=payload('impulso-estendido-aguardando-reteste-e-quebra-de-pivo');
 assert.equal(await driver.updateOverlay('exnova',first),true);
 const label=page.locator('[data-sentinel-decision-label]'),detail=page.locator('[data-sentinel-market-phase]');
 assert.equal(await label.textContent(),first.vnext.nowObservation.waitLabel);
 assert.equal(await detail.textContent(),first.vnext.nowObservation.waitDetail);
 // Exercise the local clock path without rebuilding the overlay DOM.
 const second=payload('candidato-de-impulso-expirado');
 await page.evaluate(data=>{window.__sentinelLastOverlayData=data;document.getElementById('sentinel-trading-overlay-host').shadowRoot.getElementById('sentinel-trading-overlay').__sentinelTargetClockTick();},second);
 await page.waitForFunction(expected=>document.getElementById('sentinel-trading-overlay-host').shadowRoot.querySelector('[data-sentinel-decision-label]')?.textContent===expected,second.vnext.nowObservation.waitLabel);
 assert.equal(await detail.textContent(),second.vnext.nowObservation.waitDetail);
 assert.deepEqual(errors,[]);console.log('overlay: specific wait label and detail, live transition, no page errors');
}finally{await browser.close();}
