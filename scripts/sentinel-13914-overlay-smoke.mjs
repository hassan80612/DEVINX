import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Keep the browser's simulated time advancing with the real Agent clock.
 // Freezing the page at at+100 made fresh Node-side broker samples appear
 // to come from the future, incorrectly failing the synchronization test.
 const at=Date.now();await page.clock.install({time:at});
 await page.setContent('<html><body style="background:#18282a">Local broker fixture</body></html>');
 const d=new LocalPlaywrightDriver(),session={page,background:false,lastBrokerTimeScanAt:Date.now()};
 d.session=async()=>session;
 const st=d.state('exnova');Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76});
 const time=()=>Date.now();
 const base={asset:'EUR/USD OTC',validatedAsset:'EUR/USD OTC',assetValidated:true,
  analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.14',price:1.1,
  engine:'automatic',durationMs:30000,clockMode:'broker',uiLanguage:'pt',
  vnext:{mode:'now',engineId:'automatic',expirySeconds:30,
   opportunityWindow:{phase:'scanning',windowStartedAt:null,windowEndsAt:0},
   nowObservation:{side:null,provisionalSide:'CALL',observedAt:time(),evaluatedAt:time()}}};
 const update=async input=>{
  // Every overlay refresh must carry a current, not artificially expired,
  // price observation. Keep the live clock strict and test real freshness.
  input.vnext.nowObservation.observedAt=Date.now();
  input.vnext.nowObservation.evaluatedAt=Date.now();
  session.lastBrokerTimeScanAt=Date.now();
  st.brokerTiming={brokerClock:{verified:true,source:'visible-broker-clock',
   capturedAt:Date.now(),clockSeconds:13*3600+10*60+15}};
  assert.equal(await d.updateOverlay('exnova',input),true);
 };
 await update(base);
 const label=page.locator('[data-sentinel-decision-label]');
 assert.equal(await label.innerText(),'ANALISANDO POSSÍVEL CALL');
 assert.match(await page.locator('[data-sentinel-broker-clock-status]').innerText(),/SINCRONIZADO/);
 const put=structuredClone(base);put.vnext.nowObservation.provisionalSide='PUT';
 await update(put);assert.equal(await label.innerText(),'ANALISANDO POSSÍVEL PUT');
 const locked=structuredClone(put);
 const entryTime=Date.now();
 locked.vnext.opportunityWindow={phase:'fired',windowStartedAt:entryTime-10000,windowEndsAt:entryTime+20000};
 locked.vnext.futureEntryAnchor={engineId:'automatic',asset:base.asset,side:'CALL',
  delaySeconds:30,holdingSeconds:30,issuedAt:entryTime-10000,entryAt:entryTime-10000,
  entryTriggeredAt:entryTime-10000,exitAt:entryTime+20000,projectedEntryPrice:1.1};
 await update(locked);assert.equal(await label.innerText(),'OPERAÇÃO EM ANDAMENTO · ↑ CALL');
 const countdown=await page.locator('[data-sentinel-vnext-clock-value]').innerText();
 assert.match(countdown,/^00:(?:1[8-9]|20)$/,'The verified 20-second broker countdown must be visible and fresh');
 const labelBounds=await label.evaluate(el=>({width:el.scrollWidth,available:el.parentElement.clientWidth}));
 assert.ok(labelBounds.width<=labelBounds.available,JSON.stringify(labelBounds));
 await page.clock.runFor(21000);
 assert.doesNotMatch(await label.innerText(),/OPERAÇÃO EM ANDAMENTO/);
 assert.deepEqual(errors,[]);
 console.log('PASS: actual PC overlay flips provisional direction, locks confirmed CALL, expires without freeze and displays verified broker clock.');
}finally{await browser.close();}
